import type { DataModel, ModelDef } from '@/domain/data-model';
import type { ModelId } from '@/domain/ids';
import { toKebabCase } from './identifiers';

/**
 * 生成コードのフォルダ構成(features × レイヤード、requirements.md §6.2 / FR-GEN-08)を
 * 一元管理する。ファイル配置と import パス解決をここに集約し、各 emitter はパスを直書きしない。
 *
 *   src/
 *   ├── app/        … main / App / store / ui-slice / di/container / 全体オーバーレイ
 *   ├── pages/      … ビルダー設計のページ・ダイアログ・共通ヘッダー/フッター(横断 UI)
 *   ├── features/{feature}/{domain|application|infrastructure|presentation}/
 *   └── shared/     … result / validation / repository-error / styles / 複数機能から参照される domain
 */

export type FeatureLayout = Readonly<{
  /** 集約モデルごとの feature スラグ(kebab) */
  features: ReadonlyArray<string>;
  /** モデル → そのモデルが属する feature スラグ。null は shared/domain */
  featureOf: (id: ModelId) => string | null;
}>;

/** 集約から relation を辿って到達できるモデル集合を返す */
const reachableFrom = (dm: DataModel, start: ModelId): Set<ModelId> => {
  const seen = new Set<ModelId>([start]);
  const queue: ModelId[] = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const r of dm.relations) {
      if (r.from === cur && !seen.has(r.to)) {
        seen.add(r.to);
        queue.push(r.to);
      }
    }
  }
  return seen;
};

/**
 * 機能割り当て:
 * - 集約 = それ自身が1つの feature
 * - 非集約モデル(Entity / VO)= 到達元の集約がちょうど1つならその feature、
 *   0 個または 2 個以上(複数機能で共有)なら shared/domain
 */
export const buildFeatureLayout = (dm: DataModel): FeatureLayout => {
  const aggregates = dm.models.filter((m) => m.kind === 'aggregate');
  const slugOf = new Map<ModelId, string>(aggregates.map((a) => [a.id, toKebabCase(a.name)]));

  // 各集約の到達集合
  const reach = aggregates.map((a) => ({ slug: slugOf.get(a.id)!, set: reachableFrom(dm, a.id) }));

  const assignment = new Map<ModelId, string | null>();
  for (const model of dm.models) {
    if (model.kind === 'aggregate') {
      assignment.set(model.id, slugOf.get(model.id)!);
      continue;
    }
    const owners = reach.filter((r) => r.set.has(model.id));
    assignment.set(model.id, owners.length === 1 ? owners[0]!.slug : null);
  }

  return {
    features: aggregates.map((a) => slugOf.get(a.id)!),
    featureOf: (id) => assignment.get(id) ?? null,
  };
};

// ---------- ファイルパス ----------

const APP = 'src/app';
const PAGES = 'src/pages';
const SHARED = 'src/shared';

export const paths = {
  // app
  mainTsx: `${APP}/main.tsx`,
  appTsx: `${APP}/App.tsx`,
  store: `${APP}/store.ts`,
  uiSlice: `${APP}/ui-slice.ts`,
  container: `${APP}/di/container.ts`,
  dialogHost: `${APP}/DialogHost.tsx`,
  toasts: `${APP}/Toasts.tsx`,

  // shared
  result: `${SHARED}/result.ts`,
  validation: `${SHARED}/validation.ts`,
  repositoryError: `${SHARED}/repository-error.ts`,
  tokensCss: `${SHARED}/styles/tokens.css`,
  appCss: `${SHARED}/styles/app.css`,
  // ユーザー所有(再生成で保持される)カスタムスタイル
  overridesCss: `src/custom/overrides.css`,

  // pages(横断 UI)
  appHeader: `${PAGES}/AppHeader.tsx`,
  appFooter: `${PAGES}/AppFooter.tsx`,
  page: (n: number) => `${PAGES}/Page${n}.tsx`,
  dialog: (n: number) => `${PAGES}/Dialog${n}.tsx`,
  adminIndex: `${PAGES}/admin/AdminIndexPage.tsx`,
} as const;

const domainDir = (layout: FeatureLayout, model: ModelDef): string => {
  const feature = layout.featureOf(model.id);
  return feature ? `src/features/${feature}/domain` : `${SHARED}/domain`;
};

export const modelPaths = (layout: FeatureLayout, model: ModelDef) => {
  const dir = domainDir(layout, model);
  const file = toKebabCase(model.name);
  return {
    model: `${dir}/${file}.ts`,
    test: `${dir}/${file}.test.ts`,
    repository: `src/features/${layout.featureOf(model.id)}/domain/repositories/${file}-repository.ts`,
    mock: `src/features/${layout.featureOf(model.id)}/infrastructure/mock/in-memory-${file}-repository.ts`,
    apiRepository: `src/features/${layout.featureOf(model.id)}/infrastructure/api/${file}-api-repository.ts`,
    usecases: `src/features/${layout.featureOf(model.id)}/application/${file}-usecases.ts`,
    context: `src/features/${layout.featureOf(model.id)}/presentation/${file}-context.ts`,
    adminPage: `src/features/${layout.featureOf(model.id)}/presentation/${model.name}AdminPage.tsx`,
  };
};

// ---------- import パス解決 ----------

/** 2つの src 相対パス間の ESM import 指定子(拡張子なし・相対)を計算する */
export const relativeImport = (fromFile: string, toFile: string): string => {
  const fromDir = fromFile.split('/').slice(0, -1);
  const to = toFile.replace(/\.tsx?$/, '').split('/');
  let i = 0;
  while (i < fromDir.length && i < to.length && fromDir[i] === to[i]) i += 1;
  const ups = fromDir.length - i;
  const segments = [...(ups === 0 ? ['.'] : Array<string>(ups).fill('..')), ...to.slice(i)];
  const spec = segments.join('/');
  return spec.startsWith('.') ? spec : `./${spec}`;
};
