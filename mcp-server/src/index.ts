import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { applyCommand, applyCommands, parseCommands } from '@/application/commands';
import { exportDiagram } from '@/application/diagram-export';
import { DataModel, type FieldType } from '@/domain/data-model';
import { ProjectDoc } from '@/domain/project-doc';
import { parseProjectDoc } from '@/domain/schema';
import {
  generateProject,
  generateRemixProject,
  generateSvelteProject,
  generateVueProject,
  type GeneratedFile,
} from '@/generator';
import { api, type ApiProject } from './api-client.js';
import { describeApp } from './describe.js';

/** 生成フレームワークの選択(FR-GEN-07)。react=完全機能 / vue・svelte・remix=UI 層 PoC */
const Framework = z.enum(['react', 'vue', 'svelte', 'remix']).optional();
const genFiles = (doc: ProjectDoc, name: string, framework?: string): GeneratedFile[] => {
  switch (framework) {
    case 'vue':
      return generateVueProject(doc, name);
    case 'svelte':
      return generateSvelteProject(doc, name);
    case 'remix':
      return generateRemixProject(doc, name);
    default:
      return generateProject(doc, name);
  }
};
/** react 以外は生成物が混在しないよう独立ワークスペースでビルドする */
const buildWorkspace = (projectId: string, framework?: string): string =>
  framework && framework !== 'react' ? `${projectId}-${framework}` : projectId;

/**
 * AppForge MCP サーバー(Phase 0: read / generate / build)。
 * ドメイン・ジェネレータは frontend と同一コードを共有し(二重実装しない)、
 * 永続化・ビルドは Rust BE の REST API に委譲する(requirements.md §9)。
 */

const server = new McpServer({ name: 'appforge', version: '0.1.0' });

const text = (value: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    },
  ],
});

const errorText = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  isError: true,
});

const loadDoc = async (projectId: string): Promise<{ project: ApiProject; doc: ProjectDoc }> => {
  const project = await api.getProject(projectId);
  const parsed = parseProjectDoc(project.doc);
  if (!parsed.ok) {
    throw new Error(`ドキュメントのスキーマ検証に失敗しました: ${parsed.error.message}`);
  }
  return { project, doc: parsed.value };
};

server.registerTool(
  'list_projects',
  {
    title: 'プロジェクト一覧',
    description: 'AppForge のプロジェクト一覧(id / 名前 / 更新時刻)を返す',
    inputSchema: {},
  },
  async () => text(await api.listProjects()),
);

server.registerTool(
  'get_project',
  {
    title: 'プロジェクト取得',
    description: 'プロジェクトのドキュメント(ProjectDoc JSON)全体を返す',
    inputSchema: { projectId: z.string().describe('list_projects が返す id') },
  },
  async ({ projectId }) => {
    const { project, doc } = await loadDoc(projectId);
    return text({ id: project.id, name: project.name, updatedAt: project.updated_at, doc });
  },
);

server.registerTool(
  'describe_app',
  {
    title: 'アプリ構造サマリ',
    description:
      'ページ / 画面遷移 / ダイアログ / データモデル(DDD)の構造化サマリを返す。アプリの全体像を把握する最初のツールとして使う',
    inputSchema: { projectId: z.string() },
  },
  async ({ projectId }) => {
    const { project, doc } = await loadDoc(projectId);
    return text(describeApp(project.name, doc));
  },
);

server.registerTool(
  'generate_source',
  {
    title: 'ソース生成',
    description:
      'ビルド可能なアプリのソース一式を生成する。framework=react(既定、完全機能)/ vue/svelte/remix(UI 層 PoC、remix はパスルーティングのためサブパスプレビュー非対応)。filePath 指定でそのファイルの内容、未指定でファイル一覧(path / bytes)を返す',
    inputSchema: {
      projectId: z.string(),
      filePath: z.string().optional().describe('例: src/App.tsx'),
      framework: Framework,
    },
  },
  async ({ projectId, filePath, framework }) => {
    const { project, doc } = await loadDoc(projectId);
    const files = genFiles(doc, project.name, framework);
    if (filePath !== undefined) {
      const file = files.find((f) => f.path === filePath);
      return file ? text(file.content) : errorText(`ファイルがありません: ${filePath}`);
    }
    return text(files.map((f) => ({ path: f.path, bytes: f.content.length })));
  },
);

