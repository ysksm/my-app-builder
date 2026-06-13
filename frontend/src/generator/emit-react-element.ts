import { collectComponents, toUiTree, type UiAttrValue, type UiElement } from './ui-model';
import type { ComponentNode } from '@/domain/component-node';

/**
 * 中立 UI 要素モデル → React JSX(表現構造のみ)。Remix(React Router 7)の
 * ルートコンポーネント生成に使う軽量シリアライザ。emit-jsx(完全機能・イベント/状態込み)
 * とは別に、中立モデルから直接 JSX を起こす framework アダプタの一部。
 */

const attrStr = (s: string): string => JSON.stringify(s);

const styleObject = (style: Readonly<Record<string, string>>): string => {
  const entries = Object.entries(style)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(', ');
  return `style={{ ${entries} }}`;
};

const attrToken = (name: string, value: UiAttrValue): string | null => {
  if (typeof value === 'string') return `${name}=${attrStr(value)}`;
  return `${name}={${value}}`; // number / boolean
};

const VOID_TAGS = new Set(['img', 'input', 'br', 'hr']);

export const emitReactElement = (el: UiElement, indent = 0): string[] => {
  const pad = '  '.repeat(indent);
  const head: string[] = [el.tag];
  if (el.classes.length > 0) head.push(`className=${attrStr(el.classes.join(' '))}`);
  if (Object.keys(el.style).length > 0) head.push(styleObject(el.style));
  for (const [name, value] of Object.entries(el.attrs)) {
    const token = attrToken(name, value);
    if (token !== null) head.push(token);
  }
  const open = head.join(' ');

  const selfClose = VOID_TAGS.has(el.tag) || (el.component && el.children.length === 0 && el.text === null);
  if (selfClose && el.text === null && el.children.length === 0) {
    return [`${pad}<${open} />`];
  }
  if (el.text !== null) {
    return [`${pad}<${open}>{${JSON.stringify(el.text)}}</${el.tag}>`];
  }
  if (el.children.length === 0) {
    return [`${pad}<${open}></${el.tag}>`];
  }
  return [
    `${pad}<${open}>`,
    ...el.children.flatMap((c) => emitReactElement(c, indent + 1)),
    `${pad}</${el.tag}>`,
  ];
};

/** ComponentNode 木 → React ルートコンポーネント(.tsx)。realtimeModule は UI 部品の import 元 */
export const emitReactRoute = (
  root: ComponentNode,
  componentName: string,
  realtimeModule: string,
): string => {
  const tree = toUiTree(root);
  const components = [...collectComponents(tree)].sort();
  const imports =
    components.length > 0 ? `import { ${components.join(', ')} } from '${realtimeModule}';\n` : '';
  const body = emitReactElement(tree, 2).join('\n');
  return `// 自動生成 — AppForge: Remix(React Router 7)ルート / ${componentName}
${imports}
export default function ${componentName}() {
  return (
${body}
  );
}
`;
};
