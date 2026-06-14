import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import * as echarts from 'echarts';
import {
  AllCommunityModule,
  createGrid,
  ModuleRegistry,
  themeQuartz,
  type GridApi,
} from 'ag-grid-community';
import { echartsOption, sampleGridRows } from './lib-component-helpers';
import type { EventBinding, EventType } from '@/domain/actions';
import type { ComponentNode, PropValue } from '@/domain/component-node';
import type { DataChannelDef } from '@/domain/data-channel';
import type { NodeId } from '@/domain/ids';
import { componentDefs, propValueOf, type ComponentDef } from '@/domain/catalog/component-defs';
import { DragPayload, useEditInteraction } from '../editor/edit-interaction';
import {
  kitButton,
  kitChip,
  kitDisclosure,
  kitInput,
  kitMenu,
  kitRating,
  kitSlider,
  kitSwitch,
  kitTabs,
} from './react-kit-views';

export type RenderMode = 'edit' | 'preview';

/** プレビュー時にイベントバインディングを解釈する実行系。編集時は未提供 */
export type ActionRunner = Readonly<{
  run: (events: ReadonlyArray<EventBinding>, event: EventType) => void;
}>;

export const ActionRunnerContext = createContext<ActionRunner | null>(null);

/** データチャネル登録簿。モニタリング部品の channelRef 解決に使う(既定 = 空) */
export const ChannelsContext = createContext<ReadonlyArray<DataChannelDef>>([]);

/** 編集画面で実物描画する React UIライブラリ(kit)id。対象 FW=React 以外/未選択は 'plain' */
export const UiKitContext = createContext<string>('plain');

const str = (v: PropValue): string => String(v);
const num = (v: PropValue): number => (typeof v === 'number' ? v : Number(v) || 0);

const propOf = (node: ComponentNode, def: ComponentDef, key: string): PropValue =>
  propValueOf(node.props, def, key);

