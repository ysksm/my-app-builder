import { describe, expect, it } from 'vitest';
import { ProjectDoc } from '@/domain/project-doc';
import { ComponentNode } from '@/domain/component-node';
import { generateProject } from './index';

/**
 * 大規模ツリーのベースライン計測（性能 I3）。
 * DOM 描画性能はここでは測れないため、生成パイプライン（純関数）が
 * ノード数に対して破綻なくスケールすることを確認する＝アルゴリズム的爆発の回帰ガード。
 */
describe('大規模ツリーの生成スケール (I3)', () => {
  it('1000 ノードのページを破綻なく生成できる', () => {
    const N = 1000;
    const base = ProjectDoc.create();
    const home = base.pages[0]!;
    // home root に N 個の text 子を直接ぶら下げた木を構築
    const children = Array.from({ length: N }, (_, i) =>
      ComponentNode.create('text', { text: `行 ${i}` }),
    );
    const root: ComponentNode = { ...home.root, children };
    const doc: ProjectDoc = {
      ...base,
      pages: [{ ...home, root }],
    };

    const t0 = Date.now();
    const files = generateProject(doc, 'perf');
    const ms = Date.now() - t0;

    const page = files.find((f) => f.path.includes('pages/Page0.tsx'))?.content ?? '';
    expect(page).toContain('行 0');
    expect(page).toContain(`行 ${N - 1}`);
    // 回帰ガード（潤沢な上限）。実測値は CI 環境差を吸収できる範囲で。
    expect(ms).toBeLessThan(3000);
    // 実測値を出力（ベースライン追跡用）
    console.log(`[I3] generateProject(${N} nodes) = ${ms}ms, page size = ${page.length} chars`);
  });
});
