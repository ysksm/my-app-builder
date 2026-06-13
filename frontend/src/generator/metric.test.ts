import { describe, expect, it } from 'vitest';
import { ComponentNode } from '@/domain/component-node';
import { EditTarget, ProjectDoc } from '@/domain/project-doc';
import { generateProject } from './index';

const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error('fixture');
  return r.value;
};

const docWithMetric = (props: Record<string, string | number> = {}) => {
  let doc = ProjectDoc.create();
  const home = doc.pages[0]!;
  const metric = ComponentNode.create('metric', {
    label: 'CPU', unit: '%', min: 0, max: 100, interval: 1000, decimals: 1, source: 'mock', channel: 'cpu', ...props,
  });
  const root = unwrap(ComponentNode.insert(home.root, home.root.id, 0, metric));
  doc = ProjectDoc.setTree(doc, EditTarget.page(home.id), root);
  return doc;
};

/** 任意のリアルタイム部品(metric/gauge/lamp)を複数ぶら下げたドキュメント */
const docWithParts = (...parts: Array<{ type: 'metric' | 'gauge' | 'lamp' | 'chart' | 'setpoint'; props?: Record<string, string | number> }>) => {
  const doc = ProjectDoc.create();
  const home = doc.pages[0]!;
  let root = home.root;
  parts.forEach((part, i) => {
    const node = ComponentNode.create(part.type, {
      label: part.type, min: 0, max: 100, interval: 1000, source: 'mock', channel: 'c', ...part.props,
    });
    root = unwrap(ComponentNode.insert(root, root.id, i, node));
  });
  return ProjectDoc.setTree(doc, EditTarget.page(home.id), root);
};

describe('metric(数値カード)生成', () => {
  it('metric があると Metric コンポーネントを生成し <Metric/> で参照する', () => {
    const files = generateProject(docWithMetric(), 'x');
    const paths = files.map((f) => f.path);
    expect(paths).toContain('src/shared/realtime/runtime.tsx');

    const metricSrc = files.find((f) => f.path === 'src/shared/realtime/runtime.tsx')!.content;
    expect(metricSrc).toContain('export function Metric(');
    expect(metricSrc).toContain('setInterval');
    expect(metricSrc).toContain('Math.random()');
    // live モード: WS データチャネルを購読
    expect(metricSrc).toContain('new WebSocket(url)');
    expect(metricSrc).toContain('/api/channels/');

    const page = files.find((f) => f.path === 'src/pages/Page0.tsx')!.content;
    expect(page).toContain('<Metric label={"CPU"} unit={"%"} source={"mock"} channel={"cpu"} min={0} max={100} interval={1000} decimals={1} />');
    expect(page).toContain(`import { Metric } from '../shared/realtime/runtime';`);
  });

  it('source=live を指定すると Metric に source={"live"} が渡る', () => {
    const files = generateProject(docWithMetric({ source: 'live', channel: 'temp' }), 'x');
    const page = files.find((f) => f.path === 'src/pages/Page0.tsx')!.content;
    expect(page).toContain('source={"live"}');
    expect(page).toContain('channel={"temp"}');
  });

  it('source=modbus で Modbus 接続パラメータが Metric に渡り、WS URL に kind=modbus が載る', () => {
    const files = generateProject(
      docWithMetric({
        source: 'modbus',
        channel: 'reg0',
        host: '127.0.0.1:5502',
        unit_id: 2,
        register: 5,
        scale: 0.1,
      }),
      'x',
    );
    const page = files.find((f) => f.path === 'src/pages/Page0.tsx')!.content;
    expect(page).toContain('source={"modbus"}');
    expect(page).toContain('host={"127.0.0.1:5502"}');
    expect(page).toContain('unitId={2}');
    expect(page).toContain('register={5}');
    expect(page).toContain('scale={0.1}');

    const metricSrc = files.find((f) => f.path === 'src/shared/realtime/runtime.tsx')!.content;
    expect(metricSrc).toContain(`q.set('kind', 'modbus')`);
    expect(metricSrc).toContain(`source === 'modbus'`);
  });

  it('source=mock のときは Modbus 属性を出力しない', () => {
    const files = generateProject(docWithMetric({ source: 'mock' }), 'x');
    const page = files.find((f) => f.path === 'src/pages/Page0.tsx')!.content;
    expect(page).not.toContain('host=');
    expect(page).not.toContain('unitId=');
  });

  it('しきい値を設定すると Metric に warnAbove/critAbove が渡り、未設定のものは出力されない', () => {
    const files = generateProject(docWithMetric({ warnAbove: 70, critAbove: 90 }), 'x');
    const page = files.find((f) => f.path === 'src/pages/Page0.tsx')!.content;
    expect(page).toContain('warnAbove={70}');
    expect(page).toContain('critAbove={90}');
    // 下限しきい値は未設定なので属性に出ない
    expect(page).not.toContain('warnBelow=');
    expect(page).not.toContain('critBelow=');
  });

  it('しきい値未設定なら閾値属性は一切出力されない', () => {
    const page = generateProject(docWithMetric(), 'x').find((f) => f.path === 'src/pages/Page0.tsx')!.content;
    expect(page).not.toContain('warnAbove=');
    expect(page).not.toContain('critAbove=');
  });

  it('Metric は重大度判定 + アラートイベント発火 + 重大度クラスを生成する', () => {
    const metricSrc = generateProject(docWithMetric({ warnAbove: 70 }), 'x').find(
      (f) => f.path === 'src/shared/realtime/runtime.tsx',
    )!.content;
    expect(metricSrc).toContain('export function metricSeverity(');
    expect(metricSrc).toContain(`new CustomEvent('appforge:alert'`);
    expect(metricSrc).toContain(`'c-metric' + (severity !== 'normal'`);
  });

  it('WS は切断時に指数バックオフで自動再接続し、接続状態を表示する(FR-RT-06)', () => {
    const runtime = generateProject(docWithMetric({ source: 'live' }), 'x').find(
      (f) => f.path === 'src/shared/realtime/runtime.tsx',
    )!.content;
    // 再接続: onclose → setTimeout(open, backoff)、バックオフ上限 5000ms
    expect(runtime).toContain('ws.onclose');
    expect(runtime).toContain('setTimeout(open');
    expect(runtime).toContain('Math.min(5000, 500 * 2 ** retry)');
    // 接続状態を持つフックと、切断時の「再接続中」表示
    expect(runtime).toContain('export function useChannelState(');
    expect(runtime).toContain('再接続中');
  });

  it('app シェルが appforge:alert を購読してトースト化する', () => {
    const toasts = generateProject(docWithMetric({ warnAbove: 70 }), 'x').find(
      (f) => f.path === 'src/app/Toasts.tsx',
    )!.content;
    expect(toasts).toContain(`window.addEventListener('appforge:alert'`);
    expect(toasts).toContain('toastShown(');
  });

  it('metric が無ければ Metric は生成されない', () => {
    const paths = generateProject(ProjectDoc.create(), 'x').map((f) => f.path);
    expect(paths).not.toContain('src/shared/realtime/runtime.tsx');
  });

  it('app.css と tokens に c-metric スタイルが含まれる', () => {
    const files = generateProject(docWithMetric(), 'x');
    const appCss = files.find((f) => f.path === 'src/shared/styles/app.css')!.content;
    expect(appCss).toContain('.c-metric');
    expect(appCss).toContain('.c-metric-value');
  });
});

