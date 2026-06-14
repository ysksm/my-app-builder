import { describe, expect, it } from 'vitest';
import { ComponentNode } from './component-node';
import { DesignTokens } from './design-tokens';
import { EditTarget, ProjectDoc } from './project-doc';
import { parseProjectDoc } from './schema';

describe('ProjectDoc.create', () => {
  it('ホームページ1枚とヘッダー/フッターを持つ初期ドキュメントを作る', () => {
    const doc = ProjectDoc.create();
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0]?.path).toBe('/');
    expect(doc.layout.header?.type).toBe('header');
    expect(doc.layout.footer?.type).toBe('footer');
  });
});

describe('ProjectDoc.setBoardPosition(FR-PAGE-06)', () => {
  it('画面 ID ごとに座標を保存・更新する', () => {
    const base = ProjectDoc.create();
    expect(base.boardPositions).toEqual({});
    const d1 = ProjectDoc.setBoardPosition(base, 'page-a', 100, 200);
    expect(d1.boardPositions['page-a']).toEqual({ x: 100, y: 200 });
    const d2 = ProjectDoc.setBoardPosition(d1, 'page-a', 50, 60);
    expect(d2.boardPositions['page-a']).toEqual({ x: 50, y: 60 });
    // 他画面は保持される(イミュータブル更新)
    const d3 = ProjectDoc.setBoardPosition(d2, 'dialog-b', 10, 20);
    expect(d3.boardPositions['page-a']).toEqual({ x: 50, y: 60 });
    expect(d3.boardPositions['dialog-b']).toEqual({ x: 10, y: 20 });
  });

  it('boardPositions 未保存の旧ドキュメントは空オブジェクトで補完される', () => {
    const legacy = {
      schemaVersion: 1,
      pages: [{ id: 'p1', name: 'ホーム', path: '/', root: ComponentNode.create('container'), useHeader: true, useFooter: true }],
      layout: { header: null, footer: null },
      dialogs: [],
    };
    const parsed = parseProjectDoc(legacy);
    if (!parsed.ok) throw new Error('parse');
    expect(parsed.value.boardPositions).toEqual({});
  });
});

describe('ProjectDoc 名前付きテーマ(FR-DS-08)', () => {
  it('現在のトークンを保存し、適用で差し替え、削除できる', () => {
    const base = ProjectDoc.create();
    expect(base.themes).toEqual([]);
    // 色を変えてから「現在の配色」を保存
    const blue = DesignTokens.setToken(base.tokens, 'color', 'primary', '#1111ff');
    const d0 = { ...base, tokens: blue };
    const { doc: d1, theme } = ProjectDoc.saveTheme(d0, 'ブルー');
    expect(d1.themes).toHaveLength(1);
    expect(theme.name).toBe('ブルー');

    // トークンを別の色にしてから、保存テーマを適用すると元の青に戻る
    const d2 = { ...d1, tokens: DesignTokens.setToken(d1.tokens, 'color', 'primary', '#ff0000') };
    const applied = ProjectDoc.applyTheme(d2, theme.id);
    if (!applied.ok) throw new Error('apply');
    expect(applied.value.tokens.color.primary?.$value).toBe('#1111ff');

    const removed = ProjectDoc.removeTheme(applied.value, theme.id);
    if (!removed.ok) throw new Error('remove');
    expect(removed.value.themes).toHaveLength(0);
  });

  it('存在しないテーマの適用/削除は notFound', () => {
    const base = ProjectDoc.create();
    expect(ProjectDoc.applyTheme(base, 'nope').ok).toBe(false);
    expect(ProjectDoc.removeTheme(base, 'nope').ok).toBe(false);
  });

  it('themes 未保存の旧ドキュメントは空配列で補完される', () => {
    const legacy = {
      schemaVersion: 1,
      pages: [{ id: 'p1', name: 'ホーム', path: '/', root: ComponentNode.create('container'), useHeader: true, useFooter: true }],
      layout: { header: null, footer: null },
      dialogs: [],
    };
    const parsed = parseProjectDoc(legacy);
    if (!parsed.ok) throw new Error('parse');
    expect(parsed.value.themes).toEqual([]);
  });
});

describe('ProjectDoc.getTree / setTree', () => {
  it('編集対象ごとに木を取得・差し替えできる', () => {
    let doc = ProjectDoc.create();
    const page = doc.pages[0]!;

    const pageTarget = EditTarget.page(page.id);
    expect(ProjectDoc.getTree(doc, pageTarget)).toBe(page.root);

    const newRoot = ComponentNode.create('container', { gap: 8 });
    doc = ProjectDoc.setTree(doc, pageTarget, newRoot);
    expect(ProjectDoc.getTree(doc, pageTarget)).toBe(newRoot);

    expect(ProjectDoc.getTree(doc, EditTarget.header)?.type).toBe('header');

    const { doc: doc2, dialog } = ProjectDoc.addDialog(doc, '確認');
    const dialogTarget = EditTarget.dialog(dialog.id);
    expect(ProjectDoc.getTree(doc2, dialogTarget)).toBe(dialog.root);
  });
});

describe('ProjectDoc のページ操作', () => {
  it('追加・更新・削除ができ、最後の1枚は削除できない', () => {
    let doc = ProjectDoc.create();
    const first = doc.pages[0]!;

    const last = ProjectDoc.removePage(doc, first.id);
    expect(last.ok).toBe(false);

    const { doc: doc2, page } = ProjectDoc.addPage(doc, '詳細', 'detail');
    doc = doc2;
    expect(page.path).toBe('/detail');

    const updated = ProjectDoc.updatePage(doc, page.id, { name: '詳細2', useHeader: false });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    doc = updated.value;
    expect(ProjectDoc.findPage(doc, page.id)?.name).toBe('詳細2');
    expect(ProjectDoc.findPage(doc, page.id)?.useHeader).toBe(false);

    const removed = ProjectDoc.removePage(doc, page.id);
    expect(removed.ok).toBe(true);
  });
});

describe('parseProjectDoc(スキーマ検証)', () => {
  it('create した doc は roundtrip できる', () => {
    const doc = ProjectDoc.create();
    const json = JSON.parse(JSON.stringify(doc)) as unknown;
    const parsed = parseProjectDoc(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual(doc);
  });

  it('壊れた JSON は INVALID で拒否する', () => {
    const parsed = parseProjectDoc({ schemaVersion: 1, pages: [] });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe('INVALID');
  });
});
