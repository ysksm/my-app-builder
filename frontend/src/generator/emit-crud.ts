import type { DataModel, FieldDef, ModelDef } from '@/domain/data-model';
import type { GeneratedFile } from './files';
import { toCamelCase, toKebabCase } from './identifiers';
import { buildFeatureLayout, modelPaths, paths, relativeImport, type FeatureLayout } from './layout';

/**
 * FR-MDL-06: 集約ごとに CRUD 管理画面の雛形を生成(モデルファースト → UI)。
 * features/{集約}/ の application(ユースケース)/ presentation(管理画面 + repository コンテキスト)へ配置。
 * presentation は app/di/container を直接参照せず、機能ごとの React コンテキスト経由で repository を受け取る
 * (feature → app の逆依存を作らない。container は App でコンテキストに注入する)。
 */

const aggregatesOf = (dm: DataModel): ReadonlyArray<ModelDef> =>
  dm.models.filter((m) => m.kind === 'aggregate');

export const crudRouteOf = (model: ModelDef): string => `/admin/${toKebabCase(model.name)}`;

const emitUsecases = (model: ModelDef, layout: FeatureLayout): string => {
  const name = model.name;
  const p = modelPaths(layout, model);
  const result = relativeImport(p.usecases, paths.result);
  const repoError = relativeImport(p.usecases, paths.repositoryError);
  const validation = relativeImport(p.usecases, paths.validation);
  const modelSpec = relativeImport(p.usecases, p.model);
  const repoSpec = relativeImport(p.usecases, p.repository);
  return `// 自動生成 — AppForge アプリケーション層ユースケース(${name})
// repository は引数注入(DIP)— テスト時は mock repository を渡す
import type { Result } from '${result}';
import { ${name}, type ${name}Id, type ${name}Input } from '${modelSpec}';
import type { ${name}Repository } from '${repoSpec}';
import type { RepositoryError } from '${repoError}';
import type { ValidationError } from '${validation}';

export type Create${name}Error = ReadonlyArray<ValidationError> | RepositoryError;

export const create${name} = async (
  repository: ${name}Repository,
  input: ${name}Input,
): Promise<Result<${name}, Create${name}Error>> => {
  const created = ${name}.create(input);
  if (!created.ok) return created;
  return repository.save(created.value);
};

export const list${name}s = (
  repository: ${name}Repository,
): Promise<Result<ReadonlyArray<${name}>, RepositoryError>> => repository.findAll();

export const remove${name} = (
  repository: ${name}Repository,
  id: ${name}Id,
): Promise<Result<void, RepositoryError>> => repository.remove(id);
`;
};

const emitRepositoryContext = (model: ModelDef, layout: FeatureLayout): string => {
  const name = model.name;
  const p = modelPaths(layout, model);
  const repoSpec = relativeImport(p.context, p.repository);
  return `// 自動生成 — AppForge: ${name}Repository の DI コンテキスト(App で container から注入)
import { createContext, useContext } from 'react';
import type { ${name}Repository } from '${repoSpec}';

export const ${name}RepositoryContext = createContext<${name}Repository | null>(null);

export const use${name}Repository = (): ${name}Repository => {
  const repository = useContext(${name}RepositoryContext);
  if (!repository) throw new Error('${name}RepositoryContext provider が見つかりません');
  return repository;
};
`;
};

const inputStateOf = (f: FieldDef): { init: string; parse: string } => {
  switch (f.type) {
    case 'boolean':
      return { init: 'useState(false)', parse: `${f.name}Input` };
    case 'number':
      return {
        init: `useState('')`,
        parse: f.required
          ? `Number(${f.name}Input)`
          : `${f.name}Input === '' ? null : Number(${f.name}Input)`,
      };
    default:
      return {
        init: `useState('')`,
        parse: f.required ? `${f.name}Input` : `${f.name}Input === '' ? null : ${f.name}Input`,
      };
  }
};

const formFieldJsx = (f: FieldDef): string => {
  const setter = `set${f.name[0]!.toUpperCase()}${f.name.slice(1)}Input`;
  if (f.type === 'boolean') {
    return `        <label className="c-input">
          <span>${f.name}</span>
          <input
            type="checkbox"
            checked={${f.name}Input}
            onChange={(e) => ${setter}(e.target.checked)}
          />
        </label>`;
  }
  const inputType = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text';
  return `        <label className="c-input">
          <span>${f.name}${f.required ? ' *' : ''}</span>
          <input
            type="${inputType}"
            value={${f.name}Input}
            onChange={(e) => ${setter}(e.target.value)}
          />
        </label>`;
};

const cellExpr = (f: FieldDef): string =>
  f.type === 'boolean' ? `{item.${f.name} ? '✓' : '—'}` : `{String(item.${f.name} ?? '—')}`;

