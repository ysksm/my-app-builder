import type { ComponentNode } from '@/domain/component-node';
import { collectComponents, toUiTree, type UiAttrValue, type UiElement } from './ui-model';

/**
 * Svelte 5 アダプタ(framework generator、FR-GEN-07)。中立 UI 要素モデル → Svelte の markup。
 * React(emit-jsx)/ Vue(emit-vue)に続く3実装目。表現構造のみ対象(PoC)。
 */

const escapeText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/{/g, '&#123;');

const escapeAttr = (s: string): string => s.replace(/"/g, '&quot;');

const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** style オブジェクト → Svelte の static `style="..."` 文字列(CSS プロパティは kebab) */
const styleAttr = (style: Readonly<Record<string, string>>): string => {
  const decls = Object.entries(style)
    .map(([k, v]) => `${kebab(k)}: ${v}`)
    .join('; ');
  return `style="${escapeAttr(decls)}"`;
};

/** 1つの属性 → Svelte 属性文字列。数値/真偽は式 {value}、文字列は静的属性 */
const attrToken = (name: string, value: UiAttrValue, component: boolean): string | null => {
  if (component) {
    if (typeof value === 'string') return `${name}="${escapeAttr(value)}"`;
    return `${name}={${value}}`;
  }
  if (typeof value === 'boolean') return value ? name : null;
  return `${name}="${escapeAttr(String(value))}"`;
};

const VOID_TAGS = new Set(['img', 'input', 'br', 'hr']);

/** 中立要素 → Svelte markup 行(インデント付き) */
export const emitSvelteElement = (el: UiElement, indent = 0): string[] => {
  const pad = '  '.repeat(indent);
  const head: string[] = [el.tag];
  if (el.classes.length > 0) head.push(`class="${el.classes.join(' ')}"`);
  if (Object.keys(el.style).length > 0) head.push(styleAttr(el.style));
  for (const [name, value] of Object.entries(el.attrs)) {
    const token = attrToken(name, value, el.component);
    if (token !== null) head.push(token);
  }
  const open = head.join(' ');

  const selfClose = VOID_TAGS.has(el.tag) || (el.component && el.children.length === 0 && el.text === null);
  if (selfClose && el.text === null && el.children.length === 0) {
    return [`${pad}<${open} />`];
  }
  if (el.text !== null) {
    return [`${pad}<${open}>${escapeText(el.text)}</${el.tag}>`];
  }
  if (el.children.length === 0) {
    return [`${pad}<${open}></${el.tag}>`];
  }
  return [
    `${pad}<${open}>`,
    ...el.children.flatMap((c) => emitSvelteElement(c, indent + 1)),
    `${pad}</${el.tag}>`,
  ];
};

/** ComponentNode 木 → Svelte コンポーネント(.svelte)。importBase は UI 部品の import 元 */
export const emitSveltePage = (
  root: ComponentNode,
  componentName: string,
  importBase = './realtime',
): string => {
  const tree = toUiTree(root);
  const components = [...collectComponents(tree)].sort();
  const imports = components.map((c) => `  import ${c} from '${importBase}/${c}.svelte';`).join('\n');
  const markup = emitSvelteElement(tree, 0).join('\n');

  return `<!-- 自動生成 — AppForge: Svelte 5(framework generator / ${componentName}) -->
<script lang="ts">
${imports || '  // (UI 部品の参照なし)'}
</script>

${markup}
`;
};
