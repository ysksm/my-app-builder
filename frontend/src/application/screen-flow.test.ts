import { describe, expect, it } from 'vitest';
import { ComponentNode } from '@/domain/component-node';
import { EditTarget, ProjectDoc } from '@/domain/project-doc';
import { collectScreenFlow } from './screen-flow';

/** ホーム(ボタン→詳細遷移、ボタン→ダイアログ表示)+ 詳細 + ダイアログ */
const setup = () => {
  let doc = ProjectDoc.create();
  const { doc: d2, page: detail } = ProjectDoc.addPage(doc, '詳細', '/detail');
  const { doc: d3, dialog } = ProjectDoc.addDialog(d2, '確認');
  doc = d3;
  const home = doc.pages[0]!;

  const navBtn = ComponentNode.create('button', { label: '詳細へ' });
  const dlgBtn = ComponentNode.create('button', { label: '確認を開く' });
  let root = home.root;
  root = (ComponentNode.insert(root, root.id, 0, navBtn) as { ok: true; value: ComponentNode }).value;
  root = (ComponentNode.insert(root, root.id, 1, dlgBtn) as { ok: true; value: ComponentNode }).value;
  root = (ComponentNode.setEvents(root, navBtn.id, [{ event: 'onClick', action: { kind: 'navigate', pageId: detail.id } }]) as { ok: true; value: ComponentNode }).value;
  root = (ComponentNode.setEvents(root, dlgBtn.id, [{ event: 'onClick', action: { kind: 'openDialog', dialogId: dialog.id } }]) as { ok: true; value: ComponentNode }).value;
  doc = ProjectDoc.setTree(doc, EditTarget.page(home.id), root);
  return { doc, home, detail, dialog };
};

describe('collectScreenFlow', () => {
  it('全ページ + ダイアログを画面として返す', () => {
    const { doc } = setup();
    const flow = collectScreenFlow(doc);
    expect(flow.screens.map((s) => s.kind).sort()).toEqual(['dialog', 'page', 'page']);
    expect(flow.screens.find((s) => s.kind === 'dialog')!.title).toBe('確認');
  });

  it('navigate / openDialog を遷移エッジとして抽出する', () => {
    const { doc, home, detail, dialog } = setup();
    const flow = collectScreenFlow(doc);
    expect(flow.edges).toContainEqual({ from: home.id, to: detail.id, action: 'navigate', trigger: '詳細へ' });
    expect(flow.edges).toContainEqual({ from: home.id, to: dialog.id, action: 'openDialog', trigger: '確認を開く' });
  });

  it('共通ヘッダーの遷移は各ページ発として集まる', () => {
    const { doc, home, detail } = setup();
    // ヘッダーに詳細へ遷移するボタンを追加
    const headerBtn = ComponentNode.create('button', { label: 'Top' });
    let header = doc.layout.header!;
    header = (ComponentNode.insert(header, header.id, 0, headerBtn) as { ok: true; value: ComponentNode }).value;
    header = (ComponentNode.setEvents(header, headerBtn.id, [{ event: 'onClick', action: { kind: 'navigate', pageId: detail.id } }]) as { ok: true; value: ComponentNode }).value;
    const doc2 = ProjectDoc.setTree(doc, EditTarget.header, header);

    const flow = collectScreenFlow(doc2);
    // ホームのヘッダー由来の詳細遷移が含まれる
    expect(flow.edges.some((e) => e.from === home.id && e.to === detail.id)).toBe(true);
  });

  it('削除済み画面への遷移は無視する', () => {
    const doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const btn = ComponentNode.create('button', { label: 'x' });
    let root = (ComponentNode.insert(home.root, home.root.id, 0, btn) as { ok: true; value: ComponentNode }).value;
    root = (ComponentNode.setEvents(root, btn.id, [{ event: 'onClick', action: { kind: 'navigate', pageId: 'missing' as never } }]) as { ok: true; value: ComponentNode }).value;
    const doc2 = ProjectDoc.setTree(doc, EditTarget.page(home.id), root);
    expect(collectScreenFlow(doc2).edges).toHaveLength(0);
  });
});
