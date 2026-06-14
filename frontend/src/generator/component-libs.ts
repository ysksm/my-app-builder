/**
 * 外部ライブラリ製コンポーネント(vanilla JS)の npm 依存マップ。
 * 中立 UI ツリーで使われているコンポーネント名(collectComponents の結果)から、
 * 各 framework の package.json に追加すべき依存を導出する。使ったライブラリだけ入る。
 */
export const COMPONENT_LIBS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  Uplot: { uplot: '^1.6.32' },
  EChart: { echarts: '^5.5.1' },
  DataGrid: { 'ag-grid-community': '^33.0.3' },
};

/** 使用中コンポーネント名の集合 → 追加 npm 依存(name→version) */
export const libDepsFor = (used: ReadonlySet<string>): Record<string, string> => {
  const deps: Record<string, string> = {};
  for (const tag of used) Object.assign(deps, COMPONENT_LIBS[tag] ?? {});
  return deps;
};

/** ライブラリ製コンポーネントかどうか(emit-jsx の import 振り分け等で使用) */
export const isLibComponent = (tag: string): boolean => tag in COMPONENT_LIBS;
