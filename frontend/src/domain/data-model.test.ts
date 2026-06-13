import { describe, expect, it } from 'vitest';
import { DataModel } from './data-model';
import { ProjectDoc } from './project-doc';
import { parseProjectDoc } from './schema';

const setup = () => {
  let dm = DataModel.empty();
  const a = DataModel.addModel(dm, 'aggregate', 0, 0);
  dm = a.dataModel;
  const b = DataModel.addModel(dm, 'entity', 100, 0);
  dm = b.dataModel;
  return { dm, agg: a.model, ent: b.model };
};

describe('DataModel モデル操作', () => {
  it('追加・改名・削除ができ、重複名は拒否される', () => {
    const initial = setup();
    const { agg, ent } = initial;
    let dm = initial.dm;

    const renamed = DataModel.updateModel(dm, agg.id, { name: 'customer order!' });
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    dm = renamed.value;
    expect(DataModel.findModel(dm, agg.id)?.name).toBe('Customerorder');

    const dup = DataModel.updateModel(
      DataModel.updateModel(dm, ent.id, { name: 'Customerorder' }).ok
        ? dm
        : dm,
      ent.id,
      { name: 'Customerorder' },
    );
    expect(dup.ok).toBe(false);

    const removed = DataModel.removeModel(dm, ent.id);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.value.models).toHaveLength(1);
  });

  it('モデル削除で関係するリレーションも消える', () => {
    const { dm, agg, ent } = setup();
    const rel = DataModel.addRelation(dm, agg.id, ent.id, 'hasMany');
    expect(rel.ok).toBe(true);
    if (!rel.ok) return;
    const removed = DataModel.removeModel(rel.value.dataModel, ent.id);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.value.relations).toHaveLength(0);
  });
});

describe('DataModel フィールド操作', () => {
  it('追加・更新(サニタイズ)・削除、重複名拒否', () => {
    const initial = setup();
    const { agg } = initial;
    let dm = initial.dm;
    const added = DataModel.addField(dm, agg.id);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    dm = added.value.dataModel;
    const field = added.value.field;

    const updated = DataModel.updateField(dm, agg.id, field.id, {
      name: 'Customer Name',
      type: 'string',
      min: 1,
      max: 40,
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    dm = updated.value;
    const f = DataModel.findModel(dm, agg.id)!.fields[0]!;
    expect(f.name).toBe('customerName');
    expect(f.min).toBe(1);

    const added2 = DataModel.addField(dm, agg.id);
    if (!added2.ok) return;
    dm = added2.value.dataModel;
    const dup = DataModel.updateField(dm, agg.id, added2.value.field.id, { name: 'customerName' });
    expect(dup.ok).toBe(false);

    const removed = DataModel.removeField(dm, agg.id, f.id);
    expect(removed.ok).toBe(true);
  });
});

describe('DataModel リレーション操作', () => {
  it('自動命名(hasMany は複数形)と自己参照拒否', () => {
    const { dm, agg, ent } = setup();
    const rel = DataModel.addRelation(dm, agg.id, ent.id, 'hasMany');
    expect(rel.ok).toBe(true);
    if (!rel.ok) return;
    expect(rel.value.relation.name).toBe('entity2s');

    const self = DataModel.addRelation(dm, agg.id, agg.id, 'hasOne');
    expect(self.ok).toBe(false);
  });
});

describe('dataModel の後方互換', () => {
  it('dataModel を持たない旧ドキュメントは空モデルで補完される', () => {
    const doc = ProjectDoc.create();
    const legacy = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
    delete legacy['dataModel'];
    const parsed = parseProjectDoc(legacy);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.dataModel).toEqual(DataModel.empty());
  });
});
