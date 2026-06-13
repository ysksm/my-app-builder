import type { DataModel, ModelDef, RelationDef } from '@/domain/data-model';
import type { ModelId } from '@/domain/ids';
import type { GeneratedFile } from './files';
import { resourcePath } from './interface-model';
import {
  buildFeatureLayout,
  modelPaths,
  paths,
  relativeImport,
  type FeatureLayout,
} from './layout';

/**
 * 中立 I/F モデルのもう一つの消費者(TypeSpec export と並ぶ):
 * 集約ごとの API repository 実装(DTO ↔ ドメイン変換)を生成する。
 * BE が未生成の現状ではプレビューは mock を使うため、container は VITE_APP_MODE=api のとき
 * のみ API 実装へ切り替える(既定は mock)。
 *
 * 対応範囲: スカラ項目 + ID 参照関連(集約/エンティティ)+ 単一フィールド VO 関連。
 * 多フィールド VO を埋め込む集約は誤った変換コードを出さないため API 実装を生成せず mock 専用にする。
 */

const api = `src/shared/api/http.ts`;

type Target = Readonly<{ relation: RelationDef; target: ModelDef }>;

const relationsOf = (dm: DataModel, model: ModelDef, byId: ReadonlyMap<ModelId, ModelDef>): Target[] =>
  dm.relations
    .filter((r) => r.from === model.id)
    .map((r) => ({ relation: r, target: byId.get(r.to)! }))
    .filter((t) => t.target !== undefined);

const isSingleFieldVo = (m: ModelDef): boolean => m.kind === 'valueObject' && m.fields.length === 1;
const isMultiFieldVo = (m: ModelDef): boolean => m.kind === 'valueObject' && m.fields.length > 1;

/** API 実装を生成できる集約か(多フィールド VO 埋め込みがない) */
export const supportsApi = (
  model: ModelDef,
  dm: DataModel,
  byId: ReadonlyMap<ModelId, ModelDef>,
): boolean => relationsOf(dm, model, byId).every((t) => !isMultiFieldVo(t.target));

const dtoFieldType = (t: Target): string => {
  if (isSingleFieldVo(t.target)) {
    const prim = t.target.fields[0]!.type;
    const base = prim === 'number' ? 'number' : prim === 'boolean' ? 'boolean' : 'string';
    return t.relation.kind === 'hasMany' ? `${base}[]` : base;
  }
  // 集約 / エンティティ参照 = ID 文字列
  return t.relation.kind === 'hasMany' ? 'string[]' : 'string';
};

const httpTs = `// 自動生成 — AppForge: API クライアント(中立 I/F モデル由来のエンドポイントを叩く)
import { err, ok, type Result } from '../result';
import { RepositoryError } from '../repository-error';

const BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

const request = async (path: string, init?: RequestInit): Promise<Result<unknown, RepositoryError>> => {
  try {
    const res = await fetch(\`\${BASE}\${path}\`, init);
    if (res.status === 404) return err(RepositoryError.notFound(path));
    if (!res.ok) return err(RepositoryError.create('IO', \`HTTP \${res.status}\`));
    if (res.status === 204) return ok(undefined);
    return ok(await res.json());
  } catch (e) {
    return err(RepositoryError.create('IO', e instanceof Error ? e.message : 'network error'));
  }
};

export const httpGet = (path: string) => request(path);

export const httpPost = (path: string, body: unknown) =>
  request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const httpDelete = (path: string) => request(path, { method: 'DELETE' });
`;

