import { describe, expect, it } from 'vitest';
import { ComponentNode } from '@/domain/component-node';
import { EditTarget, ProjectDoc } from '@/domain/project-doc';
import { generateProject } from './index';

const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error('fixture');
  return r.value;
};

const docWithMetric = () => {
  let doc = ProjectDoc.create();
  const home = doc.pages[0]!;
  const metric = ComponentNode.create('metric', { label: 'CPU', unit: '%', min: 0, max: 100, interval: 1000, decimals: 1 });
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

    const page = files.find((f) => f.path === 'src/pages/Page0.tsx')!.content;
    expect(page).toContain('<Metric label={"CPU"} unit={"%"} min={0} max={100} interval={1000} decimals={1} />');
    expect(page).toContain(`import { Metric } from '../shared/realtime/Metric';`);
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