/** ComponentNode 1 ノードの見た目。編集キャンバスとプレビューで共用する */
export function NodeBody({ node, mode }: { node: ComponentNode; mode: RenderMode }) {
  const def = componentDefs[node.type];
  const p = (key: string) => propOf(node, def, key);
  const kit = useContext(UiKitContext);

  switch (node.type) {
    case 'container': {
      const direction = str(p('direction')) === 'row' ? 'row' : 'column';
      const style: CSSProperties = {
        display: 'flex',
        flexDirection: direction,
        gap: num(p('gap')),
        padding: num(p('padding')),
        background: str(p('background')) || undefined,
      };
      return (
        <div className="c-container" data-direction={direction} style={style}>
          <Children node={node} mode={mode} />
        </div>
      );
    }
    case 'heading': {
      const text = str(p('text'));
      const level = num(p('level'));
      if (level === 1) return <h1 className="c-heading">{text}</h1>;
      if (level === 3) return <h3 className="c-heading">{text}</h3>;
      return <h2 className="c-heading">{text}</h2>;
    }
    case 'text':
      return <p className="c-text">{str(p('text'))}</p>;
    case 'button': {
      const k = kitButton(kit, { label: str(p('label')), variant: str(p('variant')) });
      if (k) return <>{k}</>;
      return <ButtonView node={node} mode={mode} />;
    }
    case 'input': {
      const k = kitInput(kit, {
        label: str(p('label')),
        placeholder: str(p('placeholder')),
        inputType: str(p('inputType')),
      });
      if (k) return <>{k}</>;
      return (
        <label className="c-input">
          <span>{str(p('label'))}</span>
          <input
            type={str(p('inputType'))}
            placeholder={str(p('placeholder'))}
            readOnly={mode === 'edit'}
          />
        </label>
      );
    }
    case 'image':
      return (
        <img
          className="c-image"
          src={str(p('src'))}
          width={num(p('width')) || undefined}
          draggable={false}
          alt=""
        />
      );
    case 'table': {
      const cols = str(p('columns'))
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const rows = Math.max(0, Math.min(20, num(p('rows'))));
      return (
        <table className="c-table">
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                {cols.map((_, c) => (
                  <td key={c}>—</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case 'header':
      return (
        <header className="c-header">
          <strong className="c-header-title">{str(p('title'))}</strong>
          <div className="c-header-actions">
            <Children node={node} mode={mode} />
          </div>
        </header>
      );
    case 'footer':
      return <footer className="c-footer">{str(p('text'))}</footer>;
    case 'metric':
      return <MetricView node={node} mode={mode} />;
    case 'gauge':
      return <GaugeView node={node} mode={mode} />;
    case 'lamp':
      return <LampView node={node} mode={mode} />;
    case 'chart':
      return <ChartView node={node} mode={mode} />;
    case 'setpoint':
      return <SetpointView node={node} mode={mode} />;
    case 'uplot':
      return <UplotView node={node} mode={mode} />;
    case 'echarts':
      return <EChartView node={node} mode={mode} />;
    case 'aggrid':
      return <DataGridView node={node} mode={mode} />;
    case 'disclosure': {
      const k = kitDisclosure(kit, { title: str(p('title')), content: str(p('content')) });
      if (k) return <>{k}</>;
      return (
        <details className="c-disclosure" open={mode === 'edit'}>
          <summary className="c-disclosure-summary">{str(p('title'))}</summary>
          <div className="c-disclosure-content">{str(p('content'))}</div>
        </details>
      );
    }
    case 'menu': {
      const items = str(p('items'))
        .split(',')
        .map((i) => i.trim())
        .filter(Boolean);
      const k = kitMenu(kit, { label: str(p('label')), items });
      if (k) return <>{k}</>;
      return (
        <details className="c-menu">
          <summary className="c-menu-button">{str(p('label'))}</summary>
          <ul className="c-menu-list">
            {items.map((i, idx) => (
              <li key={idx} className="c-menu-item">
                {i}
              </li>
            ))}
          </ul>
        </details>
      );
    }
    case 'switch': {
      const checked = p('checked') === true;
      const k = kitSwitch(kit, { label: str(p('label')), checked });
      if (k) return <>{k}</>;
      return (
        <label className="c-switch">
          <input className="c-switch-input" type="checkbox" defaultChecked={checked} readOnly={mode === 'edit'} />
          <span className="c-switch-track" />
          <span className="c-switch-label">{str(p('label'))}</span>
        </label>
      );
    }
    case 'rating': {
      const max = num(p('max'));
      const v = Math.max(0, Math.min(max, num(p('value'))));
      const k = kitRating(kit, { label: str(p('label')), value: v, max });
      if (k) return <>{k}</>;
      return (
        <div className="c-rating">
          <span className="c-rating-label">{str(p('label'))}</span>
          <span className="c-rating-stars">{'★'.repeat(v) + '☆'.repeat(Math.max(0, max - v))}</span>
        </div>
      );
    }
    case 'slider': {
      const k = kitSlider(kit, {
        label: str(p('label')),
        value: num(p('value')),
        min: num(p('min')),
        max: num(p('max')),
      });
      if (k) return <>{k}</>;
      return (
        <label className="c-slider">
          <span className="c-slider-label">{str(p('label'))}</span>
          <input
            className="c-slider-input"
            type="range"
            min={num(p('min'))}
            max={num(p('max'))}
            defaultValue={num(p('value'))}
            readOnly={mode === 'edit'}
          />
        </label>
      );
    }
    case 'chip': {
      const k = kitChip(kit, { label: str(p('label')), color: str(p('color')) });
      if (k) return <>{k}</>;
      return <span className={`c-chip c-chip-${str(p('color'))}`}>{str(p('label'))}</span>;
    }
    case 'tabs': {
      const tabs = str(p('tabs'))
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const k = kitTabs(kit, { tabs });
      if (k) return <>{k}</>;
      return (
        <div className="c-tabs">
          {tabs.map((t, i) => (
            <div key={i} className="c-tab-section">
              <div className="c-tab-label">{t}</div>
              <div className="c-tab-panel">{t} の内容</div>
            </div>
          ))}
        </div>
      );
    }
  }
}

// AG Grid v33: モジュールは一度だけ登録する
ModuleRegistry.registerModules([AllCommunityModule]);

/** テーマトークンから実際の色を読む(canvas 描画ライブラリは CSS 変数を解決できないため) */
function readColor(varName: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}

/** uPlot 製の時系列折れ線。DataChannel の系列を直近 capacity 件で描画 */
function UplotView({ node, mode }: { node: ComponentNode; mode: RenderMode }) {
  const def = componentDefs.uplot;
  const p = (key: string) => propOf(node, def, key);
  const resolved = useResolvedChannel(node, def);
  const capacity = Math.max(2, num(p('capacity')) || 60);
  const { series } = useMetricSeries(resolved, mode === 'preview', capacity);
  const value = series.length > 0 ? series[series.length - 1]! : null;
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const opts: uPlot.Options = {
      width: hostRef.current.clientWidth || 280,
      height: 120,
      cursor: { show: false },
      legend: { show: false },
      scales: { x: { time: false }, y: { range: [resolved.min, resolved.max] } },
      axes: [{ show: false }, { size: 34, stroke: readColor('--color-text-muted', '#5b6480') }],
      series: [{}, { stroke: readColor('--color-primary', '#4263eb'), width: 2 }],
    };
    const u = new uPlot(opts, [[], []], hostRef.current);
    chartRef.current = u;
    return () => {
      u.destroy();
      chartRef.current = null;
    };
  }, [resolved.min, resolved.max]);

  useEffect(() => {
    const u = chartRef.current;
    if (!u) return;
    u.setData([series.map((_, i) => i), [...series]]);
  }, [series]);

  return (
    <div className="c-uplot">
      <div className="c-uplot-head">
        <span className="c-uplot-label">{str(p('label'))}</span>
        <span className="c-uplot-value">
          {value === null ? '—' : value.toFixed(num(p('decimals')))}
          {str(p('unit'))}
        </span>
      </div>
      <div ref={hostRef} className="c-uplot-canvas" />
    </div>
  );
}

/** Apache ECharts 製チャート(gauge / line / bar)。DataChannel に接続 */
function EChartView({ node, mode }: { node: ComponentNode; mode: RenderMode }) {
  const def = componentDefs.echarts;
  const p = (key: string) => propOf(node, def, key);
  const chartType = (str(p('chartType')) || 'gauge') as 'gauge' | 'line' | 'bar';
  const resolved = useResolvedChannel(node, def);
  const capacity = Math.max(2, num(p('capacity')) || 40);
  const { series } = useMetricSeries(resolved, mode === 'preview', capacity);
  const value = series.length > 0 ? series[series.length - 1]! : 0;
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const c = echarts.init(hostRef.current);
    chartRef.current = c;
    const onResize = () => c.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      c.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const c = chartRef.current;
    if (!c) return;
    c.setOption(
      echartsOption(chartType, {
        label: str(p('label')),
        unit: str(p('unit')),
        min: resolved.min,
        max: resolved.max,
        value,
        series,
        decimals: num(p('decimals')),
        color: readColor('--color-primary', '#4263eb'),
      }),
      true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType, value, series, resolved.min, resolved.max]);

  return (
    <div className="c-echart">
      <div className="c-echart-label">{str(p('label'))}</div>
      <div ref={hostRef} className="c-echart-canvas" />
    </div>
  );
}

/** AG Grid 製データグリッド(ソート/フィルタ可)。列はカンマ区切り、行数分のサンプル */
function DataGridView({ node }: { node: ComponentNode; mode: RenderMode }) {
  const def = componentDefs.aggrid;
  const p = (key: string) => propOf(node, def, key);
  const columnsStr = str(p('columns'));
  const rows = Math.max(0, Math.min(100, num(p('rows'))));
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GridApi | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const columns = columnsStr
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const api = createGrid(hostRef.current, {
      theme: themeQuartz,
      columnDefs: columns.map((c) => ({ field: c, sortable: true, filter: true, flex: 1 })),
      rowData: sampleGridRows(columns, rows),
      pagination: rows > 10,
      paginationPageSize: 10,
    });
    apiRef.current = api;
    return () => api.destroy();
  }, [columnsStr, rows]);

  return <div ref={hostRef} className="c-aggrid" />;
}

