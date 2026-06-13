import { describe, expect, it } from 'vitest';
import { ProjectDoc, EditTarget } from '@/domain/project-doc';
import { NodeId } from '@/domain/ids';
import { createAppStore } from './store';
import {
  dialogAdded,
  dmFieldAdded,
  dmFieldUpdated,
  dmModelAdded,
  dmModelRemoved,
  dmRelationAdded,
  editTargetChanged,
  nodeInserted,
  nodeMoved,
  nodePropsUpdated,
  nodeRemoved,
  pageAdded,
  pageRemoved,
  redone,
  undone,
} from './editor-slice';

const setup = () => {
  const store = createAppStore();
  const state = () => store.getState().editor;
  const rootId = () => {
    const s = state();
    const tree = ProjectDoc.getTree(s.doc, s.editTarget);
    if (!tree) throw new Error('no tree');
    return tree.id;
  };
  const tree = () => {
    const s = state();
    const t = ProjectDoc.getTree(s.doc, s.editTarget);
    if (!t) throw new Error('no tree');
    return t;
  };
  return { store, state, rootId, tree };
};

describe('editorSlice ノード編集', () => {
  it('挿入するとデフォルト props が入り選択される', () => {
    const { store, state, rootId, tree } = setup();
    store.dispatch(nodeInserted({ parentId: rootId(), index: 0, type: 'button' }));
    const button = tree().children[0]!;
    expect(button.type).toBe('button');
    expect(button.props['label']).toBe('ボタン');
    expect(state().selectedNodeId).toBe(button.id);
    expect(state().dirty).toBe(true);
  });

  it('移動・削除・props 更新ができる', () => {
    const { store, rootId, tree, state } = setup();
    store.dispatch(nodeInserted({ parentId: rootId(), index: 0, type: 'container' }));
    store.dispatch(nodeInserted({ parentId: rootId(), index: 1, type: 'button' }));
    const [box, button] = tree().children;

    store.dispatch(nodeMoved({ nodeId: button!.id, parentId: box!.id, index: 0 }));
    expect(tree().children).toHaveLength(1);
    expect(tree().children[0]!.children[0]!.id).toBe(button!.id);

    store.dispatch(nodePropsUpdated({ nodeId: button!.id, patch: { label: '送信' } }));
    expect(tree().children[0]!.children[0]!.props['label']).toBe('送信');

    store.dispatch(nodeRemoved({ nodeId: box!.id }));
    expect(tree().children).toHaveLength(0);
    expect(state().selectedNodeId).toBeNull();
  });

  it('存在しないノードへの操作は no-op', () => {
    const { store, tree } = setup();
    const before = tree();
    store.dispatch(nodeRemoved({ nodeId: NodeId.from('missing') }));
    expect(tree()).toEqual(before);
  });
});

describe('editorSlice undo/redo', () => {
  it('編集を取り消し・やり直しできる', () => {
    const { store, rootId, tree } = setup();
    store.dispatch(nodeInserted({ parentId: rootId(), index: 0, type: 'text' }));
    expect(tree().children).toHaveLength(1);

    store.dispatch(undone());
    expect(tree().children).toHaveLength(0);

    store.dispatch(redone());
    expect(tree().children).toHaveLength(1);
  });

  it('undo でページが消えたら editTarget をフォールバックする', () => {
    const { store, state } = setup();
    store.dispatch(pageAdded({ name: '詳細', path: '/detail' }));
    const target = state().editTarget;
    expect(target.kind).toBe('page');

    store.dispatch(undone());
    expect(state().doc.pages).toHaveLength(1);
    expect(state().editTarget).toEqual(EditTarget.page(state().doc.pages[0]!.id));
  });
});

describe('editorSlice ページ / ダイアログ / 編集対象', () => {
  it('ページ追加で editTarget が新ページに移り、削除でフォールバックする', () => {
    const { store, state } = setup();
    store.dispatch(pageAdded({ name: '詳細', path: 'detail' }));
    const added = state().doc.pages[1]!;
    expect(added.path).toBe('/detail');
    expect(state().editTarget).toEqual(EditTarget.page(added.id));

    store.dispatch(pageRemoved({ pageId: added.id }));
    expect(state().doc.pages).toHaveLength(1);
    expect(state().editTarget).toEqual(EditTarget.page(state().doc.pages[0]!.id));
  });

  it('ヘッダー編集に切り替えるとヘッダーの木が対象になる', () => {
    const { store, state, tree } = setup();
    store.dispatch(editTargetChanged(EditTarget.header));
    expect(state().editTarget.kind).toBe('header');
    expect(tree().type).toBe('header');
  });

  it('データモデルの追加・編集・リレーション・Undo が機能する', () => {
    const { store, state } = setup();
    store.dispatch(dmModelAdded({ kind: 'aggregate', x: 0, y: 0 }));
    store.dispatch(dmModelAdded({ kind: 'entity', x: 240, y: 0 }));
    const [agg, ent] = state().doc.dataModel.models;
    expect(state().selectedModelId).toBe(ent!.id);

    store.dispatch(dmFieldAdded({ modelId: agg!.id }));
    const field = state().doc.dataModel.models[0]!.fields[0]!;
    store.dispatch(
      dmFieldUpdated({ modelId: agg!.id, fieldId: field.id, patch: { name: 'Title', max: 80 } }),
    );
    const updated = state().doc.dataModel.models[0]!.fields[0]!;
    expect(updated.name).toBe('title');
    expect(updated.max).toBe(80);

    store.dispatch(dmRelationAdded({ from: agg!.id, to: ent!.id, kind: 'hasMany' }));
    expect(state().doc.dataModel.relations).toHaveLength(1);

    store.dispatch(undone());
    expect(state().doc.dataModel.relations).toHaveLength(0);

    store.dispatch(dmModelRemoved({ modelId: ent!.id }));
    expect(state().doc.dataModel.models).toHaveLength(1);
    expect(state().selectedModelId).toBeNull();
  });

  it('ダイアログを追加すると編集対象になる', () => {
    const { store, state, tree } = setup();
    store.dispatch(dialogAdded({ title: '確認' }));
    expect(state().doc.dialogs).toHaveLength(1);
    expect(state().editTarget.kind).toBe('dialog');
    expect(tree().type).toBe('container');
  });
});
