import { describe, expect, it } from 'vitest';
import { generateProject } from '@/generator/index';
import { buildDemoSteps } from './demo-scenario';

describe('demo シナリオ(FR-DEMO)', () => {
  it('複数ステップを返し、ドキュメントは段階的に成長する', () => {
    const steps = buildDemoSteps();
    expect(steps.length).toBeGreaterThanOrEqual(5);
    // 各ステップにナレーションがある
    expect(steps.every((s) => s.narration.length > 0)).toBe(true);
    // ノード数(ホームページ配下)が単調増加する区間がある
    const counts = steps.map((s) => countNodes(s.doc.pages[0]!.root));
    expect(counts[counts.length - 1]!).toBeGreaterThan(counts[0]!);
  });

  it('最終ステップはチャネルを1つ持ち、部品はそれを channelRef で参照する', () => {
    const steps = buildDemoSteps();
    const final = steps[steps.length - 1]!.doc;
    expect(final.channels).toHaveLength(1);
    const channelId = final.channels[0]!.id;
    const refs = collectProps(final.pages[0]!.root, 'channelRef').filter(Boolean);
    expect(refs.length).toBeGreaterThanOrEqual(3); // metric / gauge / chart
    expect(refs.every((r) => r === channelId)).toBe(true);
  });

  it('最終ドキュメントは生成可能(realtime ランタイムを出力する)', () => {
    const final = buildDemoSteps().at(-1)!.doc;
    const files = generateProject(final, 'demo');
    expect(files.map((f) => f.path)).toContain('src/shared/realtime/runtime.tsx');
  });

  it('純粋: 2回呼んでも同じ構造(ノード数列)になる', () => {
    const a = buildDemoSteps().map((s) => countNodes(s.doc.pages[0]!.root));
    const b = buildDemoSteps().map((s) => countNodes(s.doc.pages[0]!.root));
    expect(a).toEqual(b);
  });
});

function countNodes(node: { children: ReadonlyArray<unknown> }): number {
  return 1 + (node.children as Array<{ children: ReadonlyArray<unknown> }>).reduce((n, c) => n + countNodes(c), 0);
}

function collectProps(
  node: { props: Record<string, unknown>; children: ReadonlyArray<unknown> },
  key: string,
): unknown[] {
  const here = key in node.props ? [node.props[key]] : [];
  const kids = (node.children as Array<typeof node>).flatMap((c) => collectProps(c, key));
  return [...here, ...kids];
}
