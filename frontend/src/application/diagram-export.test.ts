import { describe, expect, it } from 'vitest';
import { ComponentNode } from '@/domain/component-node';
import { DataModel, type ModelKind } from '@/domain/data-model';
import type { ModelId } from '@/domain/ids';
import { EditTarget, ProjectDoc } from '@/domain/project-doc';
import { exportDiagram, screenFlowMermaid, traceabilityMatrix, usecaseSequencesMermaid } from './diagram-export';

const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error('fixture');
  return r.value;
};
const addModel = (dm: DataModel, kind: ModelKind, name: string): { dm: DataModel; id: ModelId } => {
  const a = DataModel.addModel(dm, kind, 0, 0);
  return { dm: unwrap(DataModel.updateModel(a.dataModel, a.model.id, { name })), id: a.model.id };
};

describe('screenFlowMermaid', () => {
  it('ページ→ページ遷移を flowchart として出力する', () => {
    let doc = ProjectDoc.create();
    const { doc: d2, page } = ProjectDoc.addPage(doc, '詳細', '/detail');
    doc = d2;
    const home = doc.pages[0]!;
    const btn = ComponentNode.create('button', { label: '詳細へ' });
    let root = unwrap(ComponentNode.insert(home.root, home.root.id, 0, btn));
    root = unwrap(ComponentNode.setEvents(root, btn.id, [{ event: 'onClick', action: { kind: 'navigate', pageId: page.id } }]));
    doc = ProjectDoc.setTree(doc, EditTarget.page(home.id), root);

    const mermaid = screenFlowMermaid(doc);
    expect(mermaid).toContain('flowchart LR');
    expect(mermaid).toContain('"ホーム /"');
    expect(mermaid).toContain('"詳細 /detail"');
    expect(mermaid).toMatch(/s0 -->\|詳細へ\| s1/);
  });
});

describe('usecaseSequencesMermaid', () => {
  it('ユースケースから create→save のシーケンス図を作る', () => {
    let dm = DataModel.empty();
    const a = addModel(dm, 'aggregate', 'Order');
    dm = a.dm;
    const f = unwrap(DataModel.addField(dm, a.id));
    dm = unwrap(DataModel.updateField(f.dataModel, a.id, f.field.id, { name: 'total', type: 'number' }));
    const u = unwrap(DataModel.addUsecase(dm, a.id));
    dm = unwrap(DataModel.updateUsecase(u.dataModel, a.id, u.usecase.id, { name: 'placeOrder', save: true }));

    const seqs = usecaseSequencesMermaid(dm);
    expect(seqs).toHaveLength(1);
    expect(seqs[0]!.title).toBe('Order.placeOrder');
    const m = seqs[0]!.mermaid;
    expect(m).toContain('sequenceDiagram');
    expect(m).toContain('UI->>App: placeOrder(input)');
    expect(m).toContain('App->>Dom: Order.create(input)');
    expect(m).toContain('App->>Repo: save(entity)');
  });
});

describe('traceabilityMatrix', () => {
  it('集約ごとに UI/アプリ/ドメイン/インフラ/API の行を作る', () => {
    let dm = DataModel.empty();
    const a = addModel(dm, 'aggregate', 'Customer');
    dm = a.dm;
    const f = unwrap(DataModel.addField(dm, a.id));
    dm = unwrap(DataModel.updateField(f.dataModel, a.id, f.field.id, { name: 'name', type: 'string' }));
    const doc = { ...ProjectDoc.create(), dataModel: dm };

    const md = traceabilityMatrix(doc);
    expect(md).toContain('| 機能 | UI | アプリケーション層 | ドメイン層 | インフラ | API |');
    expect(md).toContain('| Customer |');
    expect(md).toContain('CustomerAdminPage');
    expect(md).toContain('CustomerRepository(mock/api)');
    expect(md).toContain('listCustomers');
  });

  it('集約がなければメッセージを返す', () => {
    expect(exportDiagram(ProjectDoc.create(), 'traceability')).toContain('集約');
  });
});
