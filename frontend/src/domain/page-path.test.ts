import { describe, expect, it } from 'vitest';
import { Page } from './page';
import { ProjectDoc } from './project-doc';
import { applyCommand } from '@/application/commands';

describe('Page.normalizePath', () => {
  it('先頭スラッシュ付与・末尾/連続スラッシュ除去・空白→ハイフン', () => {
    expect(Page.normalizePath('x')).toBe('/x');
    expect(Page.normalizePath('/x/')).toBe('/x');
    expect(Page.normalizePath('//a//b/')).toBe('/a/b');
    expect(Page.normalizePath('')).toBe('/');
    expect(Page.normalizePath('/')).toBe('/');
    expect(Page.normalizePath('  my page ')).toBe('/my-page');
  });
});

describe('ページパスの重複制御 (F2)', () => {
  it('addPage は重複パスを自動回避する(-2 を付与)', () => {
    let doc = ProjectDoc.create();
    const a = ProjectDoc.addPage(doc, 'A', '/list');
    doc = a.doc;
    const b = ProjectDoc.addPage(doc, 'B', '/list');
    expect(a.page.path).toBe('/list');
    expect(b.page.path).toBe('/list-2');
  });

  it('updatePage は他ページと同一パス(正規化後)を拒否する', () => {
    let doc = ProjectDoc.create();
    doc = ProjectDoc.addPage(doc, 'A', '/list').doc;
    const home = doc.pages[0]!;
    // '/list/' は正規化で '/list' になり A と衝突 → 拒否
    const res = applyCommand(doc, { kind: 'updatePage', pageId: home.id, patch: { path: '/list/' } });
    expect(res.ok).toBe(false);
  });

  it('updatePage は衝突しないパスなら許可する', () => {
    const doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const res = applyCommand(doc, { kind: 'updatePage', pageId: home.id, patch: { path: '/home/' } });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.doc.pages[0]!.path).toBe('/home');
  });
});
