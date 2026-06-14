import type { GeneratedFile } from './files';

/**
 * 外部ライブラリ製コンポーネント(uPlot / ECharts / AG Grid)の Vue / Svelte 実装。
 * Vue/Svelte/Remix の realtime は mock データ駆動(PoC)なので、ここでも mock で動かす。
 * 使用中のものだけ出力する(libDepsFor で依存も使用時のみ入る)。
 */

// ---- ECharts のオプション組み立て(全フレームワーク共通。型付きで strict 型チェックを通す)----
// 埋め込み先には `import * as echarts from 'echarts'` がある前提
const ECHARTS_OPTION_FN = `function ecOption(type: 'gauge' | 'line' | 'bar', p: { unit: string; min: number; max: number; value: number; series: number[]; decimals: number; color: string }): echarts.EChartsOption {
  if (type === 'gauge') {
    return { series: [{ type: 'gauge', min: p.min, max: p.max, progress: { show: true, width: 10 },
      axisLine: { lineStyle: { width: 10 } }, itemStyle: { color: p.color }, pointer: { width: 4 },
      detail: { valueAnimation: true, formatter: '{value}' + p.unit, fontSize: 18, offsetCenter: [0, '70%'] },
      title: { show: false }, data: [{ value: Number(p.value.toFixed(p.decimals)) }] }] };
  }
  const data = p.series.map((v) => Number(v.toFixed(p.decimals)));
  return { grid: { left: 36, right: 10, top: 16, bottom: 18 },
    xAxis: { type: 'category', show: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value', min: p.min, max: p.max },
    series: [ type === 'bar'
      ? { type: 'bar', data, itemStyle: { color: p.color } }
      : { type: 'line', data, smooth: true, showSymbol: false, lineStyle: { color: p.color, width: 2 }, areaStyle: { opacity: 0.15, color: p.color } } ] };
}`;

const GRID_SAMPLE_FN = `function gridRows(columns: string[], rows: number): Array<Record<string, string | number>> {
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
}`;

// ============================ Vue ============================

const vueUplot = `<!-- 自動生成 — AppForge(Vue): uPlot 時系列(mock) -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
const props = defineProps<{ label: string; unit?: string; min: number; max: number; interval: number; decimals?: number; capacity?: number }>();
const host = ref<HTMLDivElement | null>(null);
const series = ref<number[]>([]);
const value = ref<number | null>(null);
let chart: uPlot | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
const color = () => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#4263eb';
onMounted(() => {
  if (host.value) {
    chart = new uPlot({ width: host.value.clientWidth || 280, height: 120, cursor: { show: false }, legend: { show: false },
      scales: { x: { time: false }, y: { range: [props.min, props.max] } }, axes: [{ show: false }, { size: 34 }],
      series: [{}, { stroke: color(), width: 2 }] }, [[], []], host.value);
  }
  const tick = () => {
    const v = props.min + Math.random() * (props.max - props.min);
    value.value = v;
    const cap = Math.max(2, props.capacity ?? 60);
    const next = series.value.concat(v);
    series.value = next.length > cap ? next.slice(next.length - cap) : next;
  };
  tick();
  timer = setInterval(tick, Math.max(200, props.interval));
});
watch(series, (s) => chart?.setData([s.map((_, i) => i), [...s]]));
onUnmounted(() => { if (timer) clearInterval(timer); chart?.destroy(); });
</script>
<template>
  <div class="c-uplot">
    <div class="c-uplot-head">
      <span class="c-uplot-label">{{ label }}</span>
      <span class="c-uplot-value">{{ value === null ? '—' : value.toFixed(decimals ?? 1) }}{{ unit }}</span>
    </div>
    <div ref="host" class="c-uplot-canvas" />
  </div>
</template>
`;

