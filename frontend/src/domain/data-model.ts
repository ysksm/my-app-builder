import { err, ok, type Result } from '@/shared/result';
import { DomainError } from './errors';
import { FieldId, ModelId, RelationId, RuleId } from './ids';

/**
 * DDD モデルデザイナーのドメイン。
 * 名前(識別子)は入力時にサニタイズ・重複拒否し、生成コードの安全性を担保する。
 */

export type FieldType = 'string' | 'number' | 'boolean' | 'date';

export type FieldDef = Readonly<{
  id: FieldId;
  /** camelCase 識別子 */
  name: string;
  type: FieldType;
  required: boolean;
  /** string: 最小長 / number: 最小値 */
  min: number | null;
  max: number | null;
  /** string のみ: 正規表現 */
  pattern: string | null;
}>;

export type ModelKind = 'aggregate' | 'entity' | 'valueObject';

/** フィールド間 / フィールド対リテラルの比較ルール演算子 */
export type RuleOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';

export type RuleOperand =
  | Readonly<{ kind: 'field'; fieldId: FieldId }>
  | Readonly<{ kind: 'literal'; value: string | number | boolean }>;

/**
 * クロスフィールド制約(§4.3 FR-LOGIC-01)。「left op right が成り立つときに妥当」を意味する。
 * 単一ソースとして生成コードの validate(ドメイン)へ展開され、CRUD フォーム等の UI にも波及する。
 */
export type ValidationRule = Readonly<{
  id: RuleId;
  left: FieldId;
  op: RuleOp;
  right: RuleOperand;
  message: string;
}>;

export type ModelDef = Readonly<{
  id: ModelId;
  /** PascalCase 識別子 */
  name: string;
  kind: ModelKind;
  fields: ReadonlyArray<FieldDef>;
  rules: ReadonlyArray<ValidationRule>;
  x: number;
  y: number;
}>;

export type RelationKind = 'hasOne' | 'hasMany';

export type RelationDef = Readonly<{
  id: RelationId;
  from: ModelId;
  to: ModelId;
  kind: RelationKind;
  /** from 側に生成されるフィールド名(camelCase) */
  name: string;
}>;

export type DataModel = Readonly<{
  models: ReadonlyArray<ModelDef>;
  relations: ReadonlyArray<RelationDef>;
}>;

const upper = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const lower = (s: string): string => (s ? s[0]!.toLowerCase() + s.slice(1) : s);

/** 英数字以外を除去し識別子化。先頭が数字なら接頭辞を付ける */
const toIdentifier = (raw: string): string => {
  const cleaned = raw.replace(/[^A-Za-z0-9]+/g, '');
  if (!cleaned) return '';
  return /^[0-9]/.test(cleaned) ? `X${cleaned}` : cleaned;
};