/**
 * ノード props からデータチャネル設定を読む(metric / gauge / lamp / chart 共通)。
 * channelRef が登録簿のチャネルを指していればそれを優先、なければ inline props。
 * 生成側 emit-jsx の解決と意味論を一致させること。
 */
function channelOf(
  node: ComponentNode,
  def: ComponentDef,
  channels: ReadonlyArray<DataChannelDef>,
): MetricSource {
  const p = (key: string) => propOf(node, def, key);
  const ref = str(p('channelRef'));
  const ch = ref ? channels.find((c) => c.id === ref) : undefined;
  if (ch) {
    return {
      min: ch.min,
      max: ch.max,
      interval: ch.interval,
      source: ch.source,
      channel: ch.key,
      host: ch.host ?? '',
      unitId: ch.unit ?? 1,
      register: ch.register ?? 0,
      scale: ch.scale ?? 1,
    };
  }
  return {
    min: num(p('min')),
    max: num(p('max')),
    interval: num(p('interval')),
    source: str(p('source')),
    channel: str(p('channel')),
    host: str(p('host')),
    unitId: num(p('unit_id')),
    register: num(p('register')),
    scale: num(p('scale')),
  };
}

/** モニタリング部品の解決済みデータチャネル設定(channelRef 優先)を返すフック */
function useResolvedChannel(node: ComponentNode, def: ComponentDef): MetricSource {
  const channels = useContext(ChannelsContext);
  return channelOf(node, def, channels);
}

