import type { DataModel, ModelDef, RelationDef } from '@/domain/data-model';
import { toCamelCase, toKebabCase } from './identifiers';

/**
 * 中立 I/F モデル(requirements.md §5 / FR-IF-00)。
 * 特定の IDL(TypeSpec / OpenAPI)に依存しない API の内部表現。
 * M3b では集約の CRUD から自動導出する(I/F デザイナー UI は将来)。
 * この中立モデルを唯一の入力として、各アダプタ(TypeSpec exporter 等)が出力を生成する。
 */

export type IfScalar = 'string' | 'number' | 'boolean';

export type IfFieldType =
  | Readonly<{ kind: 'scalar'; scalar: IfScalar }>
  | Readonly<{ kind: 'ref'; dto: string }>;

export type IfField = Readonly<{
  name: string;
  type: IfFieldType;
  array: boolean;
  optional: boolean;
}>;

export type IfDto = Readonly<{
  name: string;
  fields: ReadonlyArray<IfField>;
}>;

export type IfMethod = 'get' | 'post' | 'delete';

export type IfOperation = Readonly<{
  id: string;
  method: IfMethod;
  /** '/customers' / '/customers/{id}' */
  path: string;
  pathParams: ReadonlyArray<string>;
  /** リクエストボディの DTO 名(なければ null) */
  bodyDto: string | null;
  /** レスポンス DTO 名(void なら null) */
  responseDto: string | null;
  responseArray: boolean;
  summary: string;
}>;

export type InterfaceModel = Readonly<{
  serviceTitle: string;
  dtos: ReadonlyArray<IfDto>;
  operations: ReadonlyArray<IfOperation>;
}>;

const scalar = (s: IfScalar): IfFieldType => ({ kind: 'scalar', scalar: s });

const fieldScalar = (type: ModelDef['fields'][number]['type']): IfScalar =>
  type === 'number' ? 'number' : type === 'boolean' ? 'boolean' : 'string';

/** REST のリソースパス(集約名の複数形・kebab)。例: Customer → /customers */
export const resourcePath = (model: ModelDef): string => `/${toKebabCase(model.name)}s`;

const relationFieldType = (
  r: RelationDef,
  byId: ReadonlyMap<string, ModelDef>,
  ensureDto: (m: ModelDef) => void,
): IfFieldType => {
  const target = byId.get(r.to);
  if (!target) return scalar('string');
  if (target.kind === 'valueObject') {
    if (target.fields.length === 1) return scalar(fieldScalar(target.fields[0]!.type));
    ensureDto(target);
    return { kind: 'ref', dto: target.name };
  }
  // 集約 / エンティティ参照は ID 文字列(ドメイン層の ID 参照と一致)
  return scalar('string');
};

const dtoFieldsOf = (
  model: ModelDef,
  dm: DataModel,
  byId: ReadonlyMap<string, ModelDef>,
  ensureDto: (m: ModelDef) => void,
  forInput: boolean,
): ReadonlyArray<IfField> => {
  const scalarFields: IfField[] = model.fields.map((f) => ({
    name: f.name,
    type: scalar(fieldScalar(f.type)),
    array: false,
    optional: !f.required,
  }));
  const relationFields: IfField[] = dm.relations
    .filter((r) => r.from === model.id)
    .map((r) => ({
      name: r.name,
      type: relationFieldType(r, byId, ensureDto),
      array: r.kind === 'hasMany',
      // 入力では関連は任意(後から関連付け可能)
      optional: forInput,
    }));
  return [...scalarFields, ...relationFields];
};

/** 集約の CRUD から中立 I/F モデルを導出する */
export const deriveInterfaceModel = (dm: DataModel, serviceTitle: string): InterfaceModel => {
  const aggregates = dm.models.filter((m) => m.kind === 'aggregate');
  if (aggregates.length === 0) {
    return { serviceTitle, dtos: [], operations: [] };
  }
  const byId = new Map(dm.models.map((m) => [m.id, m] as const));

  // 参照される多フィールド VO の DTO を遅延収集する
  const dtoMap = new Map<string, IfDto>();
  const pending: ModelDef[] = [];
  const ensureDto = (m: ModelDef) => {
    if (!dtoMap.has(m.name)) {
      dtoMap.set(m.name, { name: m.name, fields: [] }); // プレースホルダ(循環防止)
      pending.push(m);
    }
  };

  const dtos: IfDto[] = [];
  const operations: IfOperation[] = [];

  for (const agg of aggregates) {
    const entity: IfDto = {
      name: agg.name,
      fields: [
        { name: 'id', type: scalar('string'), array: false, optional: false },
        ...dtoFieldsOf(agg, dm, byId, ensureDto, false),
      ],
    };
    const input: IfDto = {
      name: `${agg.name}Input`,
      fields: dtoFieldsOf(agg, dm, byId, ensureDto, true),
    };
    dtos.push(entity, input);

    const base = resourcePath(agg);
    const lower = toCamelCase(agg.name);
    operations.push(
      {
        id: `list${agg.name}s`,
        method: 'get',
        path: base,
        pathParams: [],
        bodyDto: null,
        responseDto: agg.name,
        responseArray: true,
        summary: `${agg.name} 一覧`,
      },
      {
        id: `get${agg.name}`,
        method: 'get',
        path: `${base}/{id}`,
        pathParams: ['id'],
        bodyDto: null,
        responseDto: agg.name,
        responseArray: false,
        summary: `${agg.name} 取得`,
      },
      {
        id: `create${agg.name}`,
        method: 'post',
        path: base,
        pathParams: [],
        bodyDto: `${agg.name}Input`,
        responseDto: agg.name,
        responseArray: false,
        summary: `${agg.name} 作成`,
      },
      {
        id: `delete${agg.name}`,
        method: 'delete',
        path: `${base}/{id}`,
        pathParams: ['id'],
        bodyDto: null,
        responseDto: null,
        responseArray: false,
        summary: `${agg.name} 削除`,
      },
    );
    void lower;
  }

  // 参照 VO の DTO を実体化
  while (pending.length > 0) {
    const m = pending.shift()!;
    dtoMap.set(m.name, { name: m.name, fields: dtoFieldsOf(m, dm, byId, ensureDto, false) });
  }
  dtos.push(...dtoMap.values());

  return { serviceTitle, dtos, operations };
};
