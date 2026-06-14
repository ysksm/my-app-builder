import type { DataModel, ModelDef } from '@/domain/data-model';
import { displayColumns, domainModule } from './emit-domain-module';
import type { GeneratedFile } from './files';
import { toKebabCase } from './identifiers';

/**
 * Svelte 向けドメイン層生成(FR-GEN-07 / B)。共有ドメインモジュールを使い、Svelte 5 runes の
 * データバインド一覧ページ(.svelte)+ svelte-spa-router 用のルートを生成する。
 */

const capitalize = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

const listPage = (model: ModelDef): string => {
  const headers = displayColumns(model);
  const ths = headers.map((h) => `        <th>${h}</th>`).join('\n');
  const tds = headers.map((h) => `          <td>{row.${h}}</td>`).join('\n');
  return `<!-- 自動生成 — AppForge(Svelte): ${model.name} 一覧(生成ドメインのデータバインド) -->
<script lang="ts">
  import { ${model.name}Repository, type ${model.name} } from '../../domain/${toKebabCase(model.name)}';
  let rows = $state<${model.name}[]>(${model.name}Repository.list());
</script>

<div class="c-container" style="display: flex; flex-direction: column; gap: 16px; padding: 24px;">
  <h1 class="c-heading">${model.name} 一覧</h1>
  <table class="c-table">
    <thead>
      <tr>
${ths}
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.id)}
        <tr>
${tds}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
`;
};

export type SvelteDomainRoute = Readonly<{ path: string; importName: string; importPath: string }>;
export type SvelteDomainOutput = Readonly<{ files: GeneratedFile[]; routes: ReadonlyArray<SvelteDomainRoute> }>;

/** データモデル → Svelte ドメインモジュール + 一覧ページ + svelte-spa-router ルート */
export const emitSvelteDomain = (dm: DataModel): SvelteDomainOutput => {
  const aggregates = dm.models.filter((m) => m.kind === 'aggregate');
  const files: GeneratedFile[] = [];
  const routes: SvelteDomainRoute[] = [];
  for (const agg of aggregates) {
    const kebab = toKebabCase(agg.name);
    files.push({ path: `src/domain/${kebab}.ts`, content: domainModule(agg) });
    files.push({ path: `src/pages/admin/${kebab}.svelte`, content: listPage(agg) });
    routes.push({
      path: `/admin/${kebab}s`,
      importName: `Admin${capitalize(agg.name)}`,
      importPath: `./pages/admin/${kebab}.svelte`,
    });
  }
  return { files, routes };
};
