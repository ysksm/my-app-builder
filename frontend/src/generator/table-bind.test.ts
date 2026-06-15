import { describe, expect, it } from 'vitest';
import { DataModel } from '@/domain/data-model';
import { ProjectDoc, EditTarget } from '@/domain/project-doc';
import { applyCommand } from '@/application/commands';
import { tableDataFromModel } from '@/application/table-bind';
import { generateProject } from './index';

const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error('fixture');
  return r.value;
};

/** name:string + age:number を持つ Customer 集約のモデル */
const customerModel = () => {
  let dm = DataModel.empty();
  const a = DataModel.addModel(dm, 'aggregate', 0, 0);
  dm = unwrap(DataModel.updateModel(a.dataModel, a.model.id, { name: 'Customer' }));
  const f1 = unwrap(DataModel.addField(dm, a.model.id));
  dm = unwrap(DataModel.updateField(f1.dataModel, a.model.id, f1.field.id, { name: 'name', type: 'string' }));
  const f2 = unwrap(DataModel.addField(dm, a.model.id));
  dm = unwrap(DataModel.updateField(f2.dataModel, a.model.id, f2.field.id, { name: 'age', type: 'number' }));
  return { dm, aggregateId: a.model.id };
};

const get = (files: ReadonlyArray<{ path: string; content: string }>, path: string) =>
  files.find((f) => f.path.includes(path))?.content ?? '';

describe('tableDataFromModel(集約 → 列 + サンプル行)', () => {
  it('列 = id + フィールド名、行 = 型に応じたサンプル', () => {
    const { dm, aggregateId } = customerModel();
    const t = tableDataFromModel(dm, aggregateId, 2);
    expect(t?.columns).toEqual(['id', 'name', 'age']);
    expect(t?.rows).toHaveLength(2);
    expect(t?.rows[0]).toEqual(['1', '値1', '10']);
    expect(t?.rows[1]).toEqual(['2', '値2', '20']);
  });

  it('未知の集約 id は null', () => {
    expect(tableDataFromModel(DataModel.empty(), 'nope', 3)).toBeNull();
  });
});

describe('テーブルの集約バインド生成(React)', () => {
  it('bindAggregate を設定すると列・行がモデル由来になる', () => {
    const { dm, aggregateId } = customerModel();
    let doc: ProjectDoc = { ...ProjectDoc.create(), dataModel: dm };
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    const ins = applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'table' });
    doc = unwrap(ins).doc;
    const tableId = doc.pages[0]!.root.children[0]!.id;
    const up = applyCommand(doc, {
      kind: 'updateNodeProps',
      target,
      nodeId: tableId,
      patch: { bindAggregate: aggregateId, rows: 2 },
    });
    doc = unwrap(up).doc;
    const page = get(generateProject(doc, 'x'), 'pages/Page0.tsx');
    expect(page).toContain('<th>{"name"}</th>');
    expect(page).toContain('<th>{"age"}</th>');
    expect(page).toContain('<td>{"値1"}</td>');
    expect(page).toContain('<td>{"10"}</td>');
  });
});
