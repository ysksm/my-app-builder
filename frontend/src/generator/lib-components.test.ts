import { describe, expect, it } from 'vitest';
import { ProjectDoc, EditTarget } from '@/domain/project-doc';
import { applyCommand } from '@/application/commands';
import { generateProject } from './index';
import { generateVueProject } from './emit-vue-project';
import { generateSvelteProject } from './emit-svelte-project';
import { generateRemixProject } from './emit-remix-project';

/** uPlot / ECharts / AG Grid をホームに置いた doc */
const withLibs = () => {
  let doc = ProjectDoc.create();
  const home = doc.pages[0]!;
  const target = EditTarget.page(home.id);
  (['uplot', 'echarts', 'aggrid'] as const).forEach((type, i) => {
    const res = applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: i, type });
    if (!res.ok) throw new Error('insert failed');
    doc = res.value.doc;
  });
  return doc;
};

const get = (files: ReadonlyArray<{ path: string; content: string }>, path: string) =>
  files.find((f) => f.path.includes(path))?.content ?? '';

describe('外部ライブラリ製コンポーネント生成(uPlot / ECharts / AG Grid)', () => {
  const doc = withLibs();

  it('React: 専用ファイル + ページ参照 + 条件付き依存', () => {
    const files = generateProject(doc, 'x');
    expect(get(files, 'shared/realtime/Uplot.tsx')).toContain("import uPlot from 'uplot'");
    expect(get(files, 'shared/realtime/EChart.tsx')).toContain("import * as echarts from 'echarts'");
    expect(get(files, 'shared/realtime/DataGrid.tsx')).toContain("from 'ag-grid-community'");
    const page = get(files, 'pages/Page0.tsx');
    expect(page).toContain('<Uplot ');
    expect(page).toContain('<EChart ');
    expect(page).toContain('chartType=');
    expect(page).toContain('<DataGrid ');
    const pkg = get(files, 'package.json');
    expect(pkg).toContain('uplot');
    expect(pkg).toContain('echarts');
    expect(pkg).toContain('ag-grid-community');
  });

  it('Vue: SFC + 依存', () => {
    const files = generateVueProject(doc, 'x');
    expect(get(files, 'shared/realtime/Uplot.vue')).toContain("import uPlot from 'uplot'");
    expect(get(files, 'shared/realtime/EChart.vue')).toContain('echarts');
    expect(get(files, 'shared/realtime/DataGrid.vue')).toContain('ag-grid-community');
    expect(get(files, 'package.json')).toContain('ag-grid-community');
  });

  it('Svelte: コンポーネント + 依存', () => {
    const files = generateSvelteProject(doc, 'x');
    expect(get(files, 'shared/realtime/Uplot.svelte')).toContain("import uPlot from 'uplot'");
    expect(get(files, 'shared/realtime/EChart.svelte')).toContain('echarts');
    expect(get(files, 'shared/realtime/DataGrid.svelte')).toContain('ag-grid-community');
    expect(get(files, 'package.json')).toContain('uplot');
  });

  it('Remix: realtime.tsx に export + 依存 + ルート参照', () => {
    const files = generateRemixProject(doc, 'x');
    const rt = get(files, 'shared/realtime.tsx');
    expect(rt).toContain('export function Uplot');
    expect(rt).toContain('export function EChart');
    expect(rt).toContain('export function DataGrid');
    expect(rt).toContain("import uPlot from 'uplot'");
    expect(get(files, 'routes/page0.tsx')).toContain('<Uplot');
    expect(get(files, 'package.json')).toContain('echarts');
  });

  it('未使用なら依存を入れない(React)', () => {
    const files = generateProject(ProjectDoc.create(), 'x');
    const pkg = get(files, 'package.json');
    expect(pkg).not.toContain('uplot');
    expect(pkg).not.toContain('ag-grid-community');
    expect(files.find((f) => f.path.includes('Uplot.tsx'))).toBeUndefined();
  });
});
