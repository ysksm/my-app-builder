import type { ProjectDoc } from '@/domain/project-doc';
import type { ComponentNode } from '@/domain/component-node';
import { paths } from './layout';
import type { GeneratedFile } from './files';
import { collectComponents, toUiTree } from './ui-model';
import { kitIdOf } from './ui-kits';

/** Headless UI Combobox(状態を持つ)用のラッパー。emit-jsx は libImports 経由で参照する */
const appComboboxTsx = `// 自動生成 — AppForge: Headless UI Combobox(入力フィルタ付き選択)
import { useState } from 'react';
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';

export function AppCombobox({ options, placeholder }: { options: string[]; placeholder?: string }) {
  const [value, setValue] = useState<string>(options[0] ?? '');
  const [query, setQuery] = useState('');
  const filtered = query === '' ? options : options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));
  return (
    <Combobox value={value} onChange={(v: string | null) => setValue(v ?? '')} onClose={() => setQuery('')}>
      <ComboboxInput className="c-combobox-input" displayValue={(o: string) => o} placeholder={placeholder} onChange={(e) => setQuery(e.target.value)} />
      <ComboboxOptions anchor="bottom" className="c-menu-list">
        {filtered.map((o) => (
          <ComboboxOption key={o} value={o} className="c-menu-item">{o}</ComboboxOption>
        ))}
      </ComboboxOptions>
    </Combobox>
  );
}
`;

/** doc 内に指定 type のノードが存在するか */
const hasNodeType = (doc: ProjectDoc, type: ComponentNode['type']): boolean => {
  const walk = (n: ComponentNode | null): boolean =>
    n !== null && (n.type === type || n.children.some(walk));
  return (
    doc.pages.some((pg) => walk(pg.root)) ||
    doc.dialogs.some((d) => walk(d.root)) ||
    walk(doc.layout.header) ||
    walk(doc.layout.footer)
  );
};

/**
 * 外部ライブラリ製コンポーネント(uPlot / ECharts / AG Grid)の React 実装ファイル生成。
 * runtime.tsx のフック(useSeriesState 等)+ npm ライブラリをマウントする薄いラッパー。
 * 使われているライブラリのファイルだけを出力する(依存も使ったときだけ入る)。
 */

const themeColorHelper = `const themeColor = (): string =>
  typeof document !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#4263eb'
    : '#4263eb';`;

const uplotTsx = `// 自動生成 — AppForge: uPlot 時系列(DataChannel に接続)
import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useSeriesState, type RealtimeProps } from './runtime';

type Props = RealtimeProps & { capacity?: number };

${themeColorHelper}

export function Uplot(props: Props) {
  const { series } = useSeriesState(props, props.capacity ?? 60);
  const value = series.length > 0 ? series[series.length - 1]! : null;
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const opts: uPlot.Options = {
      width: host.current.clientWidth || 280,
      height: 120,
      cursor: { show: false },
      legend: { show: false },
      scales: { x: { time: false }, y: { range: [props.min, props.max] } },
      axes: [{ show: false }, { size: 34 }],
      series: [{}, { stroke: themeColor(), width: 2 }],
    };
    const u = new uPlot(opts, [[], []], host.current);
    chart.current = u;
    return () => { u.destroy(); chart.current = null; };
  }, [props.min, props.max]);

  useEffect(() => {
    const u = chart.current;
    if (!u) return;
    u.setData([series.map((_, i) => i), [...series]]);
  }, [series]);

  return (
    <div className="c-uplot">
      <div className="c-uplot-head">
        <span className="c-uplot-label">{props.label}</span>
        <span className="c-uplot-value">{value === null ? '—' : value.toFixed(props.decimals ?? 1)}{props.unit ?? ''}</span>
      </div>
      <div ref={host} className="c-uplot-canvas" />
    </div>
  );
}
`;

