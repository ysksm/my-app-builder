import type { DataModel, ModelDef } from '@/domain/data-model';
import { displayColumns, domainModule } from './emit-domain-module';
import type { GeneratedFile } from './files';
import { toKebabCase } from './identifiers';

/**
 * Remix(React Router 7)向けドメイン層生成(FR-GEN-07 / B)。共有ドメインモジュールを使い、
 * 生成 repository をデータバインドした一覧ルート(.tsx)+ routes.ts への追記エントリを返す。
 */

const listRoute = (model: ModelDef): string => {
  const headers = displayColumns(model);
  const ths = headers.map((h) => `            <th>${h}</th>`).join('\n');
  const tds = headers.map((h) => `              <td>{row.${h}}</td>`).join('\n');
  return `// 自動生成 — AppForge(Remix): ${model.name} 一覧(生成ドメインのデータバインド)
import { ${model.name}Repository } from '../domain/${toKebabCase(model.name)}';

export default function Admin${model.name}() {
  const rows = ${model.name}Repository.list();
  return (
    <div className="c-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px' }}>
      <h1 className="c-heading">${model.name} 一覧</h1>
      <table className="c-table">
        <thead>
          <tr>
${ths}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
${tds}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
`;
};

export type RemixDomainOutput = Readonly<{
  files: GeneratedFile[];
  /** routes.ts に追記する route(...) 行 */
  routeEntries: ReadonlyArray<string>;
}>;

/** データモデル → Remix ドメインモジュール + 一覧ルート + routes.ts エントリ */
export const emitRemixDomain = (dm: DataModel): RemixDomainOutput => {
  const aggregates = dm.models.filter((m) => m.kind === 'aggregate');
  const files: GeneratedFile[] = [];
  const routeEntries: string[] = [];
  for (const agg of aggregates) {
    const kebab = toKebabCase(agg.name);
    files.push({ path: `app/domain/${kebab}.ts`, content: domainModule(agg) });
    files.push({ path: `app/routes/admin-${kebab}.tsx`, content: listRoute(agg) });
    routeEntries.push(`  route('admin/${kebab}s', 'routes/admin-${kebab}.tsx'),`);
  }
  return { files, routeEntries };
};
