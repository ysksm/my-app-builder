import type {
  DataModel,
  DomainServiceDef,
  FieldDef,
  ModelDef,
  RelationDef,
  RuleOp,
  ServiceReturn,
  ValidationRule,
} from '@/domain/data-model';
import type { ModelId } from '@/domain/ids';
import type { GeneratedFile } from './files';
import { supportsApi } from './emit-api';
import { toCamelCase, toKebabCase } from './identifiers';
import {
  buildFeatureLayout,
  modelPaths,
  paths,
  relativeImport,
  servicePaths,
  type FeatureLayout,
} from './layout';

/**
 * DDD モデル定義 → ドメイン層コード生成。
 * 規約(requirements.md §4.2): class 不使用 / brand 型 / companion object /
 * Readonly + 純粋関数 / Result<T, E> / 集約ごとに repository I/F + mock 実装。
 * 配置は features × レイヤード構成(§6.2 / FR-GEN-08)に従い、import は layout で解決する。
 */

const q = (value: string): string => JSON.stringify(value);

const tsTypeOf = (f: FieldDef): string => (f.type === 'date' ? 'string' : f.type);

type Ctx = Readonly<{
  layout: FeatureLayout;
  byId: ReadonlyMap<ModelId, ModelDef>;
  relationsFrom: (id: ModelId) => ReadonlyArray<RelationDef>;
}>;

const buildCtx = (dm: DataModel): Ctx => {
  const byId = new Map(dm.models.map((m) => [m.id, m] as const));
  return {
    layout: buildFeatureLayout(dm),
    byId,
    relationsFrom: (id) => dm.relations.filter((r) => r.from === id),
  };
};

/** リレーション 1 本ぶんの型表現(Aggregate/Entity 参照 = ID、VO 参照 = 埋め込み) */
const relationType = (r: RelationDef, ctx: Ctx): string => {
  const target = ctx.byId.get(r.to);
  if (!target) return 'never';
  const base = target.kind === 'valueObject' ? target.name : `${target.name}Id`;
  return r.kind === 'hasMany' ? `ReadonlyArray<${base}>` : `${base} | null`;
};

/** このモデルが参照する他モデルへの import 群(配置をまたいで相対パスを解決) */
const relationImports = (model: ModelDef, ctx: Ctx, valueImports: boolean): string[] => {
  const selfPath = modelPaths(ctx.layout, model).model;
  const targets = new Map<string, ModelDef>();
  for (const r of ctx.relationsFrom(model.id)) {
    const target = ctx.byId.get(r.to);
    if (target && target.id !== model.id) targets.set(target.name, target);
  }
  return [...targets.values()].map((t) => {
    const symbol = t.kind === 'valueObject' ? t.name : `${t.name}Id`;
    const useValue = valueImports && t.kind === 'valueObject';
    const spec = relativeImport(selfPath, modelPaths(ctx.layout, t).model);
    return `import ${useValue ? '' : 'type '}{ ${symbol} } from '${spec}';`;
  });
};

/** モデルファイル先頭の result / validation への import */
const sharedImports = (selfPath: string, kind: 'value' | 'type'): string => {
  const result = relativeImport(selfPath, paths.result);
  const validation = relativeImport(selfPath, paths.validation);
  const resultLine =
    kind === 'value'
      ? `import { err, ok, type Result } from '${result}';`
      : `import { ok, type Result } from '${result}';`;
  return `${resultLine}\nimport { ValidationError } from '${validation}';`;
};