const emitApiRepository = (
  model: ModelDef,
  dm: DataModel,
  byId: ReadonlyMap<ModelId, ModelDef>,
  layout: FeatureLayout,
): GeneratedFile => {
  const name = model.name;
  const p = modelPaths(layout, model);
  const apiPath = p.apiRepository;
  const targets = relationsOf(dm, model, byId);

  // import 群
  const importLines = new Set<string>();
  importLines.add(`import { err, ok, type Result } from '${relativeImport(apiPath, paths.result)}';`);
  importLines.add(`import { RepositoryError } from '${relativeImport(apiPath, paths.repositoryError)}';`);
  importLines.add(
    `import { httpGet, httpPost, httpDelete } from '${relativeImport(apiPath, api)}';`,
  );
  importLines.add(`import { ${name}, ${name}Id } from '${relativeImport(apiPath, p.model)}';`);
  importLines.add(
    `import type { ${name}Repository } from '${relativeImport(apiPath, p.repository)}';`,
  );
  for (const t of targets) {
    const targetPath = modelPaths(layout, t.target).model;
    if (isSingleFieldVo(t.target)) {
      importLines.add(`import { ${t.target.name} } from '${relativeImport(apiPath, targetPath)}';`);
    } else {
      importLines.add(
        `import { ${t.target.name}Id } from '${relativeImport(apiPath, targetPath)}';`,
      );
    }
  }

  // DTO 型
  const dtoFields = [
    `  id: string;`,
    ...model.fields.map(
      (f) => `  ${f.name}: ${f.type === 'number' ? 'number' : f.type === 'boolean' ? 'boolean' : 'string'};`,
    ),
    ...targets.map((t) => `  ${t.relation.name}: ${dtoFieldType(t)};`),
  ].join('\n');

  // VO 検証(単一フィールド VO の関連)
  const voValidations: string[] = [];
  const voValues = new Map<string, string>();
  for (const t of targets) {
    if (!isSingleFieldVo(t.target)) continue;
    const r = t.relation.name;
    if (t.relation.kind === 'hasMany') {
      voValidations.push(
        `  const ${r}Decoded: ${t.target.name}[] = [];`,
        `  for (const v of dto.${r}) {`,
        `    const d = ${t.target.name}.create(v);`,
        `    if (!d.ok) return err(RepositoryError.create('IO', '${r} の値が不正です'));`,
        `    ${r}Decoded.push(d.value);`,
        `  }`,
      );
      voValues.set(r, `${r}Decoded`);
    } else {
      voValidations.push(
        `  const ${r}D = ${t.target.name}.create(dto.${r});`,
        `  if (!${r}D.ok) return err(RepositoryError.create('IO', '${r} の値が不正です'));`,
      );
      voValues.set(r, `${r}D.value`);
    }
  }

  const objectFields = [
    `    id: ${name}Id.from(dto.id),`,
    ...model.fields.map((f) => `    ${f.name}: dto.${f.name},`),
    ...targets.map((t) => {
      const r = t.relation.name;
      if (isSingleFieldVo(t.target)) return `    ${r}: ${voValues.get(r)},`;
      // 集約 / エンティティの ID 参照
      if (t.relation.kind === 'hasMany') return `    ${r}: dto.${r}.map(${t.target.name}Id.from),`;
      return `    ${r}: dto.${r} === null ? null : ${t.target.name}Id.from(dto.${r}),`;
    }),
  ].join('\n');

  // create 用ボディ(ID 参照や VO 値はそのまま文字列/primitive で送る)
  const bodyFields = [
    ...model.fields.map((f) => `    ${f.name}: item.${f.name},`),
    ...targets.map((t) => `    ${t.relation.name}: item.${t.relation.name},`),
  ].join('\n');

  const base = resourcePath(model);

  return {
    path: apiPath,
    content: `// 自動生成 — AppForge: ${name} の API repository 実装(中立 I/F モデル由来)
${[...importLines].join('\n')}

type ${name}Dto = {
${dtoFields}
};

const decode = (dto: ${name}Dto): Result<${name}, RepositoryError> => {
${voValidations.length > 0 ? voValidations.join('\n') + '\n' : ''}  return ok({
${objectFields}
  });
};

export const create${name}ApiRepository = (): ${name}Repository => ({
  async findById(id) {
    const res = await httpGet(\`${base}/\${id}\`);
    if (!res.ok) return res;
    return decode(res.value as ${name}Dto);
  },
  async findAll() {
    const res = await httpGet('${base}');
    if (!res.ok) return res;
    const decoded: ${name}[] = [];
    for (const dto of res.value as ${name}Dto[]) {
      const d = decode(dto);
      if (!d.ok) return d;
      decoded.push(d.value);
    }
    return ok(decoded);
  },
  async save(item) {
    const res = await httpPost('${base}', {
${bodyFields}
    });
    if (!res.ok) return res;
    return decode(res.value as ${name}Dto);
  },
  async remove(id) {
    const res = await httpDelete(\`${base}/\${id}\`);
    if (!res.ok) return res;
    return ok(undefined);
  },
});
`,
  };
};

/** API 実装ファイル群(http クライアント + 対応集約の API repository) */
export const emitApiFiles = (dm: DataModel): GeneratedFile[] => {
  const aggregates = dm.models.filter((m) => m.kind === 'aggregate');
  const byId = new Map(dm.models.map((m) => [m.id, m] as const));
  const supported = aggregates.filter((m) => supportsApi(m, dm, byId));
  if (supported.length === 0) return [];
  const layout = buildFeatureLayout(dm);
  return [
    { path: api, content: httpTs },
    ...supported.map((m) => emitApiRepository(m, dm, byId, layout)),
  ];
};
