import type { DataModel, FieldType, ModelDef } from '@/domain/data-model';
import type { GeneratedFile } from './files';
import { toCamelCase, toKebabCase } from './identifiers';

/**
 * Vue 向けドメイン層生成(FR-GEN-07 / B)。データモデルの集約から、フレームワーク非依存の
 * ドメインモジュール(型 + create 検証 + シード付きインメモリ repository)と、それを参照する
 * データバインド済み一覧ページ(.vue)を生成する。React の完全なドメイン/DI 生成の Vue 版
 * 第一歩(mock データで動く UI 層の実証)。
 */

const tsType = (t: FieldType): string => (t === 'number' ? 'number' : t === 'boolean' ? 'boolean' : 'string');

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

const scalarFields = (model: ModelDef) => model.fields;

/** 集約1つ分のドメインモジュール(型 + 検証 + シード付き mock repository) */
const domainModule = (model: ModelDef): string => {
  const fields = scalarFields(model);
  const typeLines = fields.map((f) => `  ${f.name}: ${tsType(f.type)};`).join('\n');
  const seeds = [1, 2, 3]
    .map((i) => `  { id: '${toCamelCase(model.name)}-${i}', ${fields.map((f) => `${f.name}: ${seedValue(f.name, f.type, i)}`).join(', ')} },`)
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

  return `// 自動生成 — AppForge(Vue): ドメイン ${model.name}(型 + 検証 + シード付き mock repository)
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

/** 集約の一覧ページ(.vue)。生成 repository のシードデータを表で表示 */
const listPage = (model: ModelDef): string => {
  const fields = scalarFields(model);
  const headers = ['id', ...fields.map((f) => f.name)];
  const ths = headers.map((h) => `          <th>${h}</th>`).join('\n');
  const tds = headers.map((h) => `          <td>{{ row.${h} }}</td>`).join('\n');
  return `<!-- 自動生成 — AppForge(Vue): ${model.name} 一覧(生成ドメインのデータバインド) -->
<script setup lang="ts">
import { ref } from 'vue';
import { ${model.name}Repository, type ${model.name} } from '../../domain/${toKebabCase(model.name)}';
const rows = ref<${model.name}[]>(${model.name}Repository.list());
</script>

<template>
  <div class="c-container" style="display: flex; flex-direction: column; gap: 16px; padding: 24px;">
    <h1 class="c-heading">${model.name} 一覧</h1>
    <table class="c-table">
      <thead>
        <tr>
${ths}
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
${tds}
        </tr>
      </tbody>
    </table>
  </div>
</template>
`;
};

export type VueDomainOutput = Readonly<{
  files: GeneratedFile[];
  /** router.ts に追記するルート(path, importPath) */
  routes: ReadonlyArray<Readonly<{ path: string; component: string }>>;
}>;

/** データモデル → Vue ドメインモジュール + 一覧ページ + ルート */
export const emitVueDomain = (dm: DataModel): VueDomainOutput => {
  const aggregates = dm.models.filter((m) => m.kind === 'aggregate');
  const files: GeneratedFile[] = [];
  const routes: Array<{ path: string; component: string }> = [];
  for (const agg of aggregates) {
    const kebab = toKebabCase(agg.name);
    files.push({ path: `src/domain/${kebab}.ts`, content: domainModule(agg) });
    files.push({ path: `src/pages/admin/${kebab}.vue`, content: listPage(agg) });
    routes.push({ path: `/admin/${kebab}s`, component: `./pages/admin/${kebab}.vue` });
  }
  return { files, routes };
};
