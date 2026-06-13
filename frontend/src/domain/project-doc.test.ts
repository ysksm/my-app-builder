import { describe, expect, it } from 'vitest';
import { ComponentNode } from './component-node';
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