const vueEChart = `<!-- 自動生成 — AppForge(Vue): Apache ECharts(mock) -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
const props = defineProps<{ label: string; unit?: string; min: number; max: number; interval: number; decimals?: number; capacity?: number; chartType?: 'gauge' | 'line' | 'bar' }>();
const host = ref<HTMLDivElement | null>(null);
const series = ref<number[]>([]);
const value = ref<number>(0);
let chart: echarts.ECharts | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
const color = () => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#4263eb';
${ECHARTS_OPTION_FN}
const render = () => chart?.setOption(ecOption(props.chartType ?? 'gauge', { unit: props.unit ?? '', min: props.min, max: props.max, value: value.value, series: series.value, decimals: props.decimals ?? 1, color: color() }), true);
const onResize = () => chart?.resize();
onMounted(() => {
  if (host.value) chart = echarts.init(host.value);
  const tick = () => {
    const v = props.min + Math.random() * (props.max - props.min);
    value.value = v;
    const cap = Math.max(2, props.capacity ?? 40);
    const next = series.value.concat(v);
    series.value = next.length > cap ? next.slice(next.length - cap) : next;
  };
  tick();
  render();
  timer = setInterval(tick, Math.max(200, props.interval));
  window.addEventListener('resize', onResize);
});
watch([series, value], render);
onUnmounted(() => { if (timer) clearInterval(timer); window.removeEventListener('resize', onResize); chart?.dispose(); });
</script>
<template>
  <div class="c-echart">
    <div class="c-echart-label">{{ label }}</div>
    <div ref="host" class="c-echart-canvas" />
  </div>
</template>
`;

const vueDataGrid = `<!-- 自動生成 — AppForge(Vue): AG Grid データグリッド -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { AllCommunityModule, createGrid, ModuleRegistry, themeQuartz, type GridApi } from 'ag-grid-community';
ModuleRegistry.registerModules([AllCommunityModule]);
const props = defineProps<{ columns: string; rows: number }>();
const host = ref<HTMLDivElement | null>(null);
let api: GridApi | null = null;
${GRID_SAMPLE_FN}
onMounted(() => {
  if (!host.value) return;
  const cols = props.columns.split(',').map((c) => c.trim()).filter(Boolean);
  const rows = Math.max(0, Math.min(100, props.rows));
  api = createGrid<Record<string, string | number>>(host.value, { theme: themeQuartz, columnDefs: cols.map((c) => ({ field: c, sortable: true, filter: true, flex: 1 })),
    rowData: gridRows(cols, rows), pagination: rows > 10, paginationPageSize: 10 });
});
onUnmounted(() => api?.destroy());
</script>
<template>
  <div ref="host" class="c-aggrid" />
</template>
`;

const VUE_LIB: Readonly<Record<string, string>> = { Uplot: vueUplot, EChart: vueEChart, DataGrid: vueDataGrid };

/** 使用中の外部ライブラリ製 Vue SFC を出力(shared/realtime 配下) */
export const vueLibFiles = (used: ReadonlySet<string>): GeneratedFile[] =>
  Object.keys(VUE_LIB)
    .filter((tag) => used.has(tag))
    .map((tag) => ({ path: `src/shared/realtime/${tag}.vue`, content: VUE_LIB[tag]! }));

// ============================ Svelte ============================

const svelteUplot = `<!-- 自動生成 — AppForge(Svelte): uPlot 時系列(mock) -->
<script lang="ts">
  import { onMount } from 'svelte';
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';
  let { label, unit = '', min, max, interval, decimals = 1, capacity = 60 }: { label: string; unit?: string; min: number; max: number; interval: number; decimals?: number; capacity?: number; [key: string]: unknown } = $props();
  let host: HTMLDivElement;
  let value = $state<number | null>(null);
  const color = () => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#4263eb';
  onMount(() => {
    let series: number[] = [];
    const chart = new uPlot({ width: host.clientWidth || 280, height: 120, cursor: { show: false }, legend: { show: false },
      scales: { x: { time: false }, y: { range: [min, max] } }, axes: [{ show: false }, { size: 34 }], series: [{}, { stroke: color(), width: 2 }] }, [[], []], host);
    const tick = () => {
      const v = min + Math.random() * (max - min);
      value = v;
      const cap = Math.max(2, capacity);
      series = series.concat(v);
      if (series.length > cap) series = series.slice(series.length - cap);
      chart.setData([series.map((_, i) => i), [...series]]);
    };
    tick();
    const id = setInterval(tick, Math.max(200, interval));
    return () => { clearInterval(id); chart.destroy(); };
  });
</script>
<div class="c-uplot">
  <div class="c-uplot-head">
    <span class="c-uplot-label">{label}</span>
    <span class="c-uplot-value">{value === null ? '—' : value.toFixed(decimals)}{unit}</span>
  </div>
  <div bind:this={host} class="c-uplot-canvas"></div>
</div>
`;