export const DataModel = {
  empty(): DataModel {
    return { models: [], relations: [] };
  },

  sanitizeModelName: (raw: string): string => upper(toIdentifier(raw)),
  sanitizeFieldName: (raw: string): string => lower(toIdentifier(raw)),

  findModel(dm: DataModel, id: ModelId): ModelDef | null {
    return dm.models.find((m) => m.id === id) ?? null;
  },

  addModel(dm: DataModel, kind: ModelKind, x: number, y: number): Readonly<{ dataModel: DataModel; model: ModelDef }> {
    const base = kind === 'aggregate' ? 'Aggregate' : kind === 'entity' ? 'Entity' : 'Value';
    let n = dm.models.length + 1;
    while (dm.models.some((m) => m.name === `${base}${n}`)) n += 1;
    const model: ModelDef = { id: ModelId.create(), name: `${base}${n}`, kind, fields: [], rules: [], x, y };
    return { dataModel: { ...dm, models: [...dm.models, model] }, model };
  },

  updateModel(
    dm: DataModel,
    id: ModelId,
    patch: Partial<Pick<ModelDef, 'name' | 'kind' | 'x' | 'y'>>,
  ): Result<DataModel, DomainError> {
    if (!DataModel.findModel(dm, id)) return err(DomainError.notFound('model'));
    const normalized = { ...patch };
    if (patch.name !== undefined) {
      const name = DataModel.sanitizeModelName(patch.name);
      if (!name) return err(DomainError.create('INVALID', 'model name must not be empty'));
      if (dm.models.some((m) => m.id !== id && m.name === name)) {
        return err(DomainError.create('INVALID', `duplicate model name: ${name}`));
      }
      normalized.name = name;
    }
    return ok({
      ...dm,
      models: dm.models.map((m) => (m.id === id ? { ...m, ...normalized } : m)),
    });
  },

  removeModel(dm: DataModel, id: ModelId): Result<DataModel, DomainError> {
    if (!DataModel.findModel(dm, id)) return err(DomainError.notFound('model'));
    return ok({
      models: dm.models.filter((m) => m.id !== id),
      // 削除モデルに触れるリレーションも一緒に消す(ダングリング防止)
      relations: dm.relations.filter((r) => r.from !== id && r.to !== id),
    });
  },

  addField(dm: DataModel, modelId: ModelId): Result<Readonly<{ dataModel: DataModel; field: FieldDef }>, DomainError> {
    const model = DataModel.findModel(dm, modelId);
    if (!model) return err(DomainError.notFound('model'));
    let n = model.fields.length + 1;
    while (model.fields.some((f) => f.name === `field${n}`)) n += 1;
    const field: FieldDef = {
      id: FieldId.create(),
      name: `field${n}`,
      type: 'string',
      required: true,
      min: null,
      max: null,
      pattern: null,
    };
    const dataModel = {
      ...dm,
      models: dm.models.map((m) => (m.id === modelId ? { ...m, fields: [...m.fields, field] } : m)),
    };
    return ok({ dataModel, field });
  },

  updateField(
    dm: DataModel,
    modelId: ModelId,
    fieldId: FieldId,
    patch: Partial<Omit<FieldDef, 'id'>>,
  ): Result<DataModel, DomainError> {
    const model = DataModel.findModel(dm, modelId);
    if (!model) return err(DomainError.notFound('model'));
    if (!model.fields.some((f) => f.id === fieldId)) return err(DomainError.notFound('field'));
    const normalized = { ...patch };
    if (patch.name !== undefined) {
      const name = DataModel.sanitizeFieldName(patch.name);
      if (!name) return err(DomainError.create('INVALID', 'field name must not be empty'));
      // 生成コードの `id` フィールド(集約/エンティティに自動付与)との衝突を防ぐ
      if (name === 'id' && model.kind !== 'valueObject') {
        return err(DomainError.create('INVALID', 'field name "id" is reserved'));
      }
      if (model.fields.some((f) => f.id !== fieldId && f.name === name)) {
        return err(DomainError.create('INVALID', `duplicate field name: ${name}`));
      }
      if (dm.relations.some((r) => r.from === modelId && r.name === name)) {
        return err(DomainError.create('INVALID', `field name conflicts with relation: ${name}`));
      }
      normalized.name = name;
    }
    return ok({
      ...dm,
      models: dm.models.map((m) =>
        m.id === modelId
          ? { ...m, fields: m.fields.map((f) => (f.id === fieldId ? { ...f, ...normalized } : f)) }
          : m,
      ),
    });
  },

  removeField(dm: DataModel, modelId: ModelId, fieldId: FieldId): Result<DataModel, DomainError> {
    const model = DataModel.findModel(dm, modelId);
    if (!model) return err(DomainError.notFound('model'));
    if (!model.fields.some((f) => f.id === fieldId)) return err(DomainError.notFound('field'));
    const refsField = (r: ValidationRule): boolean =>
      r.left === fieldId || (r.right.kind === 'field' && r.right.fieldId === fieldId);
    return ok({
      ...dm,
      models: dm.models.map((m) =>
        m.id === modelId
          ? {
              ...m,
              fields: m.fields.filter((f) => f.id !== fieldId),
              // 削除フィールドを参照するルールも除去(ダングリング防止)
              rules: m.rules.filter((r) => !refsField(r)),
            }
          : m,
      ),
    });
  },

  addRule(
    dm: DataModel,
    modelId: ModelId,
    left: FieldId,
    op: RuleOp,
    right: RuleOperand,
    message: string,
  ): Result<Readonly<{ dataModel: DataModel; rule: ValidationRule }>, DomainError> {
    const model = DataModel.findModel(dm, modelId);
    if (!model) return err(DomainError.notFound('model'));
    if (!model.fields.some((f) => f.id === left)) return err(DomainError.notFound('left field'));
    if (right.kind === 'field' && !model.fields.some((f) => f.id === right.fieldId)) {
      return err(DomainError.notFound('right field'));
    }
    const rule: ValidationRule = { id: RuleId.create(), left, op, right, message };
    const dataModel = {
      ...dm,
      models: dm.models.map((m) => (m.id === modelId ? { ...m, rules: [...m.rules, rule] } : m)),
    };
    return ok({ dataModel, rule });
  },

  updateRule(
    dm: DataModel,
    modelId: ModelId,
    ruleId: RuleId,
    patch: Partial<Omit<ValidationRule, 'id'>>,
  ): Result<DataModel, DomainError> {
    const model = DataModel.findModel(dm, modelId);
    if (!model) return err(DomainError.notFound('model'));
    if (!model.rules.some((r) => r.id === ruleId)) return err(DomainError.notFound('rule'));
    return ok({
      ...dm,
      models: dm.models.map((m) =>
        m.id === modelId
          ? { ...m, rules: m.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)) }
          : m,
      ),
    });
  },

  removeRule(dm: DataModel, modelId: ModelId, ruleId: RuleId): Result<DataModel, DomainError> {
    const model = DataModel.findModel(dm, modelId);
    if (!model) return err(DomainError.notFound('model'));
    if (!model.rules.some((r) => r.id === ruleId)) return err(DomainError.notFound('rule'));
    return ok({
      ...dm,
      models: dm.models.map((m) =>
        m.id === modelId ? { ...m, rules: m.rules.filter((r) => r.id !== ruleId) } : m,
      ),
    });
  },

  addRelation(
    dm: DataModel,
    from: ModelId,
    to: ModelId,
    kind: RelationKind,
  ): Result<Readonly<{ dataModel: DataModel; relation: RelationDef }>, DomainError> {
    const fromModel = DataModel.findModel(dm, from);
    const toModel = DataModel.findModel(dm, to);
    if (!fromModel || !toModel) return err(DomainError.notFound('model'));
    if (from === to) return err(DomainError.create('INVALID', 'self relation is not supported'));
    let name = lower(toModel.name) + (kind === 'hasMany' ? 's' : '');
    let n = 2;
    const taken = (candidate: string) =>
      fromModel.fields.some((f) => f.name === candidate) ||
      dm.relations.some((r) => r.from === from && r.name === candidate);
    while (taken(name)) {
      name = `${lower(toModel.name)}${kind === 'hasMany' ? 's' : ''}${n}`;
      n += 1;
    }
    const relation: RelationDef = { id: RelationId.create(), from, to, kind, name };
    return ok({ dataModel: { ...dm, relations: [...dm.relations, relation] }, relation });
  },

  removeRelation(dm: DataModel, id: RelationId): Result<DataModel, DomainError> {
    if (!dm.relations.some((r) => r.id === id)) return err(DomainError.notFound('relation'));
    return ok({ ...dm, relations: dm.relations.filter((r) => r.id !== id) });
  },
} as const;
