import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { parseProjectDoc } from '@/domain/schema';
import type { ProjectDoc } from '@/domain/project-doc';
import { generateProject } from '@/generator';
import { api, type ApiProject } from './api-client.js';
import { describeApp } from './describe.js';

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
      'ビルド可能な React アプリのソース一式を生成する。filePath 指定でそのファイルの内容、未指定でファイル一覧(path / bytes)を返す',
    inputSchema: {
      projectId: z.string(),
      filePath: z.string().optional().describe('例: src/App.tsx'),
    },
  },
  async ({ projectId, filePath }) => {
    const { project, doc } = await loadDoc(projectId);
    const files = generateProject(doc, project.name);
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
      'ソースを生成し、BE のビルドランナーで npm install / tsc / vite build を実行する。結果・ビルドログ末尾・プレビュー URL を返す(初回は依存取得で時間がかかる)',
    inputSchema: { projectId: z.string() },
  },
  async ({ projectId }) => {
    const { project, doc } = await loadDoc(projectId);
    const result = await api.build(projectId, generateProject(doc, project.name));
    return text({
      ok: result.ok,
      previewUrl: result.ok ? api.previewUrl(projectId) : null,
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
    },
  },
  async ({ projectId, outDir, overwrite }) => {
    if (!path.isAbsolute(outDir)) return errorText('outDir は絶対パスで指定してください');
    const existing = await readdir(outDir).catch(() => null);
    if (existing && existing.length > 0 && overwrite !== true) {
      return errorText(
        `出力先が空ではありません(${existing.length} 件)。上書きするには overwrite: true を指定してください`,
      );
    }
    const { project, doc } = await loadDoc(projectId);
    const files = generateProject(doc, project.name);
    for (const f of files) {
      const target = path.join(outDir, f.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, f.content, 'utf8');
    }
    return text({ written: files.length, outDir });
  },
);

await server.connect(new StdioServerTransport());
console.error('appforge-mcp: stdio で待機中(BE: ' + (process.env['APPFORGE_API'] ?? 'http://localhost:8787') + ')');