const echartTsx = `// 自動生成 — AppForge: Apache ECharts(gauge / line / bar、DataChannel に接続)
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { useSeriesState, type RealtimeProps } from './runtime';

type Props = RealtimeProps & { capacity?: number; chartType?: 'gauge' | 'line' | 'bar' };

${themeColorHelper}

function buildOption(type: 'gauge' | 'line' | 'bar', p: {
  unit: string; min: number; max: number; value: number; series: number[]; decimals: number; color: string;
}): echarts.EChartsOption {
  if (type === 'gauge') {
    return {
      series: [{
        type: 'gauge', min: p.min, max: p.max,
        progress: { show: true, width: 10 },
        axisLine: { lineStyle: { width: 10 } },
        itemStyle: { color: p.color },
        pointer: { width: 4 },
        detail: { valueAnimation: true, formatter: '{value}' + p.unit, fontSize: 18, offsetCenter: [0, '70%'] },
        title: { show: false },
        data: [{ value: Number(p.value.toFixed(p.decimals)) }],
      }],
    };
  }
  const data = p.series.map((v) => Number(v.toFixed(p.decimals)));
  return {
    grid: { left: 36, right: 10, top: 16, bottom: 18 },
    xAxis: { type: 'category', show: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value', min: p.min, max: p.max },
    series: [
      type === 'bar'
        ? { type: 'bar', data, itemStyle: { color: p.color } }
        : { type: 'line', data, smooth: true, showSymbol: false, lineStyle: { color: p.color, width: 2 }, areaStyle: { opacity: 0.15, color: p.color } },
    ],
  };
}

export function EChart(props: Props) {
  const type = props.chartType ?? 'gauge';
  const { series } = useSeriesState(props, props.capacity ?? 40);
  const value = series.length > 0 ? series[series.length - 1]! : 0;
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const c = echarts.init(host.current);
    chart.current = c;
    const onResize = () => c.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); c.dispose(); chart.current = null; };
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.setOption(buildOption(type, {
      unit: props.unit ?? '', min: props.min, max: props.max, value,
      series, decimals: props.decimals ?? 1, color: themeColor(),
    }), true);
  }, [type, value, series, props.min, props.max, props.unit, props.decimals]);

  return (
    <div className="c-echart">
      <div className="c-echart-label">{props.label}</div>
      <div ref={host} className="c-echart-canvas" />
    </div>
  );
}
`;

const dataGridTsx = `// 自動生成 — AppForge: AG Grid データグリッド(ソート / フィルタ / ページング)
import { useEffect, useRef } from 'react';
import { AllCommunityModule, createGrid, ModuleRegistry, themeQuartz, type GridApi } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

type Props = { columns: string; rows: number };

function sampleRows(columns: string[], rows: number): Array<Record<string, string | number>> {
  const out: Array<Record<string, string | number>> = [];
  for (let r = 0; r < rows; r += 1) {
    const row: Record<string, string | number> = {};
    columns.forEach((col, ci) => {
      const lower = col.toLowerCase();
      if (ci === 0 || lower === 'id') row[col] = r + 1;
      else if (/数量|qty|count|個数|量|price|金額|amount/.test(lower) || /数量|金額|量/.test(col)) row[col] = (r + 1) * 10;
      else if (/状態|status|state/.test(lower) || /状態/.test(col)) row[col] = ['active', 'idle', 'error'][r % 3]!;
      else row[col] = col + (r + 1);
    });
    out.push(row);
  }
  return out;
}

export function DataGrid(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<GridApi | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const columns = props.columns.split(',').map((c) => c.trim()).filter(Boolean);
    const rows = Math.max(0, Math.min(100, props.rows));
    api.current = createGrid(host.current, {
      theme: themeQuartz,
      columnDefs: columns.map((c) => ({ field: c, sortable: true, filter: true, flex: 1 })),
      rowData: sampleRows(columns, rows),
      pagination: rows > 10,
      paginationPageSize: 10,
    });
    return () => api.current?.destroy();
  }, [props.columns, props.rows]);

  return <div ref={host} className="c-aggrid" />;
}
`;

const LIB_FILES: Readonly<Record<string, string>> = {
  Uplot: uplotTsx,
  EChart: echartTsx,
  DataGrid: dataGridTsx,
};

/** doc 全体で使われている UI 部品名(コンポーネント参照)を集める */
const usedComponents = (doc: ProjectDoc): Set<string> => {
  const all = new Set<string>();
  const collect = (n: ComponentNode | null) => {
    if (n) collectComponents(toUiTree(n), all);
  };
  doc.pages.forEach((p) => collect(p.root));
  doc.dialogs.forEach((d) => collect(d.root));
  collect(doc.layout.header);
  collect(doc.layout.footer);
  return all;
};

/** 使用中の外部ライブラリ製コンポーネント(React)ファイルを生成する */
export const emitReactLibFiles = (doc: ProjectDoc): GeneratedFile[] => {
  const used = usedComponents(doc);
  const files: GeneratedFile[] = [];
  for (const tag of Object.keys(LIB_FILES)) {
    if (used.has(tag)) files.push({ path: paths.realtimeLib(tag), content: LIB_FILES[tag]! });
  }
  // Headless UI 選択 + combobox 使用時は Combobox ラッパーを出力(emit-jsx が AppCombobox を参照)
  if (kitIdOf(doc.uiKits, 'react') === 'headless' && hasNodeType(doc, 'combobox')) {
    files.push({ path: paths.realtimeLib('AppCombobox'), content: appComboboxTsx });
  }
  return files;
};