server.registerTool(
  'build_and_preview',
  {
    title: 'ビルドしてプレビュー',
    description:
      'ソースを生成し、BE のビルドランナーで npm install / 型チェック / vite build を実行する。framework=react(既定)/ vue/svelte/remix。結果・ビルドログ末尾・プレビュー URL を返す(初回は依存取得で時間がかかる)',
    inputSchema: { projectId: z.string(), framework: Framework },
  },
  async ({ projectId, framework }) => {
    const { project, doc } = await loadDoc(projectId);
    // Vue は独立ワークスペースでビルド(React の生成物と混在させない)
    const workspace = buildWorkspace(projectId, framework);
    const result = await api.build(workspace, genFiles(doc, project.name, framework));
    return text({
      ok: result.ok,
      previewUrl: result.ok ? api.previewUrl(workspace) : null,
      log: result.log.slice(-4000),
    });
  },
);

server.registerTool(
  'export_source',
  {
    title: 'ソースをディレクトリへ書き出し',
    description:
      '生成ソース一式を指定ディレクトリへ書き出す。空でないディレクトリへの書き出しは overwrite: true が必要(FR-MCP-03)',
    inputSchema: {
      projectId: z.string(),
      outDir: z.string().describe('絶対パス'),
      overwrite: z.boolean().optional(),
      framework: Framework,
    },
  },
  async ({ projectId, outDir, overwrite, framework }) => {
    if (!path.isAbsolute(outDir)) return errorText('outDir は絶対パスで指定してください');
    const existing = await readdir(outDir).catch(() => null);
    if (existing && existing.length > 0 && overwrite !== true) {
      return errorText(
        `出力先が空ではありません(${existing.length} 件)。上書きするには overwrite: true を指定してください`,
      );
    }
    const { project, doc } = await loadDoc(projectId);
    const files = genFiles(doc, project.name, framework);
    for (const f of files) {
      const target = path.join(outDir, f.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, f.content, 'utf8');
    }
    return text({ written: files.length, outDir });
  },
);

server.registerTool(
  'export_diagrams',
  {
    title: '設計図エクスポート',
    description:
      '中立ドキュメントから設計図を出力する(FR-VIEW-06)。kind: screen-flow(画面遷移図 Mermaid)/ ' +
      'sequence(ユースケースのシーケンス図 Mermaid)/ traceability(レイヤー×機能トレーサビリティ Markdown)',
    inputSchema: {
      projectId: z.string(),
      kind: z.enum(['screen-flow', 'sequence', 'traceability']),
    },
  },
  async ({ projectId, kind }) => {
    const { doc } = await loadDoc(projectId);
    return text(exportDiagram(doc, kind));
  },
);

// ---------- Phase 1: 編集ツール(コマンド層経由) ----------

server.registerTool(
  'create_project',
  {
    title: 'プロジェクト作成',
    description: '空のプロジェクト(ホームページ + 共通ヘッダー/フッター)を新規作成し id を返す',
    inputSchema: { name: z.string() },
  },
  async ({ name }) => {
    const created = await api.createProject(name, ProjectDoc.create());
    return text({ id: created.id, name: created.name });
  },
);

