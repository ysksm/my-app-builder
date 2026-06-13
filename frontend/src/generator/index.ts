import { ComponentNode } from '@/domain/component-node';
import type { ProjectDoc } from '@/domain/project-doc';
import { emitApiFiles } from './emit-api';
import { emitTokensCss, emitAppCss } from './emit-css';
import { emitCrudFiles } from './emit-crud';
import { emitDomainFiles } from './emit-domain';
import { emitComponentFile } from './emit-jsx';
import { emitOpenApi } from './emit-openapi';
import { emitProjectShell } from './emit-project';
import { emitTypeSpec } from './emit-typespec';
import { emitUsecaseFiles } from './emit-usecase';
import type { GeneratedFile } from './files';
import { buildNameTable } from './identifiers';
import { deriveInterfaceModel } from './interface-model';
import { paths } from './layout';

export type { GeneratedFile } from './files';

/** ドキュメント内にリアルタイムモニタリング部品(metric / gauge / lamp)があるか */
const usesMetric = (doc: ProjectDoc): boolean => {
  const isRealtime = (t: ComponentNode['type']): boolean =>
    t === 'metric' || t === 'gauge' || t === 'lamp' || t === 'chart' || t === 'setpoint';
  const treeHas = (node: ComponentNode): boolean =>
    isRealtime(node.type) || node.children.some(treeHas);
  return (
    doc.pages.some((pg) => treeHas(pg.root)) ||
    doc.dialogs.some((d) => treeHas(d.root)) ||
    (doc.layout.header !== null && treeHas(doc.layout.header)) ||
    (doc.layout.footer !== null && treeHas(doc.layout.footer))
  );
};

/** リアルタイムモニタリングのランタイム(データチャネル + Metric / Gauge / Lamp)。
 *  Metric/Gauge/Lamp は同じ useChannel(購読)/ metricSeverity(しきい値)/ useAlert を共有する。 */
