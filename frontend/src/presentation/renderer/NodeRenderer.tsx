import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
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
import type { ComponentNode, GridLayout, PropValue } from '@/domain/component-node';
import { GRID, autoLayout, clampLayout, gridItemStyle } from '@/domain/grid';
import { alignCss, justifyCss, wrapCss } from '@/domain/flex-style';
import { hasNodeStyle } from '@/domain/node-style';
import type { DataChannelDef } from '@/domain/data-channel';
import type { NodeId } from '@/domain/ids';
import { componentDefs, propValueOf, type ComponentDef } from '@/domain/catalog/component-defs';
import { DragPayload, useEditInteraction } from '../editor/edit-interaction';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { nodePropsUpdated } from '../store/editor-slice';
import { tableDataFromModel } from '@/application/table-bind';
import {
  kitAlert,
  kitAvatar,
  kitBadge,
  kitButton,
  kitChip,
  kitCombobox,
  kitDisclosure,
  kitInput,
  kitMenu,
  kitProgress,
  kitRating,
  kitSearchField,
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
      if (str(p('layoutMode')) === 'grid') {
        const gstyle: CSSProperties = {
          display: 'grid',
          gridTemplateColumns: `repeat(${GRID.cols}, 1fr)`,
          gridAutoRows: `${GRID.rowH}px`,
          gap: GRID.gap,
          padding: num(p('padding')),
          background: str(p('background')) || undefined,
        };
        return <GridContainer node={node} mode={mode} style={gstyle} />;
      }
      const direction = str(p('direction')) === 'row' ? 'row' : 'column';
      const style: CSSProperties = {
        display: 'flex',
        flexDirection: direction,
        justifyContent: justifyCss(str(p('justifyContent'))),
        alignItems: alignCss(str(p('alignItems'))),
        flexWrap: wrapCss(str(p('flexWrap'))) as CSSProperties['flexWrap'],
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
      const required = p('required') === true;
      const k = kitInput(kit, {
        label: str(p('label')),
        placeholder: str(p('placeholder')),
        inputType: str(p('inputType')),
        required,
      });
      if (k) return <>{k}</>;
      return (
        <label className="c-input">
          <span>
            {str(p('label'))}
            {required ? ' *' : ''}
          </span>
          <input
            type={str(p('inputType'))}
            placeholder={str(p('placeholder'))}
            required={required}
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
    case 'table':
      return <TableView node={node} />;
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
    case 'form':
      return (
        <form className="c-form" onSubmit={(e) => e.preventDefault()}>
          <Children node={node} mode={mode} />
          <button type="submit" className="c-button v-primary">
            {str(p('submitLabel'))}
          </button>
        </form>
      );
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
    case 'alert': {
      const k = kitAlert(kit, { message: str(p('message')), severity: str(p('severity')) });
      if (k) return <>{k}</>;
      return <div className={`c-alert c-alert-${str(p('severity'))}`}>{str(p('message'))}</div>;
    }
    case 'badge': {
      const k = kitBadge(kit, { label: str(p('label')), count: num(p('count')), color: str(p('color')) });
      if (k) return <>{k}</>;
      return (
        <span className="c-badge-wrap">
          <span className="c-badge-label">{str(p('label'))}</span>
          <span className={`c-badge c-badge-${str(p('color'))}`}>{num(p('count'))}</span>
        </span>
      );
    }
    case 'avatar': {
      const k = kitAvatar(kit, { label: str(p('label')) });
      if (k) return <>{k}</>;
      return <span className="c-avatar">{str(p('label'))}</span>;
    }
    case 'combobox': {
      const options = str(p('options'))
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      const k = kitCombobox(kit, { options, placeholder: str(p('placeholder')) });
      if (k) return <>{k}</>;
      return (
        <select className="c-combobox-input" defaultValue="" disabled={mode === 'edit'}>
          {options.map((o, i) => (
            <option key={i} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    case 'progress': {
      const v = Math.max(0, Math.min(100, num(p('value'))));
      const k = kitProgress(kit, { label: str(p('label')), value: v });
      if (k) return <>{k}</>;
      return (
        <div className="c-progress">
          <span className="c-progress-label">
            {str(p('label'))}({v}%)
          </span>
          <div className="c-progress-track">
            <div className="c-progress-fill" style={{ width: `${v}%` }} />
          </div>
        </div>
      );
    }
    case 'searchfield': {
      const k = kitSearchField(kit, { label: str(p('label')), placeholder: str(p('placeholder')) });
      if (k) return <>{k}</>;
      return (
        <label className="c-input">
          <span>{str(p('label'))}</span>
          <input type="search" placeholder={str(p('placeholder'))} readOnly={mode === 'edit'} />
        </label>
      );
    }
  }
}

/** テーブル。bindAggregate が集約を指していれば列・行をデータモデルから生成(design-time バインド) */
function TableView({ node }: { node: ComponentNode }) {
  const def = componentDefs.table;
  const p = (key: string) => propOf(node, def, key);
  const dataModel = useAppSelector((s) => s.editor.doc.dataModel);
  const rowCount = Math.max(0, Math.min(20, num(p('rows'))));
  const bound = str(p('bindAggregate')) ? tableDataFromModel(dataModel, str(p('bindAggregate')), rowCount) : null;
  const cols = bound
    ? bound.columns
    : str(p('columns'))
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  const rows: string[][] = bound ? bound.rows : Array.from({ length: rowCount }, () => cols.map(() => '—'));
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
        {rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td key={c}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
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
        {node.children.map((c) =>
          hasNodeStyle(c) ? (
            <div key={c.id} style={c.style as CSSProperties}>
              <NodeBody node={c} mode="preview" />
            </div>
          ) : (
            <NodeBody key={c.id} node={c} mode="preview" />
          ),
        )}
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

/** flow(flex) コンテナか? — 整列ウィジェットの表示判定 */
const isFlowContainer = (node: ComponentNode): boolean =>
  node.type === 'container' &&
  String(propValueOf(node.props, componentDefs.container, 'layoutMode')) !== 'grid';

/** ドラッグで数値を増減する小コントロール(余白の調整に使う) */
function DragNumber({
  label,
  value,
  onCommit,
  perPx = 4,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  perPx?: number;
}) {
  const [live, setLive] = useState<number | null>(null);
  const liveRef = useRef(value);
  const start = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sv = value;
    liveRef.current = sv;
    const onMove = (ev: PointerEvent) => {
      const v = Math.max(0, Math.round(sv + (ev.clientX - sx) / perPx));
      liveRef.current = v;
      setLive(v);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setLive(null);
      onCommit(liveRef.current);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  return (
    <button type="button" className="ft-pad" title="左右ドラッグで調整" onPointerDown={start}>
      {label} {live ?? value}
    </button>
  );
}

/** 選択中の flex コンテナに重ねる整列ウィジェット(方向 / justify / align / 余白) */
function FlexToolbar({ node }: { node: ComponentNode }) {
  const dispatch = useAppDispatch();
  const cdef = componentDefs.container;
  const cur = (k: string) => String(propValueOf(node.props, cdef, k));
  const setP = (patch: Record<string, string | number>) =>
    dispatch(nodePropsUpdated({ nodeId: node.id, patch }));
  const dir = cur('direction') === 'row' ? 'row' : 'column';
  const justify = cur('justifyContent');
  const align = cur('alignItems');
  const padding = Number(propValueOf(node.props, cdef, 'padding')) || 0;

  const btn = (key: string, value: string, current: string, glyph: string, tip: string) => (
    <button
      type="button"
      className={`ft-btn${current === value ? ' active' : ''}`}
      title={tip}
      onClick={(e) => {
        e.stopPropagation();
        setP({ [key]: value });
      }}
    >
      {glyph}
    </button>
  );

  return (
    <div
      className="flex-toolbar"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="ft-group" title="方向 flex-direction">
        {btn('direction', 'row', dir, '↔', '横 flex-row')}
        {btn('direction', 'column', dir, '↕', '縦 flex-col')}
      </div>
      <div className="ft-group" title="主軸 justify-content">
        {btn('justifyContent', 'start', justify, '⊢', 'justify-start')}
        {btn('justifyContent', 'center', justify, '⊟', 'justify-center')}
        {btn('justifyContent', 'end', justify, '⊣', 'justify-end')}
        {btn('justifyContent', 'between', justify, '⊪', 'justify-between')}
      </div>
      <div className="ft-group" title="交差軸 align-items">
        {btn('alignItems', 'start', align, '▏', 'items-start')}
        {btn('alignItems', 'center', align, '▢', 'items-center')}
        {btn('alignItems', 'end', align, '▕', 'items-end')}
        {btn('alignItems', 'stretch', align, '↕', 'items-stretch')}
      </div>
      <DragNumber label="余白" value={padding} onCommit={(v) => setP({ padding: v })} />
    </div>
  );
}

export function EditNodeView({ node }: { node: ComponentNode }) {
  const ctx = useEditInteraction();
  const def = componentDefs[node.type];
  const selected = ctx.selectedId === node.id;
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<{ width?: string; height?: string } | null>(null);
  const [resizing, setResizing] = useState(false);
  const liveRef = useRef<{ width?: string; height?: string }>({});
  const style = { ...(node.style as CSSProperties | undefined), ...(live ?? {}) };

  // 辺リサイズ: ドラッグ中はネイティブ DnD を無効化し px で width/height を確定
  const startResize = (e: ReactPointerEvent, axis: 'x' | 'y' | 'xy') => {
    e.preventDefault();
    e.stopPropagation();
    ctx.onSelect(node.id);
    setResizing(true);
    if (ref.current) ref.current.draggable = false;
    const rect = ref.current?.getBoundingClientRect();
    const sw = rect?.width ?? 0;
    const sh = rect?.height ?? 0;
    const sx = e.clientX;
    const sy = e.clientY;
    liveRef.current = {};
    const onMove = (ev: PointerEvent) => {
      const next: { width?: string; height?: string } = {};
      if (axis !== 'y') next.width = `${Math.max(24, Math.round(sw + ev.clientX - sx))}px`;
      if (axis !== 'x') next.height = `${Math.max(24, Math.round(sh + ev.clientY - sy))}px`;
      liveRef.current = next;
      setLive(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setResizing(false);
      setLive(null);
      if (ref.current) ref.current.draggable = true;
      const v = liveRef.current;
      if (v.width || v.height) ctx.onStyle(node.id, v);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={ref}
      className={`enode${selected ? ' selected' : ''}`}
      style={style}
      draggable={!resizing}
      onClick={(e) => {
        e.stopPropagation();
        ctx.onSelect(node.id);
      }}
      onDragStart={(e) => {
        // ツールバー/リサイズハンドル発のドラッグはノード移動にしない
        if ((e.target as HTMLElement).closest('.flex-toolbar, .enode-resize')) {
          e.preventDefault();
          return;
        }
        e.stopPropagation();
        DragPayload.write(e, { kind: 'move', nodeId: node.id });
        ctx.onDragStart();
      }}
      onDragEnd={ctx.onDragEnd}
    >
      <span className="enode-tag">{def.label}</span>
      <NodeBody node={node} mode="edit" />
      {selected && isFlowContainer(node) && <FlexToolbar node={node} />}
      {selected && (
        <>
          <span className="enode-resize e" onPointerDown={(e) => startResize(e, 'x')} />
          <span className="enode-resize s" onPointerDown={(e) => startResize(e, 'y')} />
          <span className="enode-resize se" onPointerDown={(e) => startResize(e, 'xy')} />
        </>
      )}
    </div>
  );
}

/** グリッドレイアウトのコンテナ。プレビューは CSS grid のみ、編集はドラッグ移動・リサイズ可能 */
function GridContainer({
  node,
  mode,
  style,
}: {
  node: ComponentNode;
  mode: RenderMode;
  style: CSSProperties;
}) {
  if (mode === 'preview') {
    return (
      <div className="c-container c-grid" style={style}>
        {node.children.map((c, i) => (
          <div key={c.id} style={gridItemStyle(c.layout ?? autoLayout(i))}>
            <NodeBody node={c} mode="preview" />
          </div>
        ))}
      </div>
    );
  }
  return <GridEditContainer node={node} style={style} />;
}

function GridEditContainer({ node, style }: { node: ComponentNode; style: CSSProperties }) {
  const ctx = useEditInteraction();
  const gridRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={gridRef}
      className="c-container c-grid editing"
      style={style}
      onDragOver={(e) => {
        if (!DragPayload.isPresent(e)) return;
        e.preventDefault();
      }}
      onDrop={(e) => {
        if (!DragPayload.isPresent(e)) return;
        e.preventDefault();
        e.stopPropagation();
        const payload = DragPayload.read(e);
        if (payload) ctx.onDrop(node.id, node.children.length, payload);
      }}
    >
      {node.children.map((c, i) => (
        <GridItem key={c.id} node={c} index={i} gridRef={gridRef} />
      ))}
      {node.children.length === 0 && (
        <div className="grid-empty-hint">グリッド: パーツをここにドロップ</div>
      )}
    </div>
  );
}

function GridItem({
  node,
  index,
  gridRef,
}: {
  node: ComponentNode;
  index: number;
  gridRef: RefObject<HTMLDivElement | null>;
}) {
  const ctx = useEditInteraction();
  const def = componentDefs[node.type];
  const base = node.layout ?? autoLayout(index);
  const [live, setLive] = useState<GridLayout | null>(null);
  const liveRef = useRef<GridLayout | null>(null);
  const selected = ctx.selectedId === node.id;
  const layout = live ?? base;

  const startDrag = (e: ReactPointerEvent, kind: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    ctx.onSelect(node.id);
    const el = gridRef.current;
    const colStep = el ? (el.clientWidth - GRID.gap * (GRID.cols - 1)) / GRID.cols + GRID.gap : 60;
    const rowStep = GRID.rowH + GRID.gap;
    const sx = e.clientX;
    const sy = e.clientY;
    const start = base;
    const onMove = (ev: PointerEvent) => {
      const dcol = Math.round((ev.clientX - sx) / colStep);
      const drow = Math.round((ev.clientY - sy) / rowStep);
      const next =
        kind === 'move'
          ? clampLayout({ ...start, x: start.x + dcol, y: start.y + drow })
          : clampLayout({ ...start, w: start.w + dcol, h: start.h + drow });
      liveRef.current = next;
      setLive(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const v = liveRef.current;
      liveRef.current = null;
      setLive(null);
      if (v) ctx.onLayout(node.id, v);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      className={`grid-item${selected ? ' selected' : ''}`}
      style={gridItemStyle(layout)}
      onPointerDown={(e) => startDrag(e, 'move')}
    >
      <span className="enode-tag">{def.label}</span>
      <div className="grid-item-body">
        <NodeBody node={node} mode="edit" />
      </div>
      <span
        className="grid-resize"
        onPointerDown={(e) => startDrag(e, 'resize')}
        aria-hidden="true"
      />
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
      {selected && isFlowContainer(tree) && <FlexToolbar node={tree} />}
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