/** フィールドの検証コード(必須・min/max・pattern)。access は `input.name` 等の式 */
const fieldValidations = (f: FieldDef, access: string): string[] => {
  const lines: string[] = [];
  const guard = (cond: string, message: string) =>
    `  if (${cond}) errors.push(ValidationError.create(${q(f.name)}, ${q(message)}));`;
  const wrap = (cond: string) => (f.required ? cond : `${access} != null && (${cond})`);

  if (f.type === 'string' || f.type === 'date') {
    if (f.required && (f.min === null || f.min <= 0)) {
      lines.push(guard(`${access}.length === 0`, '必須です'));
    }
    if (f.min !== null && f.min > 0) {
      lines.push(guard(wrap(`${access}.length < ${f.min}`), `${f.min} 文字以上で入力してください`));
    }
    if (f.max !== null) {
      lines.push(guard(wrap(`${access}.length > ${f.max}`), `${f.max} 文字以内で入力してください`));
    }
    if (f.type === 'string' && f.pattern) {
      lines.push(guard(wrap(`!new RegExp(${q(f.pattern)}).test(${access})`), '形式が正しくありません'));
    }
  } else if (f.type === 'number') {
    if (f.min !== null) {
      lines.push(guard(wrap(`${access} < ${f.min}`), `${f.min} 以上で入力してください`));
    }
    if (f.max !== null) {
      lines.push(guard(wrap(`${access} > ${f.max}`), `${f.max} 以下で入力してください`));
    }
  }
  return lines;
};