const sourceTag = (source: string, connected: boolean): string => {
  if (source !== 'live' && source !== 'modbus') return '';
  const name = source === 'modbus' ? 'MODBUS' : 'LIVE';
  return connected ? `● ${name}` : '○ 再接続中…';
};

/** リアルタイム数値カード。preview では模擬 / ライブ(WS)でライブ更新、edit では静的表示 */
function MetricView({ node, mode }: { node: ComponentNode; mode: RenderMode }) {
  const def = componentDefs.metric;
  const p = (key: string) => propOf(node, def, key);
  const resolved = useResolvedChannel(node, def);
  const source = resolved.source;
  const { value, connected } = useMetricValue(resolved, mode === 'preview');
  const severity = value === null ? 'normal' : metricSeverity(value, node, def);
  const cls = 'c-metric' + (severity !== 'normal' ? ` s-${severity}` : '');
  return (
    <div className={cls}>
      <span className="c-metric-label">
        {str(p('label'))}
        {source !== 'mock' && <span className="c-metric-live">{sourceTag(source, connected)}</span>}
      </span>
      <span className="c-metric-value">
        {value === null ? '—' : value.toFixed(num(p('decimals')))}
        <span className="c-metric-unit">{str(p('unit'))}</span>
      </span>
    </div>
  );
}

/** 横バーゲージ。[min,max] に対する割合をバーで表示、しきい値で色が変わる */
function GaugeView({ node, mode }: { node: ComponentNode; mode: RenderMode }) {
  const def = componentDefs.gauge;
  const p = (key: string) => propOf(node, def, key);
  const resolved = useResolvedChannel(node, def);
  const source = resolved.source;
  const { value, connected } = useMetricValue(resolved, mode === 'preview');
  const min = resolved.min;
  const max = resolved.max;
  const severity = value === null ? 'normal' : metricSeverity(value, node, def);
  const ratio = value === null || max <= min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  const cls = 'c-gauge' + (severity !== 'normal' ? ` s-${severity}` : '');
  return (
    <div className={cls}>
      <div className="c-gauge-head">
        <span className="c-gauge-label">
          {str(p('label'))} {source !== 'mock' && sourceTag(source, connected)}
        </span>
        <span className="c-gauge-value">
          {value === null ? '—' : value.toFixed(num(p('decimals')))}
          {str(p('unit'))}
        </span>
      </div>
      <div className="c-gauge-track">
        <div className="c-gauge-fill" style={{ width: `${(ratio * 100).toFixed(1)}%` }} />
      </div>
    </div>
  );
}

