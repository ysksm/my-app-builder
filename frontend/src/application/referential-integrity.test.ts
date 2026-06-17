import { describe, expect, it } from 'vitest';
import { ProjectDoc, EditTarget } from '@/domain/project-doc';
import { ComponentNode } from '@/domain/component-node';
import { applyCommand } from './commands';

const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error('fixture');
  return r.value;
};

describe('参照整合性 (F1): 削除時の死参照クリア', () => {
  it('removeModel で table の bindAggregate がクリアされる', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    doc = unwrap(applyCommand(doc, { kind: 'addModel', modelKind: 'aggregate', x: 0, y: 0 })).doc;
    const modelId = doc.dataModel.models[0]!.id;
    const ins = unwrap(
      applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'table' }),
    );
    doc = ins.doc;
    const tableId = doc.pages[0]!.root.children[0]!.id;
    doc = unwrap(
      applyCommand(doc, { kind: 'updateNodeProps', target, nodeId: tableId, patch: { bindAggregate: modelId } }),
    ).doc;
    expect(String(ComponentNode.find(doc.pages[0]!.root, tableId)!.props.bindAggregate)).toBe(String(modelId));

    doc = unwrap(applyCommand(doc, { kind: 'removeModel', modelId })).doc;
    expect(ComponentNode.find(doc.pages[0]!.root, tableId)!.props.bindAggregate).toBe('');
  });

  it('removeChannel で部品の channelRef がクリアされる', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    doc = unwrap(applyCommand(doc, { kind: 'addChannel' })).doc;
    const channelId = doc.channels[0]!.id;
    const ins = unwrap(
      applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'metric' }),
    );
    doc = ins.doc;
    const metricId = doc.pages[0]!.root.children[0]!.id;
    doc = unwrap(
      applyCommand(doc, { kind: 'updateNodeProps', target, nodeId: metricId, patch: { channelRef: channelId } }),
    ).doc;
    doc = unwrap(applyCommand(doc, { kind: 'removeChannel', channelId })).doc;
    expect(ComponentNode.find(doc.pages[0]!.root, metricId)!.props.channelRef).toBe('');
  });

  it('removeQuery は他クエリの refetch とボタンの runQuery イベントの死参照を掃除する (slice2c-B)', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    // listUsers(GET) と createUser(POST, refetch=listUsers)
    doc = unwrap(applyCommand(doc, { kind: 'addQuery', name: 'listUsers' })).doc;
    const listId = doc.queries[0]!.id;
    doc = unwrap(applyCommand(doc, { kind: 'addQuery', name: 'createUser', patch: { method: 'POST', refetch: 'listUsers' } })).doc;
    // listUsers を runQuery するボタン
    const ins = unwrap(applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'button' }));
    doc = ins.doc;
    const btnId = doc.pages[0]!.root.children[0]!.id;
    doc = unwrap(
      applyCommand(doc, { kind: 'setNodeEvents', target, nodeId: btnId, events: [{ event: 'onClick', action: { kind: 'runQuery', queryId: listId } }] }),
    ).doc;
    // listUsers を削除 → createUser.refetch クリア + ボタンの runQuery イベント除去
    doc = unwrap(applyCommand(doc, { kind: 'removeQuery', queryId: listId })).doc;
    expect(doc.queries.find((q) => q.name === 'createUser')!.refetch).toBeUndefined();
    expect(ComponentNode.find(doc.pages[0]!.root, btnId)!.events).toHaveLength(0);
  });
});
