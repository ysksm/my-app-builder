import { describe, expect, it } from 'vitest';
import { DataModel, type ModelKind } from './data-model';
import type { FieldId, ModelId } from './ids';
import { ProjectDoc } from './project-doc';
import { parseProjectDoc } from './schema';

const unwrap = <T,>(r: Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: unknown }>): T => {
  if (!r.ok) throw new Error('fixture failed');
  return r.value;
};
const addModel = (dm: DataModel, kind: ModelKind, name: string): { dm: DataModel; id: ModelId } => {
  const a = DataModel.addModel(dm, kind, 0, 0);
  return { dm: unwrap(DataModel.updateModel(a.dataModel, a.model.id, { name })), id: a.model.id };
};
const addField = (dm: DataModel, id: ModelId, name: string, type: 'string' | 'number' = 'number') => {
  const f = unwrap(DataModel.addField(dm, id));
  const dm2 = unwrap(DataModel.updateField(f.dataModel, id, f.field.id, { name, type }));
  return { dm: dm2, fieldId: f.field.id as FieldId };
};

const setup = () => {
  let dm = DataModel.empty();
  const m = addModel(dm, 'aggregate', 'Booking');
  dm = m.dm;
  const s = addField(dm, m.id, 'startDay');
  dm = s.dm;
  const e = addField(dm, m.id, 'endDay');
  dm = e.dm;
  return { dm, modelId: m.id, start: s.fieldId, end: e.fieldId };
};

describe('DataModel ルール', () => {
  it('フィールド間ルールを追加・更新・削除できる', () => {
    const { dm, modelId, start, end } = setup();
    const added = DataModel.addRule(dm, modelId, end, 'gte', { kind: 'field', fieldId: start }, '終了日は開始日以降');
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const rule = added.value.rule;
    expect(rule.op).toBe('gte');

    const updated = DataModel.updateRule(added.value.dataModel, modelId, rule.id, { op: 'gt' });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(DataModel.findModel(updated.value, modelId)!.rules[0]!.op).toBe('gt');

    const removed = DataModel.removeRule(updated.value, modelId, rule.id);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(DataModel.findModel(removed.value, modelId)!.rules).toHaveLength(0);
  });

  it('存在しないフィールドを参照するルールは拒否される', () => {
    const { dm, modelId, end } = setup();
    const bad = DataModel.addRule(dm, modelId, end, 'gte', { kind: 'field', fieldId: 'missing' as FieldId }, 'x');
    expect(bad.ok).toBe(false);
  });

  it('フィールド削除で、それを参照するルールも消える', () => {
    const { dm, modelId, start, end } = setup();
    const added = DataModel.addRule(dm, modelId, end, 'gte', { kind: 'field', fieldId: start }, 'msg');
    if (!added.ok) return;
    const removed = DataModel.removeField(added.value.dataModel, modelId, start);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(DataModel.findModel(removed.value, modelId)!.rules).toHaveLength(0);
  });

  it('rules を持たない旧ドキュメントは空配列で補完される', () => {
    const doc = ProjectDoc.create();
    const withModel = DataModel.addModel(doc.dataModel, 'aggregate', 0, 0);
    const legacy = JSON.parse(JSON.stringify({ ...doc, dataModel: withModel.dataModel })) as {
      dataModel: { models: Array<Record<string, unknown>> };
    };
    delete legacy.dataModel.models[0]!['rules'];
    const parsed = parseProjectDoc(legacy);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.dataModel.models[0]!.rules).toEqual([]);
  });
});