const realtimeRuntimeTsx = `// 自動生成 — AppForge: リアルタイムモニタリング(DataChannel: mock / live / modbus)
import { useEffect, useRef, useState } from 'react';

export type Severity = 'normal' | 'warn' | 'crit';

export type Thresholds = {
  // しきい値アラート(FR-RT-04)。未指定=無効
  warnAbove?: number;
  critAbove?: number;
  warnBelow?: number;
  critBelow?: number;
};

const RANK: Record<Severity, number> = { normal: 0, warn: 1, crit: 2 };

/** 値としきい値から重大度を判定(上限/下限の危険を優先、>= / <=) */
export function metricSeverity(v: number, t: Thresholds): Severity {
  if ((t.critAbove != null && v >= t.critAbove) || (t.critBelow != null && v <= t.critBelow)) return 'crit';
  if ((t.warnAbove != null && v >= t.warnAbove) || (t.warnBelow != null && v <= t.warnBelow)) return 'warn';
  return 'normal';
}

export type ChannelConfig = {
  source: 'mock' | 'live' | 'modbus';
  channel: string;
  min: number;
  max: number;
  interval: number;
  // Modbus/TCP(source=modbus のときのみ使用)
  host?: string;
  unitId?: number;
  register?: number;
  scale?: number;
};

/** データチャネルの低レベル購読(FR-RT-01/06)。サンプルごとに onSample、接続状態は onStatus。
 *  WS は切断時に指数バックオフで自動再接続する(FR-RT-06)。解除関数を返す。 */
function subscribe(
  cfg: ChannelConfig,
  onSample: (v: number) => void,
  onStatus: (connected: boolean) => void,
): () => void {
  const { source, channel, min, max, interval, host, unitId, register, scale } = cfg;
  if (source === 'live' || source === 'modbus') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ch = channel || 'default';
    const q = new URLSearchParams();
    q.set('min', String(min));
    q.set('max', String(max));
    q.set('interval', String(interval));
    if (source === 'modbus') {
      q.set('kind', 'modbus');
      if (host) q.set('host', host);
      if (unitId != null) q.set('unit', String(unitId));
      if (register != null) q.set('register', String(register));
      if (scale != null) q.set('scale', String(scale));
    }
    const url =
      proto + '//' + window.location.host + '/api/channels/' + encodeURIComponent(ch) +
      '/stream?' + q.toString();

    let closed = false;
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer = 0;
    const open = () => {
      ws = new WebSocket(url);
      ws.onopen = () => {
        retry = 0;
        onStatus(true);
      };
      ws.onmessage = (e) => {
        try {
          onSample((JSON.parse(e.data as string) as { value: number }).value);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        onStatus(false);
        if (closed) return;
        // 指数バックオフ(最大5秒)で再接続(FR-RT-06)
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
    onStatus(false);
    open();
    return () => {
      closed = true;
      clearTimeout(timer);
      if (ws) ws.close();
    };
  }
  // 模擬データジェネレータ(常時「接続」扱い)
  onStatus(true);
  const tick = () => onSample(min + Math.random() * (max - min));
  tick();
  const id = setInterval(tick, Math.max(200, interval));
  return () => clearInterval(id);
}

/** 現在値 + 接続状態を購読する */
export function useChannelState(cfg: ChannelConfig): { value: number | null; connected: boolean } {
  const { source, channel, min, max, interval, host, unitId, register, scale } = cfg;
  const [value, setValue] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  useEffect(
    () => subscribe({ source, channel, min, max, interval, host, unitId, register, scale }, setValue, setConnected),
    [source, channel, min, max, interval, host, unitId, register, scale],
  );
  return { value, connected };
}

/** 現在値のみ */
export function useChannel(cfg: ChannelConfig): number | null {
  return useChannelState(cfg).value;
}

/** 直近 capacity サンプルの時系列バッファ + 接続状態(FR-RT-03/06)。チャート部品が使う。 */
export function useSeriesState(
  cfg: ChannelConfig,
  capacity: number,
): { series: number[]; connected: boolean } {
  const { source, channel, min, max, interval, host, unitId, register, scale } = cfg;
  const cap = Math.max(2, capacity);
  const [series, setSeries] = useState<number[]>([]);
  const [connected, setConnected] = useState(false);
  useEffect(
    () =>
      subscribe(
        { source, channel, min, max, interval, host, unitId, register, scale },
        (v) =>
          setSeries((prev) => {
            const next = prev.concat(v);
            return next.length > cap ? next.slice(next.length - cap) : next;
          }),
        setConnected,
      ),
    [source, channel, min, max, interval, host, unitId, register, scale, cap],
  );
  return { series, connected };
}

/** 時系列のみ */
export function useSeries(cfg: ChannelConfig, capacity: number): number[] {
  return useSeriesState(cfg, capacity).series;
}

/** アプリイベント(FR-RT-04): app シェルがこれを購読してトースト等に橋渡しする */
export type MetricAlert = { label: string; value: number; unit: string; severity: Severity };

/** 重大度が上昇したときだけ window アラートイベントを発火(同レベル継続では再発火しない) */
export function useAlert(label: string, unit: string, value: number | null, severity: Severity): void {
  const prevRank = useRef(0);
  useEffect(() => {
    if (value === null) return;
    const rank = RANK[severity];
    if (rank > prevRank.current && rank > 0) {
      const detail: MetricAlert = { label, value, unit, severity };
      window.dispatchEvent(new CustomEvent('appforge:alert', { detail }));
    }
    prevRank.current = rank;
  }, [severity, value, label, unit]);
}

export type RealtimeProps = ChannelConfig &
  Thresholds & { label: string; unit?: string; decimals?: number };

// 接続状態を含むデータ源タグ。切断中は再接続中表示(FR-RT-06)
function sourceTag(source: string, connected: boolean): string {
  if (source !== 'live' && source !== 'modbus') return '';
  const name = source === 'modbus' ? 'MODBUS' : 'LIVE';
  return connected ? ' ● ' + name : ' ○ 再接続中…';
}

/** 数値カード */
export function Metric(props: RealtimeProps) {
  const { label, unit = '', decimals = 0 } = props;
  const { value, connected } = useChannelState(props);
  const severity: Severity = value === null ? 'normal' : metricSeverity(value, props);
  useAlert(label, unit, value, severity);
  const cls = 'c-metric' + (severity !== 'normal' ? ' s-' + severity : '');
  return (
    <div className={cls}>
      <span className="c-metric-label">{label}{sourceTag(props.source, connected)}</span>
      <span className="c-metric-value">
        {value === null ? '—' : value.toFixed(decimals)}
        <span className="c-metric-unit">{unit}</span>
      </span>
    </div>
  );
}

/** 横バーゲージ。[min,max] に対する現在値の割合をバーで表し、しきい値で色を変える */
export function Gauge(props: RealtimeProps) {
  const { label, unit = '', decimals = 1, min, max } = props;
  const { value, connected } = useChannelState(props);
  const severity: Severity = value === null ? 'normal' : metricSeverity(value, props);
  useAlert(label, unit, value, severity);
  const ratio = value === null || max <= min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  const cls = 'c-gauge' + (severity !== 'normal' ? ' s-' + severity : '');
  return (
    <div className={cls}>
      <div className="c-gauge-head">
        <span className="c-gauge-label">{label}{sourceTag(props.source, connected)}</span>
        <span className="c-gauge-value">
          {value === null ? '—' : value.toFixed(decimals)}{unit}
        </span>
      </div>
      <div className="c-gauge-track">
        <div className="c-gauge-fill" style={{ width: (ratio * 100).toFixed(1) + '%' }} />
      </div>
    </div>
  );
}

/** ステータスランプ。しきい値の重大度を色付きの丸で示す(正常=緑 / 警告=黄 / 危険=赤) */
export function Lamp(props: RealtimeProps) {
  const { label, unit = '', decimals = 0 } = props;
  const value = useChannel(props);
  const severity: Severity = value === null ? 'normal' : metricSeverity(value, props);
  useAlert(label, unit, value, severity);
  return (
    <div className="c-lamp">
      <span className={'c-lamp-dot s-' + severity} />
      <span className="c-lamp-label">{label}</span>
      <span className="c-lamp-value">
        {value === null ? '—' : value.toFixed(decimals)}{unit}
      </span>
    </div>
  );
}

/** スパークライン折れ線チャート(FR-RT-03)。直近 capacity サンプルを時系列表示する */
export function Chart(props: RealtimeProps & { capacity?: number }) {
  const { label, unit = '', decimals = 1, min, max, capacity = 40 } = props;
  const { series, connected } = useSeriesState(props, capacity);
  const value = series.length > 0 ? series[series.length - 1] : null;
  const severity: Severity = value === null ? 'normal' : metricSeverity(value, props);
  useAlert(label, unit, value, severity);
  const W = 240;
  const H = 56;
  const points = series
    .map((v, i) => {
      const x = series.length <= 1 ? 0 : (i / (series.length - 1)) * W;
      const r = max <= min ? 0 : Math.min(1, Math.max(0, (v - min) / (max - min)));
      return x.toFixed(1) + ',' + (H - r * H).toFixed(1);
    })
    .join(' ');
  const cls = 'c-chart' + (severity !== 'normal' ? ' s-' + severity : '');
  return (
    <div className={cls}>
      <div className="c-chart-head">
        <span className="c-chart-label">{label}{sourceTag(props.source, connected)}</span>
        <span className="c-chart-value">
          {value === null ? '—' : value.toFixed(decimals)}{unit}
        </span>
      </div>
      <svg className="c-chart-svg" viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none">
        {series.length > 1 && <polyline className="c-chart-line" points={points} fill="none" />}
      </svg>
    </div>
  );
}

export type SetpointProps = {
  label: string;
  unit: string;
  value: number;
  source: 'mock' | 'live' | 'modbus';
  channel: string;
  host?: string;
  unitId?: number;
  register?: number;
  scale?: number;
  writeLabel: string;
  confirmMessage: string;
};

/** 設定値の書き込み(FR-RT-05)。確認の上 BE の write エンドポイント経由で機器へ書く */
export function Setpoint(props: SetpointProps) {
  const { label, unit, value, source, channel, host, unitId, register, scale, writeLabel, confirmMessage } = props;
  const [current, setCurrent] = useState<number>(value);
  const [status, setStatus] = useState<string>('');
  const submit = async () => {
    if (!window.confirm(confirmMessage)) return;
    setStatus('書き込み中…');
    try {
      const body: Record<string, unknown> = { value: current };
      if (source === 'modbus') {
        body.kind = 'modbus';
        if (host) body.host = host;
        if (unitId != null) body.unit = unitId;
        if (register != null) body.register = register;
        if (scale != null) body.scale = scale;
      }
      const res = await fetch('/api/channels/' + encodeURIComponent(channel || 'default') + '/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; written?: number | null };
      setStatus(res.ok && data.ok ? '書き込み完了' + (data.written != null ? ' (reg=' + data.written + ')' : '') : '書き込み失敗');
    } catch {
      setStatus('通信エラー');
    }
  };
  return (
    <div className="c-setpoint">
      <span className="c-setpoint-label">{label}</span>
      <div className="c-setpoint-row">
        <input
          className="c-setpoint-input"
          type="number"
          value={current}
          onChange={(e) => setCurrent(Number(e.target.value))}
        />
        <span className="c-setpoint-unit">{unit}</span>
        <button className="c-setpoint-btn" type="button" onClick={submit}>{writeLabel}</button>
      </div>
      {status && <span className="c-setpoint-status">{status}</span>}
    </div>
  );
}
`;

