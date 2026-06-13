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

await client.close();
console.log('SMOKE TEST: ALL OK');
