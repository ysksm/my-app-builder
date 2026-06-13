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

describe('metric(数値カード)生成', () => {
  it('metric があると Metric コンポーネントを生成し <Metric/> で参照する', () => {
    const files = generateProject(docWithMetric(), 'x');
    const paths = files.map((f) => f.path);
    expect(paths).toContain('src/shared/realtime/Metric.tsx');

    const metricSrc = files.find((f) => f.path === 'src/shared/realtime/Metric.tsx')!.content;
    expect(metricSrc).toContain('export function Metric(');
    expect(metricSrc).toContain('setInterval');
    expect(metricSrc).toContain('Math.random()');
    // live モード: WS データチャネルを購読
    expect(metricSrc).toContain('new WebSocket(url)');
    expect(metricSrc).toContain('/api/channels/');

    const page = files.find((f) => f.path === 'src/pages/Page0.tsx')!.content;
    expect(page).toContain('<Metric label={"CPU"} unit={"%"} source={"mock"} channel={"cpu"} min={0} max={100} interval={1000} decimals={1} />');
    expect(page).toContain(`import { Metric } from '../shared/realtime/Metric';`);
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

    const metricSrc = files.find((f) => f.path === 'src/shared/realtime/Metric.tsx')!.content;
    expect(metricSrc).toContain(`q.set('kind', 'modbus')`);
    expect(metricSrc).toContain(`source === 'modbus'`);
  });

  it('source=mock のときは Modbus 属性を出力しない', () => {
    const files = generateProject(docWithMetric({ source: 'mock' }), 'x');
    const page = files.find((f) => f.path === 'src/pages/Page0.tsx')!.content;
    expect(page).not.toContain('host=');
    expect(page).not.toContain('unitId=');
  });

  it('metric が無ければ Metric は生成されない', () => {
    const paths = generateProject(ProjectDoc.create(), 'x').map((f) => f.path);
    expect(paths).not.toContain('src/shared/realtime/Metric.tsx');
  });

  it('app.css と tokens に c-metric スタイルが含まれる', () => {
    const files = generateProject(docWithMetric(), 'x');
    const appCss = files.find((f) => f.path === 'src/shared/styles/app.css')!.content;
    expect(appCss).toContain('.c-metric');
    expect(appCss).toContain('.c-metric-value');
  });
});