/**
 * ProjectDoc → ビルド可能な React アプリのソース一式(features × レイヤード構成)。
 * 純粋関数(I/O なし)。書き出し・ビルドは BE のビルドランナーが担う。
 */
export const generateProject = (doc: ProjectDoc, projectName: string): GeneratedFile[] => {
  const names = buildNameTable(doc);
  const ifModel = deriveInterfaceModel(doc.dataModel, `${projectName} API`);
  return [
    ...emitProjectShell(doc, projectName, names),
    ...emitDomainFiles(doc.dataModel),
    ...emitApiFiles(doc.dataModel),
    ...emitCrudFiles(doc.dataModel),
    ...emitUsecaseFiles(doc.dataModel),
    // TypeSpec アダプタによる I/F 定義の export(集約があるときのみ)。
    // interface/ は src 外なのでアプリのビルド対象にはならない設計ドキュメント兼コード生成元。
    // I/F アダプタ(中立モデル → 各 IDL)。集約があるとき TypeSpec / OpenAPI を併出力。
    ...(ifModel.operations.length > 0
      ? [
          { path: 'interface/main.tsp', content: emitTypeSpec(ifModel) },
          { path: 'interface/openapi.json', content: emitOpenApi(ifModel) },
        ]
      : []),
    ...doc.pages.map((page, i) => ({
      path: paths.page(i),
      content: emitComponentFile({
        componentName: `Page${i}`,
        originalName: page.name,
        root: page.root,
        names,
        filePath: paths.page(i),
        channels: doc.channels,
      }),
    })),
    ...doc.dialogs.map((dialog, i) => ({
      path: paths.dialog(i),
      content: emitComponentFile({
        componentName: `Dialog${i}`,
        originalName: dialog.title,
        root: dialog.root,
        names,
        filePath: paths.dialog(i),
        channels: doc.channels,
      }),
    })),
    { path: paths.tokensCss, content: emitTokensCss(doc.tokens, doc.styleEmitter) },
    { path: paths.appCss, content: emitAppCss() },
    // リアルタイム: 数値カードを使うときだけ Metric コンポーネントを出力
    ...(usesMetric(doc) ? [{ path: paths.realtimeRuntime, content: realtimeRuntimeTsx }] : []),
    // カスタムコード保護(FR-GEN-05)の第1消費者: ユーザー編集可・再生成で保持
    {
      path: paths.overridesCss,
      overwrite: false,
      content:
        '/* AppForge: カスタムスタイル。このファイルは再生成で上書きされません。 */\n' +
        '/* app.css の後に読み込まれるため、トークン変数を使った上書きをここに書けます。 */\n',
    },
  ];
};
