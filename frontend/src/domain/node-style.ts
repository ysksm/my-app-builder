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

/** node.style → Tailwind ユーティリティクラス列(tailwind emitter 用。任意値は arbitrary value) */
export const styleTwClasses = (style: NodeStyle): string[] => {
  const cls: string[] = [];
  const w = style.width;
  if (w !== undefined && w !== '') cls.push(w === 'auto' ? 'w-auto' : `w-[${w}]`);
  const h = style.height;
  if (h !== undefined && h !== '') cls.push(h === 'auto' ? 'h-auto' : `h-[${h}]`);
  if (style.flexGrow !== undefined && style.flexGrow !== '')
    cls.push(Number(style.flexGrow) > 0 ? 'grow' : 'grow-0');
  const a = style.alignSelf;
  if (a !== undefined && a !== '') cls.push(`self-${String(a).replace('flex-', '')}`);
  const m = style.margin;
  if (m !== undefined && m !== '') cls.push(`m-[${String(m).trim().replace(/\s+/g, '_')}]`);
  return cls;
};
