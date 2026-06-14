import type { DataModel, ModelDef } from '@/domain/data-model';
import { displayColumns, domainModule } from './emit-domain-module';
import type { GeneratedFile } from './files';
import { toKebabCase } from './identifiers';

/**
 * Vue 向けドメイン層生成(FR-GEN-07 / B)。共有のドメインモジュール(emit-domain-module)を
 * 使い、それを参照するデータバインド済み一覧ページ(.vue)とルートを生成する。
 */

/** 集約の一覧ページ(.vue)。生成 repository のシードデータを表で表示 */
const listPage = (model: ModelDef): string => {
  const headers = displayColumns(model);
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