/** ステータスランプ。しきい値の重大度を色付きの丸で示す */
function LampView({ node, mode }: { node: ComponentNode; mode: RenderMode }) {
  const def = componentDefs.lamp;
  const p = (key: string) => propOf(node, def, key);
  const { value } = useMetricValue(useResolvedChannel(node, def), mode === 'preview');
  const severity = value === null ? 'normal' : metricSeverity(value, node, def);
  return (
    <div className="c-lamp">
      <span className={`c-lamp-dot s-${severity}`} />
      <span className="c-lamp-label">{str(p('label'))}</span>
      <span className="c-lamp-value">{value === null ? '—' : value.toFixed(0)}</span>
    </div>
  );
}

/** 直近 capacity サンプルを保持して [min,max] でスケールしたスパークラインを描く */
function ChartView({ node, mode }: { node: ComponentNode; mode: RenderMode }) {
  const def = componentDefs.chart;
  const p = (key: string) => propOf(node, def, key);
  const resolved = useResolvedChannel(node, def);
  const source = resolved.source;
  const capacity = Math.max(2, num(p('capacity')) || 40);
  const { series, connected } = useMetricSeries(resolved, mode === 'preview', capacity);
  const value = series.length > 0 ? series[series.length - 1]! : null;
  const min = resolved.min;
  const max = resolved.max;
  const severity = value === null ? 'normal' : metricSeverity(value, node, def);
  const W = 240;
  const H = 56;
  const points = series
    .map((v, i) => {
      const x = series.length <= 1 ? 0 : (i / (series.length - 1)) * W;
      const r = max <= min ? 0 : Math.min(1, Math.max(0, (v - min) / (max - min)));
      return `${x.toFixed(1)},${(H - r * H).toFixed(1)}`;
    })
    .join(' ');
  const cls = 'c-chart' + (severity !== 'normal' ? ` s-${severity}` : '');
  return (
    <div className={cls}>
      <div className="c-chart-head">
        <span className="c-chart-label">
          {str(p('label'))} {source !== 'mock' && sourceTag(source, connected)}
        </span>
        <span className="c-chart-value">
          {value === null ? '—' : value.toFixed(num(p('decimals')))}
          {str(p('unit'))}
        </span>
      </div>
      <svg className="c-chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {series.length > 1 && <polyline className="c-chart-line" points={points} fill="none" />}
      </svg>
    </div>
  );
}

/** preview 中、現在値を直近 capacity 件のリングバッファに蓄積する(builder 用) */
function useMetricSeries(
  src: MetricSource,
  active: boolean,
  capacity: number,
): { series: number[]; connected: boolean } {
  const { value, connected } = useMetricValue(src, active);
  const [series, setSeries] = useState<number[]>([]);
  useEffect(() => {
    if (value === null) return;
    setSeries((prev) => {
      const next = prev.concat(value);
      return next.length > capacity ? next.slice(next.length - capacity) : next;
    });
  }, [value, capacity]);
  return { series, connected };
}

