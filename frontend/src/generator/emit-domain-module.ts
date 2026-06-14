import type { FieldType, ModelDef } from '@/domain/data-model';
import { toCamelCase } from './identifiers';

/**
 * フレームワーク非依存のドメインモジュール生成(FR-GEN-07 / B)。
 * 集約から、型 + create 検証 + シード付きインメモリ repository(純 TypeScript)を生成する。
 * Vue / Svelte / Remix の別フレームワーク generator が共通で使う(UI 層 PoC のデータ源)。
 */

export const tsType = (t: FieldType): string =>
  t === 'number' ? 'number' : t === 'boolean' ? 'boolean' : 'string';

/** フィールド型に応じた i 番目のシード値リテラル */
const seedValue = (name: string, t: FieldType, i: number): string => {
  switch (t) {
    case 'number':
      return String(i * 10);
    case 'boolean':
      return i % 2 === 0 ? 'true' : 'false';
    case 'date':
      return `'2026-0${i}-01'`;
    default:
      return `'${name}${i}'`;
  }
};

/** 一覧ページが参照する表示用フィールド名(id + 各フィールド) */
export const displayColumns = (model: ModelDef): string[] => ['id', ...model.fields.map((f) => f.name)];

/** 集約1つ分のドメインモジュール(型 + 検証 + シード付き mock repository)。純 TS */
export const domainModule = (model: ModelDef): string => {
  const fields = model.fields;
  const typeLines = fields.map((f) => `  ${f.name}: ${tsType(f.type)};`).join('\n');
  const seeds = [1, 2, 3]
    .map(
      (i) =>
        `  { id: '${toCamelCase(model.name)}-${i}', ${fields.map((f) => `${f.name}: ${seedValue(f.name, f.type, i)}`).join(', ')} },`,
    )
    .join('\n');
  const requiredChecks = fields
    .filter((f) => f.required)
    .map((f) =>
      f.type === 'number'
        ? `  if (typeof input.${f.name} !== 'number' || Number.isNaN(input.${f.name})) errors.push('${f.name} は数値が必要です');`
        : f.type === 'boolean'
          ? `  if (typeof input.${f.name} !== 'boolean') errors.push('${f.name} は真偽値が必要です');`
          : `  if (!input.${f.name}) errors.push('${f.name} は必須です');`,
    )
    .join('\n');

  return `// 自動生成 — AppForge: ドメイン ${model.name}(型 + 検証 + シード付き mock repository)
export type ${model.name} = {
  id: string;
${typeLines}
};
export type ${model.name}Input = Omit<${model.name}, 'id'>;

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** create: 必須/型を検証して ${model.name} を作る */
export function create${model.name}(input: ${model.name}Input): Result<${model.name}> {
  const errors: string[] = [];
${requiredChecks || '  // (検証ルールなし)'}
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { id: crypto.randomUUID(), ...input } };
}

const store: ${model.name}[] = [
${seeds}
];

/** インメモリ repository(PoC)。本番では API / DB 実装に差し替える */
export const ${model.name}Repository = {
  list(): ${model.name}[] { return [...store]; },
  add(input: ${model.name}Input): Result<${model.name}> {
    const r = create${model.name}(input);
    if (r.ok) store.push(r.value);
    return r;
  },
};
`;
};
