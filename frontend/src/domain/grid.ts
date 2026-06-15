import type { GridLayout } from './component-node';

/** ToolJet 風グリッドの寸法。列数は固定、行高は px。レンダラ・ジェネレータで共有する。 */
export const GRID = { cols: 12, rowH: 36, gap: 8 } as const;

/** layout 未設定の子を重ならないよう縦に自動整列する既定配置 */
export const autoLayout = (index: number): GridLayout => ({ x: 0, y: index * 3, w: 6, h: 3 });

/** グリッド範囲内に収まるよう丸め・クランプする */
export const clampLayout = (l: GridLayout): GridLayout => {
  const w = Math.max(1, Math.min(GRID.cols, Math.round(l.w)));
  const x = Math.max(0, Math.min(GRID.cols - w, Math.round(l.x)));
  const h = Math.max(1, Math.round(l.h));
  const y = Math.max(0, Math.round(l.y));
  return { x, y, w, h };
};

/** CSS grid の配置スタイル(1 始まり) */
export const gridItemStyle = (l: GridLayout) => ({
  gridColumn: `${l.x + 1} / span ${l.w}`,
  gridRow: `${l.y + 1} / span ${l.h}`,
});