const emitAdminPage = (model: ModelDef, dm: DataModel, layout: FeatureLayout): string => {
  const name = model.name;
  const p = modelPaths(layout, model);
  const usecasesSpec = relativeImport(p.adminPage, p.usecases);
  const contextSpec = relativeImport(p.adminPage, p.context);
  const modelSpec = relativeImport(p.adminPage, p.model);
  const relations = dm.relations.filter((r) => r.from === model.id);

  const states = model.fields
    .map((f) => {
      const upper = `${f.name[0]!.toUpperCase()}${f.name.slice(1)}`;
      return `  const [${f.name}Input, set${upper}Input] = ${inputStateOf(f).init};`;
    })
    .join('\n');

  const resetters = model.fields
    .map((f) => {
      const upper = `${f.name[0]!.toUpperCase()}${f.name.slice(1)}`;
      return f.type === 'boolean' ? `    set${upper}Input(false);` : `    set${upper}Input('');`;
    })
    .join('\n');

  const inputObject = model.fields
    .map((f) => `      ${f.name}: ${inputStateOf(f).parse},`)
    .join('\n');

  const headCells = [
    ...model.fields.map((f) => `              <th>${f.name}</th>`),
    ...relations.map((r) => `              <th>${r.name}</th>`),
  ].join('\n');

  const bodyCells = [
    ...model.fields.map((f) => `                <td>${cellExpr(f)}</td>`),
    ...relations.map((r) =>
      r.kind === 'hasMany'
        ? `                <td>{item.${r.name}.length} 件</td>`
        : `                <td>{item.${r.name} === null ? '—' : '参照あり'}</td>`,
    ),
  ].join('\n');

  return `// 自動生成 — AppForge CRUD 管理画面雛形(${name})
import { useCallback, useEffect, useState } from 'react';
import {
  create${name},
  list${name}s,
  remove${name},
} from '${usecasesSpec}';
import { use${name}Repository } from '${contextSpec}';
import type { ${name} } from '${modelSpec}';

export function ${name}AdminPage() {
  const repository = use${name}Repository();
  const [items, setItems] = useState<ReadonlyArray<${name}>>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
${states}

  const reload = useCallback(async () => {
    const result = await list${name}s(repository);
    if (result.ok) setItems(result.value);
  }, [repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async () => {
    const result = await create${name}(repository, {
${inputObject}
    });
    if (!result.ok) {
      // ReadonlyArray は Array.isArray で絞り込めないため 'code' in で判別する
      setErrorText(
        'code' in result.error
          ? result.error.message
          : result.error.map((e) => \`\${e.field}: \${e.message}\`).join(' / '),
      );
      return;
    }
    setErrorText(null);
${resetters}
    await reload();
  };

  return (
    <div className="c-container" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
      <h2 className="c-heading">${name} 管理</h2>
      <div className="c-container" style={{ display: 'flex', flexDirection: 'row', gap: 12, padding: 0 }}>
${model.fields.map(formFieldJsx).join('\n')}
        <button type="button" className="c-button v-primary" onClick={() => void handleCreate()}>
          追加
        </button>
      </div>
      {errorText !== null && <p className="c-text form-error">{errorText}</p>}
      <table className="c-table">
        <thead>
          <tr>
${headCells}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
${bodyCells}
              <td>
                <button
                  type="button"
                  className="c-button v-danger"
                  onClick={() => {
                    void remove${name}(repository, item.id).then(reload);
                  }}
                >
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
`;
};

const emitAdminIndex = (aggregates: ReadonlyArray<ModelDef>): string => {
  const links = aggregates
    .map((m) => `        <li><Link to="${crudRouteOf(m)}">${m.name} 管理</Link></li>`)
    .join('\n');
  return `// 自動生成 — AppForge データ管理インデックス
import { Link } from 'react-router';

export function AdminIndexPage() {
  return (
    <div className="c-container" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
      <h2 className="c-heading">データ管理</h2>
      <ul className="admin-links">
${links}
      </ul>
    </div>
  );
}
`;
};

/** App.tsx のルーティングに追加する CRUD ルート(file は src 相対パス) */
export type CrudRoute = Readonly<{ path: string; componentName: string; file: string }>;

export const crudRoutes = (dm: DataModel): ReadonlyArray<CrudRoute> => {
  const aggregates = aggregatesOf(dm);
  if (aggregates.length === 0) return [];
  const layout = buildFeatureLayout(dm);
  return [
    { path: '/admin', componentName: 'AdminIndexPage', file: paths.adminIndex },
    ...aggregates.map((m) => ({
      path: crudRouteOf(m),
      componentName: `${m.name}AdminPage`,
      file: modelPaths(layout, m).adminPage,
    })),
  ];
};

/** App.tsx で repository コンテキストへ container を注入するための情報 */
export type CrudProvider = Readonly<{ contextName: string; file: string; repoField: string }>;

export const crudProviders = (dm: DataModel): ReadonlyArray<CrudProvider> => {
  const layout = buildFeatureLayout(dm);
  return aggregatesOf(dm).map((m) => ({
    contextName: `${m.name}RepositoryContext`,
    file: modelPaths(layout, m).context,
    repoField: `${toCamelCase(m.name)}Repository`,
  }));
};

export const emitCrudFiles = (dm: DataModel): GeneratedFile[] => {
  const aggregates = aggregatesOf(dm);
  if (aggregates.length === 0) return [];
  const layout = buildFeatureLayout(dm);
  const files: GeneratedFile[] = [{ path: paths.adminIndex, content: emitAdminIndex(aggregates) }];
  for (const model of aggregates) {
    const p = modelPaths(layout, model);
    files.push({ path: p.usecases, content: emitUsecases(model, layout) });
    files.push({ path: p.context, content: emitRepositoryContext(model, layout) });
    files.push({ path: p.adminPage, content: emitAdminPage(model, dm, layout) });
  }
  return files;
};
