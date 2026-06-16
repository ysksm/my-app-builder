import type { ComponentNode, NodeStyle } from './component-node';

/** style が実質的に設定されているか(空 {} は未設定扱い) */
export const hasNodeStyle = (node: ComponentNode): boolean =>
  node.style !== undefined && Object.keys(node.style).length > 0;

/** React / Vue 等の inline style オブジェクト用の JSX エントリ列。
 * 例: { width: '200px', flexGrow: 1 } → "width: '200px', flexGrow: 1" */
export const styleJsxEntries = (style: NodeStyle): string =>
  Object.entries(style)
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? v : `'${v}'`}`)
    .join(', ');

/** 中立 UI モデル(ui-model)の style: Record<string,string> 形式に揃える */
export const styleCssRecord = (style: NodeStyle): Record<string, string> =>
  Object.fromEntries(Object.entries(style).map(([k, v]) => [k, String(v)]));
