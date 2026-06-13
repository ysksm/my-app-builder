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

/** ドキュメント内に metric(数値カード)ノードがあるか */
const usesMetric = (doc: ProjectDoc): boolean => {
  const treeHas = (node: ComponentNode): boolean =>
    node.type === 'metric' || node.children.some(treeHas);
  return (
    doc.pages.some((pg) => treeHas(pg.root)) ||
    doc.dialogs.some((d) => treeHas(d.root)) ||
    (doc.layout.header !== null && treeHas(doc.layout.header)) ||
    (doc.layout.footer !== null && treeHas(doc.layout.footer))
  );
};

/** リアルタイム数値カード。mock(模擬データ)または live(WS データチャネル)で更新 */
const metricComponentTsx = `// 自動生成 — AppForge: リアルタイム数値カード(DataChannel: mock / live / modbus)
import { useEffect, useRef, useState } from 'react';

export type Severity = 'normal' | 'warn' | 'crit';

export type MetricProps = {
  label: string;
  unit: string;
  min: number;
  max: number;
  interval: number;
  decimals: number;
  source: 'mock' | 'live' | 'modbus';
  channel: string;
  // Modbus/TCP(source=modbus のときのみ使用)
  host?: string;
  unitId?: number;
  register?: number;
  scale?: number;
  // しきい値アラート(FR-RT-04)。未指定=無効
  warnAbove?: number;
  critAbove?: number;
  warnBelow?: number;
  critBelow?: number;
};

const RANK: Record<Severity, number> = { normal: 0, warn: 1, crit: 2 };

/** 値としきい値から重大度を判定(上限/下限の危険を優先) */
export function metricSeverity(
  v: number,
  t: Pick<MetricProps, 'warnAbove' | 'critAbove' | 'warnBelow' | 'critBelow'>,
): Severity {
  if ((t.critAbove != null && v >= t.critAbove) || (t.critBelow != null && v <= t.critBelow)) return 'crit';
  if ((t.warnAbove != null && v >= t.warnAbove) || (t.warnBelow != null && v <= t.warnBelow)) return 'warn';
  return 'normal';
}

/** アプリイベント(FR-RT-04): app シェルがこれを購読してトースト等に橋渡しする */
export type MetricAlert = { label: string; value: number; unit: string; severity: Severity };

export function Metric({
  label, unit, min, max, interval, decimals, source, channel,
  host, unitId, register, scale,
  warnAbove, critAbove, warnBelow, critBelow,
}: MetricProps) {
  const [value, setValue] = useState<number | null>(null);
  const prevRank = useRef(0);
  const severity: Severity =
    value === null ? 'normal' : metricSeverity(value, { warnAbove, critAbove, warnBelow, critBelow });

  // 重大度が上昇したときだけイベント発火(同レベル継続では再発火しない)
  useEffect(() => {
    if (value === null) return;
    const rank = RANK[severity];
    if (rank > prevRank.current && rank > 0) {
      const detail: MetricAlert = { label, value, unit, severity };
      window.dispatchEvent(new CustomEvent('appforge:alert', { detail }));
    }
    prevRank.current = rank;
  }, [severity, value, label, unit]);

  // mock 以外(live / modbus)は BE の WS データチャネルを購読する
  const streamed = source === 'live' || source === 'modbus';
  useEffect(() => {
    if (streamed) {
      // BE の WS ゲートウェイ /api/channels/{ch}/stream を購読(FR-RT-01)
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
  }, [min, max, interval, streamed, source, channel, host, unitId, register, scale]);
  const tag = source === 'modbus' ? ' ● MODBUS' : source === 'live' ? ' ● LIVE' : '';
  const cls = 'c-metric' + (severity !== 'normal' ? ' s-' + severity : '');
  return (
    <div className={cls}>
      <span className="c-metric-label">{label}{tag}</span>
      <span className="c-metric-value">
        {value === null ? '—' : value.toFixed(decimals)}
        <span className="c-metric-unit">{unit}</span>
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
    ...(usesMetric(doc) ? [{ path: paths.metricComponent, content: metricComponentTsx }] : []),
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