/** 設定値の書き込みコントロール(FR-RT-05)。preview では実際に BE へ書き込む */
function SetpointView({ node, mode }: { node: ComponentNode; mode: RenderMode }) {
  const def = componentDefs.setpoint;
  const p = (key: string) => propOf(node, def, key);
  const resolved = useResolvedChannel(node, def);
  const [current, setCurrent] = useState<number>(num(p('value')));
  const [status, setStatus] = useState<string>('');
  const live = mode === 'preview';

  const submit = async () => {
    if (!window.confirm(str(p('confirmMessage')))) return;
    setStatus('書き込み中…');
    try {
      const body: Record<string, unknown> = { value: current };
      if (resolved.source === 'modbus') {
        body.kind = 'modbus';
        if (resolved.host) body.host = resolved.host;
        body.unit = resolved.unitId;
        body.register = resolved.register;
        body.scale = resolved.scale;
      }
      const res = await fetch(`/api/channels/${encodeURIComponent(resolved.channel || 'default')}/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; written?: number | null };
      setStatus(res.ok && data.ok ? `書き込み完了${data.written != null ? ` (reg=${data.written})` : ''}` : '書き込み失敗');
    } catch {
      setStatus('通信エラー');
    }
  };

  return (
    <div className="c-setpoint">
      <span className="c-setpoint-label">{str(p('label'))}</span>
      <div className="c-setpoint-row">
        <input
          className="c-setpoint-input"
          type="number"
          value={current}
          onChange={(e) => setCurrent(Number(e.target.value))}
        />
        <span className="c-setpoint-unit">{str(p('unit'))}</span>
        <button className="c-setpoint-btn" type="button" onClick={live ? submit : undefined}>
          {str(p('writeLabel'))}
        </button>
      </div>
      {status && <span className="c-setpoint-status">{status}</span>}
    </div>
  );
}

export type MetricThresholds = Readonly<{
  warnAbove: number | null;
  critAbove: number | null;
  warnBelow: number | null;
  critBelow: number | null;
}>;

/**
 * しきい値アラート(FR-RT-04)の重大度。null のしきい値は無効。
 * 生成コードの metricSeverity と意味論を一致させること。
 */
export function severityOf(v: number, t: MetricThresholds): 'normal' | 'warn' | 'crit' {
  if ((t.critAbove != null && v >= t.critAbove) || (t.critBelow != null && v <= t.critBelow)) return 'crit';
  if ((t.warnAbove != null && v >= t.warnAbove) || (t.warnBelow != null && v <= t.warnBelow)) return 'warn';
  return 'normal';
}

/** ノード props からしきい値を抽出(空欄/非数値は無効=null) */
function metricSeverity(
  v: number,
  node: ComponentNode,
  def: ComponentDef,
): 'normal' | 'warn' | 'crit' {
  const t = (key: string): number | null => {
    const raw = propOf(node, def, key);
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (typeof raw === 'string' && raw.trim() !== '') {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  return severityOf(v, {
    warnAbove: t('warnAbove'),
    critAbove: t('critAbove'),
    warnBelow: t('warnBelow'),
    critBelow: t('critBelow'),
  });
}

type MetricSource = Readonly<{
  min: number;
  max: number;
  interval: number;
  source: string;
  channel: string;
  host: string;
  unitId: number;
  register: number;
  scale: number;
}>;

/**
 * データチャネル抽象(FR-RT-01)。active のとき:
 * - live: BE の WS ゲートウェイ /api/channels/{ch}/stream を購読(MockConnector)
 * - modbus: 同 WS を kind=modbus で購読し ModbusConnector を解決(FR-RT-02)
 * - mock: 模擬データジェネレータ(FR-RT-03)で [min,max] を interval ごとに生成
 */
type ChannelState = Readonly<{ value: number | null; connected: boolean }>;

function useMetricValue(src: MetricSource, active: boolean): ChannelState {
  const [value, setValue] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const { min, max, interval, source, channel, host, unitId, register, scale } = src;
  useEffect(() => {
    if (!active) {
      setConnected(false);
      return;
    }
    if (source === 'live' || source === 'modbus') {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ch = channel || 'default';
      const q = new URLSearchParams({ min: String(min), max: String(max), interval: String(interval) });
      if (source === 'modbus') {
        q.set('kind', 'modbus');
        if (host) q.set('host', host);
        q.set('unit', String(unitId));
        q.set('register', String(register));
        q.set('scale', String(scale));
      }
      const url = `${proto}//${window.location.host}/api/channels/${encodeURIComponent(ch)}/stream?${q.toString()}`;
      // 切断時は指数バックオフで自動再接続(FR-RT-06)
      let closed = false;
      let ws: WebSocket | null = null;
      let retry = 0;
      let timer = 0;
      const open = () => {
        ws = new WebSocket(url);
        ws.onopen = () => {
          retry = 0;
          setConnected(true);
        };
        ws.onmessage = (e) => {
          try {
            setValue((JSON.parse(e.data as string) as { value: number }).value);
          } catch {
            /* ignore malformed */
          }
        };
        ws.onclose = () => {
          setConnected(false);
          if (closed) return;
          const delay = Math.min(5000, 500 * 2 ** retry);
          retry += 1;
          timer = window.setTimeout(open, delay);
        };
        ws.onerror = () => {
          try {
            ws?.close();
          } catch {
            /* ignore */
          }
        };
      };
      open();
      return () => {
        closed = true;
        clearTimeout(timer);
        if (ws) ws.close();
      };
    }
    setConnected(true);
    const tick = () => setValue(min + Math.random() * (max - min));
    tick();
    const id = setInterval(tick, Math.max(200, interval));
    return () => clearInterval(id);
  }, [min, max, interval, source, channel, host, unitId, register, scale, active]);
  return { value, connected };
}