server.registerTool(
  'apply_commands',
  {
    title: 'コマンド適用(編集)',
    description:
      'ドキュメント編集コマンドの配列を順に適用して保存する。GUI と同一のコマンド層・検証を通る。' +
      'コマンド種別: insertNode/moveNode/removeNode/updateNodeProps/setNodeEvents/addPage/removePage/updatePage/' +
      'addDialog/removeDialog/renameDialog/addModel/updateModel/removeModel/addField/updateField/removeField/addRelation/removeRelation。' +
      'expectedUpdatedAt を渡すとエディタ等による競合を検出する(get_project の updatedAt を渡す)',
    inputSchema: {
      projectId: z.string(),
      commands: z.array(z.record(z.string(), z.unknown())).describe('Command の JSON 配列'),
      expectedUpdatedAt: z.number().optional().describe('楽観ロック用(任意)'),
    },
  },
  async ({ projectId, commands, expectedUpdatedAt }) => {
    const { project, doc } = await loadDoc(projectId);
    if (expectedUpdatedAt !== undefined && project.updated_at !== expectedUpdatedAt) {
      return errorText(
        `競合: プロジェクトは別の編集で更新されています(expected ${expectedUpdatedAt}, actual ${project.updated_at})。get_project で再取得してください`,
      );
    }
    const parsed = parseCommands(commands);
    if (!parsed.ok) return errorText(`コマンド検証エラー: ${parsed.error.message}`);
    const result = applyCommands(doc, parsed.value);
    if (!result.ok) return errorText(`コマンド適用エラー: ${result.error.message}`);
    const saved = await api.saveProject(project.id, project.name, result.value.doc);
    return text({ ok: true, created: result.value.created, updatedAt: saved.updated_at });
  },
);

server.registerTool(
  'add_aggregate',
  {
    title: '集約モデル追加(高水準)',
    description:
      'DDD 集約とそのフィールドを一括で追加する便利ツール(内部はコマンド層に展開)。名前/フィールド名はサニタイズされる',
    inputSchema: {
      projectId: z.string(),
      name: z.string().describe('集約名(PascalCase 推奨)'),
      fields: z
        .array(
          z.object({
            name: z.string(),
            type: z.enum(['string', 'number', 'boolean', 'date']).optional(),
            required: z.boolean().optional(),
          }),
        )
        .optional(),
    },
  },
  async ({ projectId, name, fields }) => {
    const { project, doc } = await loadDoc(projectId);
    const count = doc.dataModel.models.length;
    let working = doc;

    const m = applyCommand(working, {
      kind: 'addModel',
      modelKind: 'aggregate',
      x: 60 + (count % 4) * 320,
      y: 60 + Math.floor(count / 4) * 280,
    });
    if (!m.ok) return errorText(m.error.message);
    working = m.value.doc;
    const modelId = m.value.created.modelId!;

    const named = applyCommand(working, { kind: 'updateModel', modelId, patch: { name } });
    if (!named.ok) return errorText(named.error.message);
    working = named.value.doc;

    for (const f of fields ?? []) {
      const af = applyCommand(working, { kind: 'addField', modelId });
      if (!af.ok) return errorText(af.error.message);
      working = af.value.doc;
      const uf = applyCommand(working, {
        kind: 'updateField',
        modelId,
        fieldId: af.value.created.fieldId!,
        patch: { name: f.name, type: (f.type ?? 'string') as FieldType, required: f.required ?? true },
      });
      if (!uf.ok) return errorText(uf.error.message);
      working = uf.value.doc;
    }

    const saved = await api.saveProject(project.id, project.name, working);
    const model = DataModel.findModel(working.dataModel, modelId);
    return text({ ok: true, modelId, name: model?.name, updatedAt: saved.updated_at });
  },
);

server.registerTool(
  'add_page',
  {
    title: 'ページ追加(高水準)',
    description: 'ページを1枚追加する便利ツール(内部は addPage コマンド)',
    inputSchema: { projectId: z.string(), name: z.string(), path: z.string() },
  },
  async ({ projectId, name, path }) => {
    const { project, doc } = await loadDoc(projectId);
    const result = applyCommand(doc, { kind: 'addPage', name, path });
    if (!result.ok) return errorText(result.error.message);
    const saved = await api.saveProject(project.id, project.name, result.value.doc);
    return text({ ok: true, pageId: result.value.created.pageId, updatedAt: saved.updated_at });
  },
);

await server.connect(new StdioServerTransport());
console.error('appforge-mcp: stdio で待機中(BE: ' + (process.env['APPFORGE_API'] ?? 'http://localhost:8787') + ')');
