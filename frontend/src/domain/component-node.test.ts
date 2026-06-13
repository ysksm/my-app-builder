import { describe, expect, it } from 'vitest';
import { ComponentNode } from './component-node';

const setup = () => {
  const root = ComponentNode.create('container');
  const row = ComponentNode.create('container', { direction: 'row' });
  const button = ComponentNode.create('button', { label: 'OK' });
  const text = ComponentNode.create('text', { text: 'hello' });
  let tree = root;
  for (const [parentId, index, node] of [
    [root.id, 0, row],
    [root.id, 1, text],
    [row.id, 0, button],
  ] as const) {
    const result = ComponentNode.insert(tree, parentId, index, node);
    if (!result.ok) throw new Error('setup failed');
    tree = result.value;
  }
  // root ─ [ row ─ [button], text ]
  return { tree, root, row, button, text };
};

describe('ComponentNode.insert', () => {
  it('指定した親の指定位置に挿入できる', () => {
    const { tree, row } = setup();
    const found = ComponentNode.find(tree, row.id);
    expect(found?.children.map((c) => c.type)).toEqual(['button']);
    expect(tree.children.map((c) => c.type)).toEqual(['container', 'text']);
  });

  it('インデックスは範囲内にクランプされる', () => {
    const { tree, row, button } = setup();
    const extra = ComponentNode.create('text');
    const result = ComponentNode.insert(tree, row.id, 99, extra);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parent = ComponentNode.find(result.value, row.id);
    expect(parent?.children.map((c) => c.id)).toEqual([button.id, extra.id]);
  });

  it('存在しない親には NOT_FOUND を返す', () => {
    const { tree } = setup();
    const orphan = ComponentNode.create('text');
    const result = ComponentNode.insert(tree, orphan.id, 0, ComponentNode.create('text'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
  });
});

describe('ComponentNode.remove', () => {
  it('ノードを子孫ごと削除できる', () => {
    const { tree, row, button } = setup();
    const result = ComponentNode.remove(tree, row.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ComponentNode.find(result.value, row.id)).toBeNull();
    expect(ComponentNode.find(result.value, button.id)).toBeNull();
  });

  it('ルートは削除できない', () => {
    const { tree } = setup();
    const result = ComponentNode.remove(tree, tree.id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID');
  });
});

describe('ComponentNode.move', () => {
  it('別の親へ移動できる', () => {
    const { tree, root, row, text } = setup();
    const result = ComponentNode.move(tree, text.id, row.id, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ComponentNode.find(result.value, row.id)?.children[0]?.id).toBe(text.id);
    expect(ComponentNode.find(result.value, root.id)?.children).toHaveLength(1);
  });

  it('同一親内の後方への並べ替えでインデックスが補正される', () => {
    const { tree, root, row, text } = setup();
    // [row, text] で row を index 2(末尾)へ → [text, row]
    const result = ComponentNode.move(tree, row.id, root.id, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.children.map((c) => c.id)).toEqual([text.id, row.id]);
  });

  it('自分の子孫への移動は CYCLE エラー', () => {
    const { tree, row } = setup();
    const result = ComponentNode.move(tree, tree.id, row.id, 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CYCLE');
  });
});

describe('ComponentNode.updateProps / setEvents', () => {
  it('props を部分更新できる(他ノードは構造共有)', () => {
    const { tree, button, text } = setup();
    const result = ComponentNode.updateProps(tree, button.id, { label: 'Send' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ComponentNode.find(result.value, button.id)?.props['label']).toBe('Send');
    expect(ComponentNode.find(result.value, text.id)).toBe(ComponentNode.find(tree, text.id));
  });

  it('events を設定できる', () => {
    const { tree, button } = setup();
    const result = ComponentNode.setEvents(tree, button.id, [
      { event: 'onClick', action: { kind: 'closeDialog' } },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ComponentNode.find(result.value, button.id)?.events).toHaveLength(1);
  });
});
