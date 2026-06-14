import type { DataModel, ModelDef, UsecaseDef } from '@/domain/data-model';
import { ruleCondition } from './emit-domain';
import type { GeneratedFile } from './files';
import { toKebabCase } from './identifiers';
import {
  buildFeatureLayout,
  modelPaths,
  paths,
  relativeImport,
  servicePaths,
  type FeatureLayout,
} from './layout';

/**
 * ユースケースフロー(§4.3 FR-LOGIC-02)→ アプリケーション層の読める関数。
 * フロー: create(input) →(self 返却・無引数サービスを順に適用)→(save なら repository.save)→ 結果。
 * repository は引数注入(DIP)。集約に対して定義する。
 */

/** self 返却かつ無引数(= entity だけで呼べる)サービスのみユースケースから適用できる */
const eligibleServiceIds = (model: ModelDef): Set<string> =>
  new Set(model.services.filter((s) => s.returns === 'self' && s.params.length === 0).map((s) => s.id));

const usecaseFile = (layout: FeatureLayout, model: ModelDef, usecase: UsecaseDef): string =>
  `src/features/${layout.featureOf(model.id)}/application/${toKebabCase(usecase.name)}.ts`;

const emitUsecase = (model: ModelDef, usecase: UsecaseDef, layout: FeatureLayout): GeneratedFile => {
  const file = usecaseFile(layout, model, usecase);
  const mp = modelPaths(layout, model);
  const eligible = eligibleServiceIds(model);
  const services = usecase.serviceIds
    .map((sid) => model.services.find((s) => s.id === sid))
    .filter((s): s is NonNullable<typeof s> => s !== undefined && eligible.has(s.id));

  // 事前条件(状態遷移ガード)。input が条件を満たさなければ ValidationError を返す
  const guardCond = usecase.guard ? ruleCondition(model, usecase.guard.left, usecase.guard.op, usecase.guard.right) : null;

  const imports = [
    `import { ok, type Result } from '${relativeImport(file, paths.result)}';`,
    `import { ${model.name}, type ${model.name}Input } from '${relativeImport(file, mp.model)}';`,
    `import type { ${model.name}Repository } from '${relativeImport(file, mp.repository)}';`,
    `import type { RepositoryError } from '${relativeImport(file, paths.repositoryError)}';`,
    // ガードがあると ValidationError を値として使う
    `import { ${guardCond ? '' : 'type '}ValidationError } from '${relativeImport(file, paths.validation)}';`,
    ...services.map((s) => {
      const sp = servicePaths(layout, model, s.name);
      return `import { ${s.name} } from '${relativeImport(file, sp.impl)}';`;
    }),
  ];

  const body: string[] = [];
  if (guardCond && usecase.guard) {
    body.push(
      `  // 状態遷移ガード(事前条件)`,
      `  if (!(${guardCond.expr})) return { ok: false, error: [ValidationError.create(${JSON.stringify(guardCond.leftName)}, ${JSON.stringify(usecase.guard.message)})] };`,
    );
  }
  body.push(
    `  const created = ${model.name}.create(input);`,
    `  if (!created.ok) return created;`,
  );
  const hasMutation = services.length > 0;
  if (hasMutation) {
    body.push(`  let entity = created.value;`);
    for (const s of services) body.push(`  entity = ${s.name}(entity);`);
  } else {
    body.push(`  const entity = created.value;`);
  }
  if (usecase.save) {
    body.push(`  return repository.save(entity);`);
  } else {
    body.push(`  return ok(entity);`);
  }

  const errorType = `ReadonlyArray<ValidationError> | RepositoryError`;
  const content = `// 自動生成 — AppForge ユースケース(${usecase.name})。repository は引数注入(DIP)
${imports.join('\n')}

export type ${capitalize(usecase.name)}Error = ${errorType};

export const ${usecase.name} = async (
  repository: ${model.name}Repository,
  input: ${model.name}Input,
): Promise<Result<${model.name}, ${capitalize(usecase.name)}Error>> => {
${body.join('\n')}
};
`;
  return { path: file, content };
};

const capitalize = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** ユースケースのテスト雛形。未実装サービスを使う場合は実行できないため todo にする */
const emitUsecaseTest = (model: ModelDef, usecase: UsecaseDef, layout: FeatureLayout): GeneratedFile => {
  const file = `src/features/${layout.featureOf(model.id)}/application/${toKebabCase(usecase.name)}.test.ts`;
  // サービス(未実装)/ pattern / ルールがあるとサンプル入力で成功を保証できないため todo にする
  const hasPattern = model.fields.some((f) => f.type === 'string' && f.pattern);
  const cannotAutoTest = usecase.serviceIds.length > 0 || hasPattern || model.rules.length > 0 || usecase.guard !== null;
  const content = cannotAutoTest
    ? `// 自動生成 — AppForge ユースケーステスト雛形
import { describe, it } from 'vitest';

describe('${usecase.name}', () => {
  it.todo('ドメインサービス実装後にテストを書いてください');
});
`
    : `// 自動生成 — AppForge ユースケーステスト雛形
import { describe, expect, it } from 'vitest';
import { ${usecase.name} } from './${toKebabCase(usecase.name)}';
import { createInMemory${model.name}Repository } from '${relativeImportFromTest(model, layout, file)}';

describe('${usecase.name}', () => {
  it('妥当な入力で成功する', async () => {
    const repo = createInMemory${model.name}Repository();
    const result = await ${usecase.name}(repo, ${sampleInput(model)});
    expect(result.ok).toBe(true);
  });
});
`;
  return { path: file, content };
};

const relativeImportFromTest = (model: ModelDef, layout: FeatureLayout, testFile: string): string =>
  relativeImport(testFile, modelPaths(layout, model).mock);

/** 必須フィールドの最小サンプル入力。pattern 制約は無視(save までは到達する想定) */
const sampleInput = (model: ModelDef): string => {
  const parts = model.fields
    .filter((f) => f.required)
    .map((f) => {
      const v =
        f.type === 'number'
          ? String(f.min ?? 1)
          : f.type === 'boolean'
            ? 'true'
            : f.type === 'date'
              ? `'2026-01-01'`
              : `'x'`;
      return `${f.name}: ${v}`;
    });
  return `{ ${parts.join(', ')} }`;
};

export const emitUsecaseFiles = (dm: DataModel): GeneratedFile[] => {
  const layout = buildFeatureLayout(dm);
  const files: GeneratedFile[] = [];
  for (const model of dm.models) {
    if (model.kind !== 'aggregate') continue;
    for (const usecase of model.usecases) {
      files.push(emitUsecase(model, usecase, layout));
      files.push(emitUsecaseTest(model, usecase, layout));
    }
  }
  return files;
};