describe('gauge / lamp(モニタリング部品)生成', () => {
  it('gauge / lamp は同じ runtime モジュールから Gauge / Lamp を出力する', () => {
    const files = generateProject(docWithParts({ type: 'gauge' }, { type: 'lamp' }), 'x');
    const runtime = files.find((f) => f.path === 'src/shared/realtime/runtime.tsx')!.content;
    // 1モジュールに3部品 + 共有フックが集約される
    expect(runtime).toContain('export function Gauge(');
    expect(runtime).toContain('export function Lamp(');
    expect(runtime).toContain('export function Metric(');
    expect(runtime).toContain('export function useChannel(');

    const page = files.find((f) => f.path === 'src/pages/Page0.tsx')!.content;
    expect(page).toContain('<Gauge ');
    expect(page).toContain('<Lamp ');
    // import は1行に集約され、アルファベット順
    expect(page).toContain(`import { Gauge, Lamp } from '../shared/realtime/runtime';`);
  });

  it('lamp は表示に使わない unit / decimals 属性を渡さない', () => {
    const page = generateProject(docWithParts({ type: 'lamp', props: { unit: '%', decimals: 2 } }), 'x').find(
      (f) => f.path === 'src/pages/Page0.tsx',
    )!.content;
    expect(page).toContain('<Lamp ');
    expect(page).not.toContain('unit=');
    expect(page).not.toContain('decimals=');
  });

  it('gauge は unit / decimals としきい値属性を渡す', () => {
    const page = generateProject(
      docWithParts({ type: 'gauge', props: { unit: '℃', decimals: 1, critAbove: 80 } }),
      'x',
    ).find((f) => f.path === 'src/pages/Page0.tsx')!.content;
    expect(page).toContain('<Gauge ');
    expect(page).toContain('unit={"℃"}');
    expect(page).toContain('decimals={1}');
    expect(page).toContain('critAbove={80}');
  });

  it('gauge / lamp 用の CSS が app.css に含まれる', () => {
    const appCss = generateProject(docWithParts({ type: 'gauge' }, { type: 'lamp' }), 'x').find(
      (f) => f.path === 'src/shared/styles/app.css',
    )!.content;
    expect(appCss).toContain('.c-gauge-fill');
    expect(appCss).toContain('.c-lamp-dot');
  });
});

