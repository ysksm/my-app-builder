import { describe, expect, it } from 'vitest';
import { Page } from './page';
import { parseProjectDoc } from './schema';
import { ComponentNode } from './component-node';

describe('Page.screenBox(画面サイズ → CSS box)', () => {
  it('自動 = 幅100% / 高さauto、未使用軸は明示リセット', () => {
    const box = Page.screenBox({ width: { mode: 'auto', value: 0 }, height: { mode: 'auto', value: 0 } });
    expect(box).toEqual({
      width: '100%',
      minWidth: '0',
      maxWidth: 'none',
      height: 'auto',
      minHeight: '0',
      maxHeight: 'none',
    });
  });

  it('固定幅 = width:Npx、固定高さ = height:Npx', () => {
    const box = Page.screenBox({ width: { mode: 'fixed', value: 400 }, height: { mode: 'fixed', value: 600 } });
    expect(box.width).toBe('400px');
    expect(box.height).toBe('600px');
  });

  it('最小幅 = minWidth、最大幅 = maxWidth(width は 100% を維持)', () => {
    const min = Page.screenBox({ width: { mode: 'min', value: 320 }, height: { mode: 'min', value: 540 } });
    expect(min).toMatchObject({ width: '100%', minWidth: '320px', maxWidth: 'none', minHeight: '540px' });
    const max = Page.screenBox({ width: { mode: 'max', value: 1200 }, height: { mode: 'max', value: 800 } });
    expect(max).toMatchObject({ width: '100%', maxWidth: '1200px', maxHeight: '800px' });
  });

  it('既定の画面サイズは 最大幅960 / 最小高さ540', () => {
    expect(Page.defaultScreen).toEqual({ width: { mode: 'max', value: 960 }, height: { mode: 'min', value: 540 } });
    expect(Page.create('x', '/x').screen).toEqual(Page.defaultScreen);
  });

  it('screenFillsHeight = 高さが auto / min のときだけ true(固定・最大は伸ばさない)', () => {
    const fill = (m: 'auto' | 'fixed' | 'min' | 'max') =>
      Page.screenFillsHeight({ width: { mode: 'auto', value: 0 }, height: { mode: m, value: 1 } });
    expect([fill('auto'), fill('min'), fill('fixed'), fill('max')]).toEqual([true, true, false, false]);
  });
});

describe('schema 後方互換(screen 無しの旧プロジェクト)', () => {
  it('screen が無いページは既定サイズで補完される', () => {
    const legacy = {
      schemaVersion: 1,
      pages: [{ id: 'p1', name: 'ホーム', path: '/', root: ComponentNode.create('container'), useHeader: true, useFooter: true }],
      layout: { header: null, footer: null },
      dialogs: [],
    };
    const parsed = parseProjectDoc(legacy);
    if (!parsed.ok) throw new Error('parse failed');
    expect(parsed.value.pages[0]!.screen).toEqual(Page.defaultScreen);
  });
});
