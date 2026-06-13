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

// list_projects(空なら Phase 0 用に1つ作成 + 集約を1つ追加)
const list = await client.callTool({ name: 'list_projects', arguments: {} });
const projects = JSON.parse(textOf(list)) as Array<{ id: string; name: string }>;
let id: string;
if (projects.length === 0) {
  const seed = JSON.parse(textOf(await client.callTool({ name: 'create_project', arguments: { name: 'Smoke Seed' } }))) as { id: string };
  id = seed.id;
  await client.callTool({ name: 'add_aggregate', arguments: { projectId: id, name: 'Customer', fields: [{ name: 'name', type: 'string' }] } });
  console.log(`seeded project: ${id}`);
} else {
  id = projects[0]!.id;
  console.log(`project: ${projects[0]!.name} (${id})`);
}

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

// generate_source(framework=vue): 別フレームワーク生成(FR-GEN-07)
const vue = JSON.parse(
  textOf(await client.callTool({ name: 'generate_source', arguments: { projectId: id, framework: 'vue' } })),
) as Array<{ path: string }>;
if (!vue.some((f) => f.path === 'src/App.vue')) fail('framework=vue で App.vue が生成されません');
const vuePkg = textOf(
  await client.callTool({
    name: 'generate_source',
    arguments: { projectId: id, filePath: 'package.json', framework: 'vue' },
  }),
);
if (!vuePkg.includes('vue-router')) fail('framework=vue の package.json が不正です');
console.log('generate_source framework=vue OK:', vue.length, 'files');

// generate_source(framework=svelte)
const svelte = JSON.parse(
  textOf(await client.callTool({ name: 'generate_source', arguments: { projectId: id, framework: 'svelte' } })),
) as Array<{ path: string }>;
if (!svelte.some((f) => f.path === 'src/App.svelte')) fail('framework=svelte で App.svelte が生成されません');
console.log('generate_source framework=svelte OK:', svelte.length, 'files');

// generate_source(framework=remix)
const remix = JSON.parse(
  textOf(await client.callTool({ name: 'generate_source', arguments: { projectId: id, framework: 'remix' } })),
) as Array<{ path: string }>;
if (!remix.some((f) => f.path === 'app/root.tsx')) fail('framework=remix で app/root.tsx が生成されません');
console.log('generate_source framework=remix OK:', remix.length, 'files');

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

// クロスフィールドルール: Product の price >= 0 を addRule で定義
const pfull = JSON.parse(textOf(await client.callTool({ name: 'get_project', arguments: { projectId: pid } })));
const product = pfull.doc.dataModel.models.find((m: { name: string }) => m.name === 'Product');
const priceField = product.fields.find((f: { name: string }) => f.name === 'price');
const ruleRes = await client.callTool({
  name: 'apply_commands',
  arguments: {
    projectId: pid,
    commands: [
      { kind: 'addRule', modelId: product.id, left: priceField.id, op: 'gte', right: { kind: 'literal', value: 0 }, message: '価格は0以上にしてください' },
    ],
  },
});
if (ruleRes.isError) fail('apply_commands(addRule) が失敗しました');
const productSrc = textOf(
  await client.callTool({ name: 'generate_source', arguments: { projectId: pid, filePath: 'src/features/product/domain/product.ts' } }),
);
if (!productSrc.includes('input.price >= 0')) fail('ルールが validate に展開されていません');
console.log('addRule → validate 展開 OK');