describe('chart(スパークライン + 時系列バッファ FR-RT-03)生成', () => {
  it('chart は Chart コンポーネントと時系列フック useSeries を生成する', () => {
    const files = generateProject(docWithParts({ type: 'chart', props: { capacity: 60 } }), 'x');
    const runtime = files.find((f) => f.path === 'src/shared/realtime/runtime.tsx')!.content;
    expect(runtime).toContain('export function Chart(');
    expect(runtime).toContain('export function useSeries(');
    // useChannel と useSeries は同じ低レベル subscribe を共有する
    expect(runtime).toContain('function subscribe(');
    expect(runtime).toContain('<polyline');

    const page = files.find((f) => f.path === 'src/pages/Page0.tsx')!.content;
    expect(page).toContain('<Chart ');
    expect(page).toContain('capacity={60}');
    expect(page).toContain(`import { Chart } from '../shared/realtime/runtime';`);
  });

  it('capacity 未指定なら既定値が属性に出る', () => {
    const page = generateProject(docWithParts({ type: 'chart' }), 'x').find(
      (f) => f.path === 'src/pages/Page0.tsx',
    )!.content;
    expect(page).toContain('capacity={40}');
  });

  it('chart 用の CSS(スパークライン線)が app.css に含まれる', () => {
    const appCss = generateProject(docWithParts({ type: 'chart' }), 'x').find(
      (f) => f.path === 'src/shared/styles/app.css',
    )!.content;
    expect(appCss).toContain('.c-chart-line');
  });

  it('全モニタリング部品が混在しても import は1行に集約される', () => {
    const page = generateProject(
      docWithParts({ type: 'metric' }, { type: 'gauge' }, { type: 'lamp' }, { type: 'chart' }),
      'x',
    ).find((f) => f.path === 'src/pages/Page0.tsx')!.content;
    expect(page).toContain(`import { Chart, Gauge, Lamp, Metric } from '../shared/realtime/runtime';`);
  });
});

describe('setpoint(設定値の書き込み FR-RT-05)生成', () => {
  it('Setpoint コンポーネントを生成し、確認 + write エンドポイントへ POST する', () => {
    const files = generateProject(docWithParts({ type: 'setpoint' }), 'x');
    const runtime = files.find((f) => f.path === 'src/shared/realtime/runtime.tsx')!.content;
    expect(runtime).toContain('export function Setpoint(');
    expect(runtime).toContain('window.confirm(confirmMessage)');
    expect(runtime).toContain(`'/api/channels/' + encodeURIComponent(channel`);
    expect(runtime).toContain(`method: 'POST'`);

    const page = files.find((f) => f.path === 'src/pages/Page0.tsx')!.content;
    expect(page).toContain('<Setpoint ');
    expect(page).toContain(`import { Setpoint } from '../shared/realtime/runtime';`);
  });

  it('mock チャネルの setpoint は Modbus 属性を出さない', () => {
    const page = generateProject(docWithParts({ type: 'setpoint', props: { source: 'mock' } }), 'x').find(
      (f) => f.path === 'src/pages/Page0.tsx',
    )!.content;
    expect(page).toContain('<Setpoint ');
    expect(page).not.toContain('host=');
    expect(page).not.toContain('register=');
  });

  it('source=modbus の setpoint は書き込み先の Modbus パラメータを渡す', () => {
    const page = generateProject(
      docWithParts({
        type: 'setpoint',
        props: { source: 'modbus', channel: 'sp', host: '127.0.0.1:5502', unit_id: 2, register: 9, scale: 0.5 },
      }),
      'x',
    ).find((f) => f.path === 'src/pages/Page0.tsx')!.content;
    expect(page).toContain('source={"modbus"}');
    expect(page).toContain('channel={"sp"}');
    expect(page).toContain('host={"127.0.0.1:5502"}');
    expect(page).toContain('unitId={2}');
    expect(page).toContain('register={9}');
    expect(page).toContain('scale={0.5}');
  });

  it('setpoint 用の CSS が app.css に含まれる', () => {
    const appCss = generateProject(docWithParts({ type: 'setpoint' }), 'x').find(
      (f) => f.path === 'src/shared/styles/app.css',
    )!.content;
    expect(appCss).toContain('.c-setpoint-btn');
  });
});