const svelteEChart = `<!-- 自動生成 — AppForge(Svelte): Apache ECharts(mock) -->
<script lang="ts">
  import { onMount } from 'svelte';
  import * as echarts from 'echarts';
  let { label, unit = '', min, max, interval, decimals = 1, capacity = 40, chartType = 'gauge' }: { label: string; unit?: string; min: number; max: number; interval: number; decimals?: number; capacity?: number; chartType?: 'gauge' | 'line' | 'bar'; [key: string]: unknown } = $props();
  let host: HTMLDivElement;
  const color = () => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#4263eb';
  ${ECHARTS_OPTION_FN}
  onMount(() => {
    const chart = echarts.init(host);
    let series: number[] = [];
    let value = 0;
    const render = () => chart.setOption(ecOption(chartType, { unit, min, max, value, series, decimals, color: color() }), true);
    const onResize = () => chart.resize();
    const tick = () => {
      value = min + Math.random() * (max - min);
      const cap = Math.max(2, capacity);
      series = series.concat(value);
      if (series.length > cap) series = series.slice(series.length - cap);
      render();
    };
    tick();
    const id = setInterval(tick, Math.max(200, interval));
    window.addEventListener('resize', onResize);
    return () => { clearInterval(id); window.removeEventListener('resize', onResize); chart.dispose(); };
  });
</script>
<div class="c-echart">
  <div class="c-echart-label">{label}</div>
  <div bind:this={host} class="c-echart-canvas"></div>
</div>
`;

const svelteDataGrid = `<!-- 自動生成 — AppForge(Svelte): AG Grid データグリッド -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { AllCommunityModule, createGrid, ModuleRegistry, themeQuartz } from 'ag-grid-community';
  ModuleRegistry.registerModules([AllCommunityModule]);
  let { columns, rows }: { columns: string; rows: number } = $props();
  let host: HTMLDivElement;
  ${GRID_SAMPLE_FN}
  onMount(() => {
    const cols = columns.split(',').map((c) => c.trim()).filter(Boolean);
    const n = Math.max(0, Math.min(100, rows));
    const api = createGrid<Record<string, string | number>>(host, { theme: themeQuartz, columnDefs: cols.map((c) => ({ field: c, sortable: true, filter: true, flex: 1 })),
      rowData: gridRows(cols, n), pagination: n > 10, paginationPageSize: 10 });
    return () => api.destroy();
  });
</script>
<div bind:this={host} class="c-aggrid"></div>
`;

const SVELTE_LIB: Readonly<Record<string, string>> = { Uplot: svelteUplot, EChart: svelteEChart, DataGrid: svelteDataGrid };

/** 使用中の外部ライブラリ製 Svelte コンポーネントを出力(shared/realtime 配下) */
export const svelteLibFiles = (used: ReadonlySet<string>): GeneratedFile[] =>
  Object.keys(SVELTE_LIB)
    .filter((tag) => used.has(tag))
    .map((tag) => ({ path: `src/shared/realtime/${tag}.svelte`, content: SVELTE_LIB[tag]! }));

// ============================ Remix(React、単一 realtime モジュールへ追記)============================