// ドメインサービス契約: addService → updateService(name=calcShipping, returns=number)
const svcAdd = JSON.parse(
  textOf(await client.callTool({ name: 'apply_commands', arguments: { projectId: pid, commands: [{ kind: 'addService', modelId: product.id }] } })),
) as { ok: boolean; created: { serviceId: string } };
if (!svcAdd.ok) fail('apply_commands(addService) が失敗しました');
const svcUpd = await client.callTool({
  name: 'apply_commands',
  arguments: {
    projectId: pid,
    commands: [
      { kind: 'updateService', modelId: product.id, serviceId: svcAdd.created.serviceId, patch: { name: 'calcShipping', returns: 'number', params: [{ name: 'weight', type: 'number' }] } },
    ],
  },
});
if (svcUpd.isError) fail('apply_commands(updateService) が失敗しました');
const contractSrc = textOf(
  await client.callTool({ name: 'generate_source', arguments: { projectId: pid, filePath: 'src/features/product/domain/services/calc-shipping.ts' } }),
);
if (!contractSrc.includes('CalcShippingService = (entity: Product, weight: number) => number')) {
  fail('ドメインサービス契約が正しく生成されていません');
}
console.log('addService → 契約生成 OK');

// ユースケース: addUsecase → updateUsecase(name=placeProduct, save=true)
const ucAdd = JSON.parse(
  textOf(await client.callTool({ name: 'apply_commands', arguments: { projectId: pid, commands: [{ kind: 'addUsecase', modelId: product.id }] } })),
) as { ok: boolean; created: { usecaseId: string } };
if (!ucAdd.ok) fail('apply_commands(addUsecase) が失敗しました');
const ucUpd = await client.callTool({
  name: 'apply_commands',
  arguments: {
    projectId: pid,
    commands: [{ kind: 'updateUsecase', modelId: product.id, usecaseId: ucAdd.created.usecaseId, patch: { name: 'placeProduct', save: true } }],
  },
});
if (ucUpd.isError) fail('apply_commands(updateUsecase) が失敗しました');
const ucSrc = textOf(
  await client.callTool({ name: 'generate_source', arguments: { projectId: pid, filePath: 'src/features/product/application/place-product.ts' } }),
);
if (!ucSrc.includes('export const placeProduct = async (') || !ucSrc.includes('Product.create(input)')) {
  fail('ユースケースが正しく生成されていません');
}
console.log('addUsecase → application 関数生成 OK');

// 設計図エクスポート(FR-VIEW-06)
const trace = textOf(await client.callTool({ name: 'export_diagrams', arguments: { projectId: pid, kind: 'traceability' } }));
if (!trace.includes('| Product |') || !trace.includes('ドメイン層')) fail('トレーサビリティ表が不正です');
const seq = textOf(await client.callTool({ name: 'export_diagrams', arguments: { projectId: pid, kind: 'sequence' } }));
if (!seq.includes('sequenceDiagram') || !seq.includes('placeProduct')) fail('シーケンス図が不正です');
const flow2 = textOf(await client.callTool({ name: 'export_diagrams', arguments: { projectId: pid, kind: 'screen-flow' } }));
if (!flow2.includes('flowchart')) fail('画面遷移図が不正です');
console.log('export_diagrams(遷移図/シーケンス/トレーサビリティ)OK');

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

// Tailwind emitter に切替 → @theme 生成 → ビルド成功(Tailwind v4 + vite plugin)
await client.callTool({ name: 'apply_commands', arguments: { projectId: pid, commands: [{ kind: 'setStyleEmitter', emitter: 'tailwind' }] } });
const tw = textOf(await client.callTool({ name: 'generate_source', arguments: { projectId: pid, filePath: 'src/shared/styles/tokens.css' } }));
if (!tw.includes('@import "tailwindcss"') || !tw.includes('@theme')) fail('tailwind emitter の tokens.css が不正です');
console.log('setStyleEmitter(tailwind)→ @theme 生成 OK');
const twBuild = JSON.parse(textOf(await client.callTool({ name: 'build_and_preview', arguments: { projectId: pid } })));
if (!twBuild.ok) fail(`Tailwind emitter のビルド失敗:\n${twBuild.log.slice(-2000)}`);
console.log('build_and_preview(tailwind emitter): OK');

await client.close();
console.log('SMOKE TEST: ALL OK');