const JS_OP: Record<RuleOp, string> = {
  eq: '===',
  neq: '!==',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

/** クロスフィールドルール(§4.3)→ validate 内の検証行。「left op right が偽なら message」 */
const ruleValidations = (model: ModelDef): string[] => {
  const fieldName = (idValue: string): string | null =>
    model.fields.find((f) => f.id === idValue)?.name ?? null;
  const lines: string[] = [];
  for (const rule of model.rules as ReadonlyArray<ValidationRule>) {
    const left = fieldName(rule.left);
    if (!left) continue; // 参照先フィールドが消えている場合はスキップ
    let right: string;
    if (rule.right.kind === 'field') {
      const name = fieldName(rule.right.fieldId);
      if (!name) continue;
      right = `input.${name}`;
    } else {
      right = JSON.stringify(rule.right.value);
    }
    lines.push(
      `  if (!(input.${left} ${JS_OP[rule.op]} ${right})) errors.push(ValidationError.create(${q(left)}, ${q(rule.message)}));`,
    );
  }
  return lines;
};

const fieldDecl = (f: FieldDef): string =>
  `  ${f.name}: ${tsTypeOf(f)}${f.required ? '' : ' | null'};`;

const inputDecl = (f: FieldDef): string =>
  f.required ? `  ${f.name}: ${tsTypeOf(f)};` : `  ${f.name}?: ${tsTypeOf(f)} | null;`;

const constructExpr = (f: FieldDef): string =>
  f.required ? `      ${f.name}: input.${f.name},` : `      ${f.name}: input.${f.name} ?? null,`;

const mergeExpr = (f: FieldDef): string =>
  f.required
    ? `      ${f.name}: patch.${f.name} ?? current.${f.name},`
    : `      ${f.name}: patch.${f.name} !== undefined ? patch.${f.name} : current.${f.name},`;

/** 集約 / エンティティのソース */
const emitEntity = (model: ModelDef, ctx: Ctx): string => {
  const name = model.name;
  const selfPath = modelPaths(ctx.layout, model).model;
  const relations = ctx.relationsFrom(model.id);
  const validations = [
    ...model.fields.flatMap((f) => fieldValidations(f, `input.${f.name}`)),
    ...ruleValidations(model),
  ];

  const relationDecls = relations.map((r) => `  ${r.name}: ${relationType(r, ctx)};`);
  const relationInputs = relations.map((r) => `  ${r.name}?: ${relationType(r, ctx)};`);
  const relationConstruct = relations.map((r) =>
    r.kind === 'hasMany'
      ? `      ${r.name}: input.${r.name} ?? [],`
      : `      ${r.name}: input.${r.name} ?? null,`,
  );
  const relationMerge = relations.map((r) =>
    r.kind === 'hasMany'
      ? `      ${r.name}: patch.${r.name} ?? current.${r.name},`
      : `      ${r.name}: patch.${r.name} !== undefined ? patch.${r.name} : current.${r.name},`,
  );

  const kindLabel = model.kind === 'aggregate' ? '集約' : 'エンティティ';
  return `// 自動生成 — AppForge ドメインモデル(${kindLabel}: ${name})
${sharedImports(selfPath, 'value')}
${relationImports(model, ctx, false).join('\n')}

export type ${name}Id = string & { readonly __brand: '${name}Id' };

export const ${name}Id = {
  create: (): ${name}Id => crypto.randomUUID() as ${name}Id,
  from: (value: string): ${name}Id => value as ${name}Id,
} as const;

export type ${name} = Readonly<{
  id: ${name}Id;
${[...model.fields.map(fieldDecl), ...relationDecls].join('\n')}
}>;

export type ${name}Input = Readonly<{
${[...model.fields.map(inputDecl), ...relationInputs].join('\n')}
}>;

const validate = (input: ${name}Input): ValidationError[] => {
  const errors: ValidationError[] = [];
${validations.join('\n')}
  return errors;
};

export const ${name} = {
  create(input: ${name}Input): Result<${name}, ReadonlyArray<ValidationError>> {
    const errors = validate(input);
    if (errors.length > 0) return err(errors);
    return ok({
      id: ${name}Id.create(),
${[...model.fields.map(constructExpr), ...relationConstruct].join('\n')}
    });
  },

  update(current: ${name}, patch: Partial<${name}Input>): Result<${name}, ReadonlyArray<ValidationError>> {
    const merged: ${name}Input = {
${[...model.fields.map(mergeExpr), ...relationMerge].join('\n')}
    };
    const errors = validate(merged);
    if (errors.length > 0) return err(errors);
    return ok({
      ...current,
${[...model.fields.map((f) => constructExpr(f).replace('input.', 'merged.')), ...relationConstruct.map((l) => l.replace('input.', 'merged.'))].join('\n')}
    });
  },
} as const;
`;
};

/** 値オブジェクト(単一フィールド)= branded primitive */
const emitSingleFieldVo = (model: ModelDef, field: FieldDef, ctx: Ctx): string => {
  const name = model.name;
  const selfPath = modelPaths(ctx.layout, model).model;
  const primitive = tsTypeOf(field);
  const validations = fieldValidations({ ...field, required: true }, 'value');
  return `// 自動生成 — AppForge ドメインモデル(値オブジェクト: ${name})
${sharedImports(selfPath, 'value')}

export type ${name} = ${primitive} & { readonly __brand: '${name}' };

export const ${name} = {
  create(value: ${primitive}): Result<${name}, ReadonlyArray<ValidationError>> {
    const errors: ValidationError[] = [];
${validations.map((l) => l.replace(q(field.name), q('value'))).join('\n')}
    if (errors.length > 0) return err(errors);
    return ok(value as ${name});
  },

  equals: (a: ${name}, b: ${name}): boolean => a === b,
} as const;
`;
};

/** 値オブジェクト(複数フィールド)= Readonly オブジェクト + create/equals */
const emitMultiFieldVo = (model: ModelDef, ctx: Ctx): string => {
  const name = model.name;
  const selfPath = modelPaths(ctx.layout, model).model;
  const relations = ctx.relationsFrom(model.id);
  const validations = model.fields.flatMap((f) => fieldValidations(f, `input.${f.name}`));

  const equalsExprs = [
    ...model.fields.map((f) => `a.${f.name} === b.${f.name}`),
    ...relations.map((r) => {
      const target = ctx.byId.get(r.to);
      if (r.kind === 'hasMany') {
        const cmp =
          target?.kind === 'valueObject' && target.fields.length > 1
            ? `${target.name}.equals(v, b.${r.name}[i]!)`
            : `v === b.${r.name}[i]`;
        return `a.${r.name}.length === b.${r.name}.length && a.${r.name}.every((v, i) => ${cmp})`;
      }
      if (target?.kind === 'valueObject' && target.fields.length > 1) {
        return `(a.${r.name} === null ? b.${r.name} === null : b.${r.name} !== null && ${target.name}.equals(a.${r.name}, b.${r.name}))`;
      }
      return `a.${r.name} === b.${r.name}`;
    }),
  ];

  return `// 自動生成 — AppForge ドメインモデル(値オブジェクト: ${name})
${sharedImports(selfPath, 'value')}
${relationImports(model, ctx, true).join('\n')}

export type ${name} = Readonly<{
${[...model.fields.map(fieldDecl), ...relations.map((r) => `  ${r.name}: ${relationType(r, ctx)};`)].join('\n')}
}>;

export type ${name}Input = Readonly<{
${[...model.fields.map(inputDecl), ...relations.map((r) => `  ${r.name}?: ${relationType(r, ctx)};`)].join('\n')}
}>;

export const ${name} = {
  create(input: ${name}Input): Result<${name}, ReadonlyArray<ValidationError>> {
    const errors: ValidationError[] = [];
${validations.join('\n')}
    if (errors.length > 0) return err(errors);
    return ok({
${[...model.fields.map(constructExpr), ...relations.map((r) => (r.kind === 'hasMany' ? `      ${r.name}: input.${r.name} ?? [],` : `      ${r.name}: input.${r.name} ?? null,`))].join('\n')}
    });
  },

  equals: (a: ${name}, b: ${name}): boolean =>
    ${equalsExprs.length > 0 ? equalsExprs.join(' &&\n    ') : 'true'},
} as const;
`;
};

/** モデルのテスト雛形。pattern 制約があるとサンプル値を合成できないため todo にする */
const emitModelTest = (model: ModelDef): string => {
  const name = model.name;
  const file = toKebabCase(name);
  const requiredFields = model.fields.filter((f) => f.required);
  const hasPattern = requiredFields.some((f) => f.type === 'string' && f.pattern);

  const sampleOf = (f: FieldDef): string => {
    switch (f.type) {
      case 'string': {
        const len = Math.max(f.min ?? 1, 1);
        return q('a'.repeat(f.max !== null ? Math.min(len, f.max) : len));
      }
      case 'number':
        return String(f.min ?? 1);
      case 'boolean':
        return 'true';
      case 'date':
        return q('2026-01-01');
    }
  };

  const single = model.kind === 'valueObject' && model.fields.length === 1;
  const sampleArg = single
    ? sampleOf(model.fields[0]!)
    : `{ ${requiredFields.map((f) => `${f.name}: ${sampleOf(f)}`).join(', ')} }`;

  if (hasPattern) {
    return `// 自動生成 — AppForge テスト雛形
import { describe, it } from 'vitest';

describe('${name}.create', () => {
  it.todo('pattern 制約に合うサンプル値でテストを書いてください');
});
`;
  }

  const firstStringRequired = requiredFields.find((f) => f.type === 'string');
  const failCase =
    !single && firstStringRequired
      ? `
  it('必須フィールドが空なら失敗する', () => {
    const result = ${name}.create({ ...(${sampleArg}), ${firstStringRequired.name}: '' });
    expect(result.ok).toBe(false);
  });
`
      : '';

  return `// 自動生成 — AppForge テスト雛形
import { describe, expect, it } from 'vitest';
import { ${name} } from './${file}';

describe('${name}.create', () => {
  it('妥当な入力で生成できる', () => {
    const result = ${name}.create(${sampleArg});
    expect(result.ok).toBe(true);
  });
${failCase}});
`;
};

const validationTs = `// 自動生成 — AppForge
export type ValidationError = Readonly<{ field: string; message: string }>;

export const ValidationError = {
  create: (field: string, message: string): ValidationError => ({ field, message }),
} as const;
`;

const repositoryErrorTs = `// 自動生成 — AppForge
export type RepositoryErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'IO';

export type RepositoryError = Readonly<{ code: RepositoryErrorCode; message: string }>;

export const RepositoryError = {
  create: (code: RepositoryErrorCode, message: string): RepositoryError => ({ code, message }),
  notFound: (what: string): RepositoryError => ({
    code: 'NOT_FOUND',
    message: \`\${what} not found\`,
  }),
} as const;
`;

const emitRepositoryInterface = (model: ModelDef, ctx: Ctx): string => {
  const name = model.name;
  const p = modelPaths(ctx.layout, model);
  const result = relativeImport(p.repository, paths.result);
  const repoError = relativeImport(p.repository, paths.repositoryError);
  const modelSpec = relativeImport(p.repository, p.model);
  return `// 自動生成 — AppForge repository I/F(domain 層 — 実装は infrastructure 層が提供: DIP)
import type { Result } from '${result}';
import type { RepositoryError } from '${repoError}';
import type { ${name}, ${name}Id } from '${modelSpec}';

export type ${name}Repository = Readonly<{
  findById(id: ${name}Id): Promise<Result<${name}, RepositoryError>>;
  findAll(): Promise<Result<ReadonlyArray<${name}>, RepositoryError>>;
  save(item: ${name}): Promise<Result<${name}, RepositoryError>>;
  remove(id: ${name}Id): Promise<Result<void, RepositoryError>>;
}>;
`;
};

const emitMockRepository = (model: ModelDef, ctx: Ctx): string => {
  const name = model.name;
  const p = modelPaths(ctx.layout, model);
  const result = relativeImport(p.mock, paths.result);
  const repoError = relativeImport(p.mock, paths.repositoryError);
  const modelSpec = relativeImport(p.mock, p.model);
  const repoSpec = relativeImport(p.mock, p.repository);
  return `// 自動生成 — AppForge インメモリ mock repository(VITE_APP_MODE=mock / テストで使用)
import { err, ok } from '${result}';
import { RepositoryError } from '${repoError}';
import type { ${name}, ${name}Id } from '${modelSpec}';
import type { ${name}Repository } from '${repoSpec}';

export const createInMemory${name}Repository = (): ${name}Repository => {
  const items = new Map<${name}Id, ${name}>();
  return {
    async findById(id) {
      const item = items.get(id);
      return item ? ok(item) : err(RepositoryError.notFound('${name}'));
    },
    async findAll() {
      return ok([...items.values()]);
    },
    async save(item) {
      items.set(item.id, item);
      return ok(item);
    },
    async remove(id) {
      if (!items.delete(id)) return err(RepositoryError.notFound('${name}'));
      return ok(undefined);
    },
  };
};
`;
};

const pascal = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const serviceTypeName = (service: DomainServiceDef): string => `${pascal(service.name)}Service`;
const serviceReturnType = (returns: ServiceReturn, aggName: string): string =>
  returns === 'self' ? aggName : returns; // 'void' | primitive はそのまま

/** ドメインサービス契約(overwrite=true): 入出力の型のみ。実装は impl 側 */
const emitServiceContract = (model: ModelDef, service: DomainServiceDef, ctx: Ctx): string => {
  const p = servicePaths(ctx.layout, model, service.name);
  const aggSpec = relativeImport(p.contract, modelPaths(ctx.layout, model).model);
  const sig = [
    `entity: ${model.name}`,
    ...service.params.map((pp) => `${pp.name}: ${pp.type}`),
  ].join(', ');
  return `// 自動生成 — AppForge ドメインサービス契約(${service.name})
// 契約はビルダーが生成。実装は ${service.name}.impl.ts に手書きする(FR-LOGIC-03)。
import type { ${model.name} } from '${aggSpec}';

export type ${serviceTypeName(service)} = (${sig}) => ${serviceReturnType(service.returns, model.name)};
`;
};

/** ドメインサービス実装スタブ(overwrite=false): 再生成で保持され、ユーザーが実装する */
const emitServiceImpl = (model: ModelDef, service: DomainServiceDef, ctx: Ctx): string => {
  const p = servicePaths(ctx.layout, model, service.name);
  const contractSpec = relativeImport(p.impl, p.contract);
  const argNames = ['entity', ...service.params.map((pp) => pp.name)].join(', ');
  return `// AppForge ドメインサービス実装 — このファイルは再生成で上書きされません(FR-GEN-05)。
// 契約: ${serviceTypeName(service)}。ここに実装を書いてください。
import type { ${serviceTypeName(service)} } from '${contractSpec}';

export const ${service.name}: ${serviceTypeName(service)} = (${argNames}) => {
  throw new Error('${service.name} は未実装です');
};
`;
};

/** DataModel → ドメイン層 + repository + mock + サービス契約のファイル群 */
export const emitDomainFiles = (dm: DataModel): GeneratedFile[] => {
  if (dm.models.length === 0) return [];
  const ctx = buildCtx(dm);
  const files: GeneratedFile[] = [
    { path: paths.validation, content: validationTs },
    { path: paths.repositoryError, content: repositoryErrorTs },
  ];
  for (const model of dm.models) {
    const p = modelPaths(ctx.layout, model);
    const source =
      model.kind === 'valueObject'
        ? model.fields.length === 1 && ctx.relationsFrom(model.id).length === 0
          ? emitSingleFieldVo(model, model.fields[0]!, ctx)
          : emitMultiFieldVo(model, ctx)
        : emitEntity(model, ctx);
    files.push({ path: p.model, content: source });
    files.push({ path: p.test, content: emitModelTest(model) });
    if (model.kind === 'aggregate') {
      files.push({ path: p.repository, content: emitRepositoryInterface(model, ctx) });
      files.push({ path: p.mock, content: emitMockRepository(model, ctx) });
    }
    // ドメインサービス: 契約(上書き)+ 実装スタブ(ユーザー所有・保持)
    for (const service of model.services) {
      const sp = servicePaths(ctx.layout, model, service.name);
      files.push({ path: sp.contract, content: emitServiceContract(model, service, ctx) });
      files.push({ path: sp.impl, overwrite: false, content: emitServiceImpl(model, service, ctx) });
    }
  }
  return files;
};

/** 集約がある場合の di/container.ts(emit-project から利用)。VITE_APP_MODE=api で API 実装、既定は mock */
export const emitContainerWithRepositories = (dm: DataModel): string | null => {
  const aggregates = dm.models.filter((m) => m.kind === 'aggregate');
  if (aggregates.length === 0) return null;
  const ctx = buildCtx(dm);
  const byId = new Map(dm.models.map((m) => [m.id, m] as const));

  const imports = aggregates
    .flatMap((m) => {
      const p = modelPaths(ctx.layout, m);
      const lines = [
        `import type { ${m.name}Repository } from '${relativeImport(paths.container, p.repository)}';`,
        `import { createInMemory${m.name}Repository } from '${relativeImport(paths.container, p.mock)}';`,
      ];
      if (supportsApi(m, dm, byId)) {
        lines.push(
          `import { create${m.name}ApiRepository } from '${relativeImport(paths.container, p.apiRepository)}';`,
        );
      }
      return lines;
    })
    .join('\n');
  const fields = aggregates
    .map((m) => `  ${toCamelCase(m.name)}Repository: ${m.name}Repository;`)
    .join('\n');
  const wiring = aggregates
    .map((m) => {
      const field = `${toCamelCase(m.name)}Repository`;
      if (supportsApi(m, dm, byId)) {
        return `  ${field}: useApi ? create${m.name}ApiRepository() : createInMemory${m.name}Repository(),`;
      }
      // 多フィールド VO 埋め込みのため API 未対応 → 常に mock
      return `  ${field}: createInMemory${m.name}Repository(),`;
    })
    .join('\n');
  return `// 自動生成 — AppForge: Composition Root(DIP)
// VITE_APP_MODE=api のとき API 実装、それ以外(既定 / mock)は インメモリ mock を注入する。
// BE が未生成のうちはプレビュー/テストとも mock で動作する。
${imports}

export type Container = Readonly<{
${fields}
}>;

const mode: string = import.meta.env.VITE_APP_MODE ?? 'mock';

export const isMockMode: boolean = mode !== 'api';

const useApi = mode === 'api';

export const container: Container = {
${wiring}
};
`;
};
