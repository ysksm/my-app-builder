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
const metricComponentTsx = `// 自動生成 — AppForge: リアルタイム数値カード(DataChannel: mock / live)
import { useEffect, useState } from 'react';

export type MetricProps = {
  label: string;
  unit: string;
  min: number;
  max: number;
  interval: number;
  decimals: number;
  source: 'mock' | 'live';
  channel: string;
};

export function Metric({ label, unit, min, max, interval, decimals, source, channel }: MetricProps) {
  const [value, setValue] = useState<number | null>(null);
  const live = source === 'live';
  useEffect(() => {
    if (live) {
      // BE の WS ゲートウェイ /api/channels/{ch}/stream を購読(FR-RT-01)
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ch = channel || 'default';
      const url =
        proto + '//' + window.location.host + '/api/channels/' + encodeURIComponent(ch) +
        '/stream?min=' + min + '&max=' + max + '&interval=' + interval;
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
  }, [min, max, interval, live, channel]);
  return (
    <div className="c-metric">
      <span className="c-metric-label">{label}{live ? ' ● LIVE' : ''}</span>
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