function ButtonView({ node, mode }: { node: ComponentNode; mode: RenderMode }) {
  const def = componentDefs.button;
  const runner = useContext(ActionRunnerContext);
  const handleClick =
    mode === 'preview' && runner ? () => runner.run(node.events, 'onClick') : undefined;
  return (
    <button
      type="button"
      className={`c-button v-${str(propOf(node, def, 'variant'))}`}
      onClick={handleClick}
    >
      {str(propOf(node, def, 'label'))}
    </button>
  );
}

function Children({ node, mode }: { node: ComponentNode; mode: RenderMode }) {
  if (!componentDefs[node.type].acceptsChildren) return null;
  if (mode === 'preview') {
    return (
      <>
        {node.children.map((c) => (
          <NodeBody key={c.id} node={c} mode="preview" />
        ))}
      </>
    );
  }
  return <EditChildren node={node} />;
}

/** 編集モードの子要素描画: 各子をドラッグ可能にし、間にドロップゾーンを挟む */
function EditChildren({ node }: { node: ComponentNode }) {
  if (node.children.length === 0) {
    return <DropArea parentId={node.id} index={0} label="ここにドロップ" className="drop-empty" />;
  }
  return (
    <>
      <DropArea parentId={node.id} index={0} className="dropzone" />
      {node.children.map((c, i) => (
        <Fragment key={c.id}>
          <EditNodeView node={c} />
          <DropArea parentId={node.id} index={i + 1} className="dropzone" />
        </Fragment>
      ))}
    </>
  );
}

export function EditNodeView({ node }: { node: ComponentNode }) {
  const ctx = useEditInteraction();
  const def = componentDefs[node.type];
  const selected = ctx.selectedId === node.id;
  return (
    <div
      className={`enode${selected ? ' selected' : ''}`}
      draggable
      onClick={(e) => {
        e.stopPropagation();
        ctx.onSelect(node.id);
      }}
      onDragStart={(e) => {
        e.stopPropagation();
        DragPayload.write(e, { kind: 'move', nodeId: node.id });
        ctx.onDragStart();
      }}
      onDragEnd={ctx.onDragEnd}
    >
      <span className="enode-tag">{def.label}</span>
      <NodeBody node={node} mode="edit" />
    </div>
  );
}

function DropArea({
  parentId,
  index,
  className,
  label,
}: {
  parentId: NodeId;
  index: number;
  className: string;
  label?: string;
}) {
  const ctx = useEditInteraction();
  const [over, setOver] = useState(false);
  return (
    <div
      className={`${className}${ctx.dragging ? ' active' : ''}${over ? ' over' : ''}`}
      onDragOver={(e) => {
        if (!DragPayload.isPresent(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const payload = DragPayload.read(e);
        if (payload) ctx.onDrop(parentId, index, payload);
      }}
    >
      {label ?? null}
    </div>
  );
}

/** 編集対象の木のルート。ドラッグ不可・クリックで選択のみ */
export function EditRootView({ tree }: { tree: ComponentNode }) {
  const ctx = useEditInteraction();
  const selected = ctx.selectedId === tree.id;
  return (
    <div
      className={`enode-root${selected ? ' selected' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        ctx.onSelect(tree.id);
      }}
    >
      <NodeBody node={tree} mode="edit" />
    </div>
  );
}

export function nodeSummaryLabel(node: ComponentNode): ReactNode {
  const def = componentDefs[node.type];
  const text = node.props['text'] ?? node.props['label'] ?? node.props['title'] ?? '';
  const snippet = String(text).slice(0, 12);
  return snippet ? `${def.label}「${snippet}」` : def.label;
}
