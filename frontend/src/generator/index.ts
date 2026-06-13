import { ComponentNode } from '@/domain/component-node';
import type { ProjectDoc } from '@/domain/project-doc';
import { emitApiFiles } from './emit-api';
import { emitTokensCss, emitAppCss } from './emit-css';
import { emitCrudFiles } from './emit-crud';
import { emitDomainFiles } from './emit-domain';
import { emitComponentFile } from './emit-jsx';
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
    t === 'metric' || t === 'gauge' || t === 'lamp';
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

/** データチャネル購読(FR-RT-01): mock=模擬ジェネレータ, live/modbus=BE WS ゲートウェイ */
export function useChannel(cfg: ChannelConfig): number | null {
  const { source, channel, min, max, interval, host, unitId, register, scale } = cfg;
  const [value, setValue] = useState<number | null>(null);
  useEffect(() => {
    if (source === 'live' || source === 'modbus') {
      // BE の WS ゲートウェイ /api/channels/{ch}/stream を購読
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ch = channel || 'default';
      const q = new URLSearchParams();
      q.set('min', String(min));
      q.set('max', String(max));
      q.set('interval', String(interval));
      if (source === 'modbus') {
        // BE は kind=modbus で ModbusConnector を解決(FR-RT-02)
        q.set('kind', 'modbus');
        if (host) q.set('host', host);
        if (unitId != null) q.set('unit', String(unitId));
        if (register != null) q.set('register', String(register));
        if (scale != null) q.set('scale', String(scale));
      }
      const url =
        proto + '//' + window.location.host + '/api/channels/' + encodeURIComponent(ch) +
        '/stream?' + q.toString();
      const ws = new WebSocket(url);
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string) as { value: number };
          setValue(data.value);
        } catch {
          /* ignore */
        }
      };
      return () => ws.close();
    }
    // 模擬データジェネレータ(FR-RT-03)
    const tick = () => setValue(min + Math.random() * (max - min));
    tick();
    const id = setInterval(tick, Math.max(200, interval));
    return () => clearInterval(id);
  }, [source, channel, min, max, interval, host, unitId, register, scale]);
  return value;
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

function sourceTag(source: string): string {
  return source === 'modbus' ? ' ● MODBUS' : source === 'live' ? ' ● LIVE' : '';
}

/** 数値カード */
export function Metric(props: RealtimeProps) {
  const { label, unit = '', decimals = 0 } = props;
  const value = useChannel(props);
  const severity: Severity = value === null ? 'normal' : metricSeverity(value, props);
  useAlert(label, unit, value, severity);
  const cls = 'c-metric' + (severity !== 'normal' ? ' s-' + severity : '');
  return (
    <div className={cls}>
      <span className="c-metric-label">{label}{sourceTag(props.source)}</span>
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
  const value = useChannel(props);
  const severity: Severity = value === null ? 'normal' : metricSeverity(value, props);
  useAlert(label, unit, value, severity);
  const ratio = value === null || max <= min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  const cls = 'c-gauge' + (severity !== 'normal' ? ' s-' + severity : '');
  return (
    <div className={cls}>
      <div className="c-gauge-head">
        <span className="c-gauge-label">{label}{sourceTag(props.source)}</span>
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
    ...(ifModel.operations.length > 0
      ? [{ path: 'interface/main.tsp', content: emitTypeSpec(ifModel) }]
      : []),
    ...doc.pages.map((page, i) => ({
      path: paths.page(i),
      content: emitComponentFile({
        componentName: `Page${i}`,
        originalName: page.name,
        root: page.root,
        names,
        filePath: paths.page(i),
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