/** Remix の realtime.tsx に追記する、使用中ライブラリの React 実装(mock)。imports と body を返す */
export const remixLibSource = (used: ReadonlySet<string>): { imports: string; body: string } => {
  const parts: string[] = [];
  const imports: string[] = [];
  if (used.has('Uplot') || used.has('EChart') || used.has('DataGrid')) {
    imports.push(`import { useRef } from 'react';`);
    parts.push(`
function useMockSeries(min: number, max: number, interval: number, capacity: number): { series: number[]; value: number } {
  const [series, setSeries] = useState<number[]>([]);
  const [value, setValue] = useState(0);
  useEffect(() => {
    const tick = () => {
      const v = min + Math.random() * (max - min);
      setValue(v);
      setSeries((prev) => { const n = prev.concat(v); return n.length > capacity ? n.slice(n.length - capacity) : n; });
    };
    tick();
    const id = setInterval(tick, Math.max(200, interval));
    return () => clearInterval(id);
  }, [min, max, interval, capacity]);
  return { series, value };
}
const themeColor = () => (typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#4263eb' : '#4263eb');`);
  }
  if (used.has('Uplot')) {
    imports.push(`import uPlot from 'uplot';`, `import 'uplot/dist/uPlot.min.css';`);
    parts.push(`
export function Uplot(props: { label: string; unit?: string; min: number; max: number; interval: number; decimals?: number; capacity?: number; [key: string]: unknown }) {
  const { series, value } = useMockSeries(props.min, props.max, props.interval, props.capacity ?? 60);
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<uPlot | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const u = new uPlot({ width: host.current.clientWidth || 280, height: 120, cursor: { show: false }, legend: { show: false },
      scales: { x: { time: false }, y: { range: [props.min, props.max] } }, axes: [{ show: false }, { size: 34 }], series: [{}, { stroke: themeColor(), width: 2 }] }, [[], []], host.current);
    chart.current = u;
    return () => { u.destroy(); chart.current = null; };
  }, [props.min, props.max]);
  useEffect(() => { chart.current?.setData([series.map((_, i) => i), [...series]]); }, [series]);
  return (<div className="c-uplot"><div className="c-uplot-head"><span className="c-uplot-label">{props.label}</span><span className="c-uplot-value">{series.length ? value.toFixed(props.decimals ?? 1) : '—'}{props.unit ?? ''}</span></div><div ref={host} className="c-uplot-canvas" /></div>);
}`);
  }
  if (used.has('EChart')) {
    imports.push(`import * as echarts from 'echarts';`);
    parts.push(`
${ECHARTS_OPTION_FN}
export function EChart(props: { label: string; unit?: string; min: number; max: number; interval: number; decimals?: number; capacity?: number; chartType?: 'gauge' | 'line' | 'bar'; [key: string]: unknown }) {
  const { series, value } = useMockSeries(props.min, props.max, props.interval, props.capacity ?? 40);
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const c = echarts.init(host.current); chart.current = c;
    const onResize = () => c.resize(); window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); c.dispose(); chart.current = null; };
  }, []);
  useEffect(() => { chart.current?.setOption(ecOption(props.chartType ?? 'gauge', { unit: props.unit ?? '', min: props.min, max: props.max, value, series, decimals: props.decimals ?? 1, color: themeColor() }), true); }, [value, series, props]);
  return (<div className="c-echart"><div className="c-echart-label">{props.label}</div><div ref={host} className="c-echart-canvas" /></div>);
}`);
  }
  if (used.has('DataGrid')) {
    imports.push(`import { AllCommunityModule, createGrid, ModuleRegistry, themeQuartz, type GridApi } from 'ag-grid-community';`);
    parts.push(`
ModuleRegistry.registerModules([AllCommunityModule]);
${GRID_SAMPLE_FN}
export function DataGrid(props: { columns: string; rows: number }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<GridApi | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const cols = props.columns.split(',').map((c) => c.trim()).filter(Boolean);
    const n = Math.max(0, Math.min(100, props.rows));
    api.current = createGrid<Record<string, string | number>>(host.current, { theme: themeQuartz, columnDefs: cols.map((c) => ({ field: c, sortable: true, filter: true, flex: 1 })), rowData: gridRows(cols, n), pagination: n > 10, paginationPageSize: 10 });
    return () => api.current?.destroy();
  }, [props.columns, props.rows]);
  return <div ref={host} className="c-aggrid" />;
}`);
  }
  return { imports: imports.join('\n'), body: parts.join('\n') };
};
