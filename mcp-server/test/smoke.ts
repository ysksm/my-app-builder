import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';

/**
 * スモークテスト: 実サーバーを stdio で起動し、Phase 0 の全ツールを呼ぶ。
 * 前提: Rust BE が localhost:8787 で起動済みで、プロジェクトが1件以上あること。
 */

const root = path.resolve(import.meta.dirname, '..');
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', 'src/index.ts'],
  cwd: root,
});

const client = new Client({ name: 'smoke-test', version: '0.0.0' });
await client.connect(transport);

const textOf = (result: Awaited<ReturnType<typeof client.callTool>>): string => {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content[0]?.text ?? '';
};

const fail = (message: string): never => {
  console.error(`NG: ${message}`);
  process.exit(1);
};

// tools/list
const tools = await client.listTools();
const names = tools.tools.map((t) => t.name).sort();
console.log('tools:', names.join(', '));
for (const expected of [
  'build_and_preview',
  'describe_app',
  'export_source',
  'generate_source',
  'get_project',
  'list_projects',
]) {
  if (!names.includes(expected)) fail(`ツールがありません: ${expected}`);
}

// list_projects
const list = await client.callTool({ name: 'list_projects', arguments: {} });
const projects = JSON.parse(textOf(list)) as Array<{ id: string; name: string }>;
if (projects.length === 0) fail('プロジェクトがありません(ビルダーで作成してから実行してください)');
const id = projects[0]!.id;
console.log(`project: ${projects[0]!.name} (${id})`);

// describe_app
const desc = JSON.parse(textOf(await client.callTool({ name: 'describe_app', arguments: { projectId: id } })));
console.log('describe_app pages:', desc.pages.map((p: { path: string }) => p.path).join(', '));
console.log('describe_app models:', JSON.stringify(desc.dataModel.models.map((m: { name: string }) => m.name)));

// generate_source(一覧 → 個別ファイル)
const gen = JSON.parse(textOf(await client.callTool({ name: 'generate_source', arguments: { projectId: id } })));
console.log('generate_source files:', gen.length);
if (gen.length < 10) fail('生成ファイルが少なすぎます');
const app = textOf(
  await client.callTool({ name: 'generate_source', arguments: { projectId: id, filePath: 'src/app/App.tsx' } }),
);
if (!app.includes('HashRouter')) fail('src/app/App.tsx の内容が不正です');

// TypeSpec export(集約があれば interface/main.tsp が生成される)
const hasAggregate = desc.dataModel.models.some((m: { kind: string }) => m.kind === 'aggregate');
if (hasAggregate) {
  const tsp = textOf(
    await client.callTool({ name: 'generate_source', arguments: { projectId: id, filePath: 'interface/main.tsp' } }),
  );
  if (!tsp.includes('@typespec/http')) fail('interface/main.tsp の内容が不正です');
  console.log('interface/main.tsp: TypeSpec export OK');
}

// export_source(安全性: 空でないディレクトリは拒否)
const denied = await client.callTool({
  name: 'export_source',
  arguments: { projectId: id, outDir: root },
});
if (!denied.isError) fail('空でないディレクトリへの書き出しが拒否されませんでした');
console.log('export_source: 非空ディレクトリを拒否 OK');

// build_and_preview
console.log('build_and_preview 実行中…');
const build = JSON.parse(textOf(await client.callTool({ name: 'build_and_preview', arguments: { projectId: id } })));
if (!build.ok) fail(`ビルド失敗:\n${build.log}`);
console.log('build ok, preview:', build.previewUrl);

// ---------- Phase 1: 編集ツール(新規プロジェクトで非破壊に検証)----------
const createdProject = JSON.parse(
  textOf(await client.callTool({ name: 'create_project', arguments: { name: 'MCP Phase1 Smoke' } })),
) as { id: string };
const pid = createdProject.id;
console.log(`create_project: ${pid}`);

// add_aggregate(高水準)
const agg = JSON.parse(
  textOf(
    await client.callTool({
      name: 'add_aggregate',
      arguments: {
        projectId: pid,
        name: 'Product',
        fields: [
          { name: 'title', type: 'string' },
          { name: 'price', type: 'number' },
        ],
      },
    }),
  ),
) as { ok: boolean; name: string };
if (!agg.ok || agg.name !== 'Product') fail('add_aggregate が失敗しました');
console.log('add_aggregate: Product OK');

// apply_commands(生コマンド)で関連集約 + リレーションを追加
const orderCmds = JSON.parse(
  textOf(await client.callTool({ name: 'apply_commands', arguments: { projectId: pid, commands: [{ kind: 'addModel', modelKind: 'aggregate', x: 400, y: 60 }] } })),
) as { ok: boolean; created: { modelId: string } };
if (!orderCmds.ok) fail('apply_commands(addModel) が失敗しました');

// 不正コマンドは拒否される
const bad = await client.callTool({ name: 'apply_commands', arguments: { projectId: pid, commands: [{ kind: 'dropEverything' }] } });
if (!bad.isError) fail('不正コマンドが拒否されませんでした');
console.log('apply_commands: 不正コマンド拒否 OK');

// add_page
const pageRes = JSON.parse(
  textOf(await client.callTool({ name: 'add_page', arguments: { projectId: pid, name: '一覧', path: '/list' } })),
) as { ok: boolean };
if (!pageRes.ok) fail('add_page が失敗しました');

// describe で反映確認
const pdesc = JSON.parse(textOf(await client.callTool({ name: 'describe_app', arguments: { projectId: pid } })));
const modelNames = pdesc.dataModel.models.map((m: { name: string }) => m.name);
if (!modelNames.includes('Product')) fail('describe_app に Product がありません');
if (!pdesc.pages.some((p: { path: string }) => p.path === '/list')) fail('describe_app に /list がありません');
console.log('describe_app(編集後): models=' + JSON.stringify(modelNames));

// 編集したプロジェクトもビルドできる
const pbuild = JSON.parse(textOf(await client.callTool({ name: 'build_and_preview', arguments: { projectId: pid } })));
if (!pbuild.ok) fail(`編集後プロジェクトのビルド失敗:\n${pbuild.log}`);
console.log('build_and_preview(編集後): OK');

await client.close();
console.log('SMOKE TEST: ALL OK');
