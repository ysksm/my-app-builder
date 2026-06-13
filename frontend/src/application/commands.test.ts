import { describe, expect, it } from 'vitest';
import { ComponentNode } from '@/domain/component-node';
import { NodeId } from '@/domain/ids';
import { EditTarget, ProjectDoc } from '@/domain/project-doc';
import { applyCommand, applyCommands, type Command } from './commands';

const homeTarget = (doc: ProjectDoc) => EditTarget.page(doc.pages[0]!.id);

describe('applyCommand: コンポーネント木', () => {
  it('insertNode は新規ノードをデフォルト props 付きで挿入し created.nodeId を返す', () => {
    const doc = ProjectDoc.create();
    const root = doc.pages[0]!.root;
    const res = applyCommand(doc, {
      kind: 'insertNode',
      target: homeTarget(doc),
      parentId: root.id,
      index: 0,
      type: 'button',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.created.nodeId).toBeDefined();
    const tree = ProjectDoc.getTree(res.value.doc, homeTarget(doc))!;
    expect(tree.children[0]!.type).toBe('button');
    expect(tree.children[0]!.props['label']).toBe('ボタン');
  });

  it('存在しない編集対象は NOT_FOUND', () => {
    const doc = ProjectDoc.create();
    const res = applyCommand(doc, {
      kind: 'insertNode',
      target: EditTarget.dialog('missing' as never),
      parentId: NodeId.from('x'),
      index: 0,
      type: 'text',
    });
    expect(res.ok).toBe(false);
  });

  it('updateNodeProps / removeNode が反映される', () => {
    let doc = ProjectDoc.create();
    const root = doc.pages[0]!.root;
    const ins = applyCommand(doc, { kind: 'insertNode', target: homeTarget(doc), parentId: root.id, index: 0, type: 'text' });
    if (!ins.ok) throw new Error();
    doc = ins.value.doc;
    const nodeId = ins.value.created.nodeId!;

    const upd = applyCommand(doc, { kind: 'updateNodeProps', target: homeTarget(doc), nodeId, patch: { text: 'やあ' } });
    if (!upd.ok) throw new Error();
    expect(ComponentNode.find(ProjectDoc.getTree(upd.value.doc, homeTarget(doc))!, nodeId)!.props['text']).toBe('やあ');

    const del = applyCommand(upd.value.doc, { kind: 'removeNode', target: homeTarget(doc), nodeId });
    if (!del.ok) throw new Error();
    expect(ProjectDoc.getTree(del.value.doc, homeTarget(doc))!.children).toHaveLength(0);
  });
});

describe('applyCommand: ページ / ダイアログ / モデル', () => {
  it('addPage / addDialog / addModel が created を返す', () => {
    const doc = ProjectDoc.create();
    const p = applyCommand(doc, { kind: 'addPage', name: '詳細', path: 'detail' });
    expect(p.ok && p.value.created.pageId).toBeTruthy();
    if (p.ok) expect(ProjectDoc.findPage(p.value.doc, p.value.created.pageId!)!.path).toBe('/detail');

    const d = applyCommand(doc, { kind: 'addDialog', title: '確認' });
    expect(d.ok && d.value.created.dialogId).toBeTruthy();

    const m = applyCommand(doc, { kind: 'addModel', modelKind: 'aggregate', x: 0, y: 0 });
    expect(m.ok && m.value.created.modelId).toBeTruthy();
  });

  it('最後のページ削除は失敗する', () => {
    const doc = ProjectDoc.create();
    const res = applyCommand(doc, { kind: 'removePage', pageId: doc.pages[0]!.id });
    expect(res.ok).toBe(false);
  });

  it('モデル名のサニタイズ・重複拒否がコマンド経由でも効く', () => {
    let doc = ProjectDoc.create();
    const m1 = applyCommand(doc, { kind: 'addModel', modelKind: 'aggregate', x: 0, y: 0 });
    if (!m1.ok) throw new Error();
    doc = m1.value.doc;
    const upd = applyCommand(doc, { kind: 'updateModel', modelId: m1.value.created.modelId!, patch: { name: 'order item!' } });
    if (!upd.ok) throw new Error();
    expect(upd.value.doc.dataModel.models[0]!.name).toBe('Orderitem');
  });
});

describe('applyCommands: コマンド列', () => {
  it('連続適用で集約 + フィールドを構築できる(created はマージ)', () => {
    const doc = ProjectDoc.create();
    const m = applyCommand(doc, { kind: 'addModel', modelKind: 'aggregate', x: 0, y: 0 });
    if (!m.ok) throw new Error();
    const modelId = m.value.created.modelId!;
    const commands: Command[] = [
      { kind: 'updateModel', modelId, patch: { name: 'Customer' } },
      { kind: 'addField', modelId },
    ];
    const res = applyCommands(m.value.doc, commands);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.doc.dataModel.models[0]!.name).toBe('Customer');
    expect(res.value.doc.dataModel.models[0]!.fields).toHaveLength(1);
    expect(res.value.created.fieldId).toBeDefined();
  });

  it('途中で失敗するとそのエラーを返す', () => {
    const doc = ProjectDoc.create();
    const res = applyCommands(doc, [
      { kind: 'addPage', name: 'A', path: '/a' },
      { kind: 'removePage', pageId: 'missing' as never },
    ]);
    expect(res.ok).toBe(false);
  });
});
