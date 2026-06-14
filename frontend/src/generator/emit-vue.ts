import type { ComponentNode } from '@/domain/component-node';
import { collectComponents, toUiTree, type UiAttrValue, type UiElement } from './ui-model';

/**
 * Vue 3 SFC アダプタ(framework generator PoC、FR-GEN-07)。
 * 中立 UI 要素モデル(ui-model.ts)→ Vue の <template>。React の emit-jsx と同じ
 * 中立ツリーを入力にする2実装目で、「UI 構造は framework 非依存」を実証する。
 *
 * PoC のため表現構造のみを対象とし、イベント配線・状態は対象外
 * (本格的な Vue アプリ一式の生成は将来)。
 */

const escapeText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escapeAttr = (s: string): string => s.replace(/"/g, '&quot;');

/** style オブジェクト → Vue の `:style="{ ... }"` 文字列 */
const styleBinding = (style: Readonly<Record<string, string>>): string => {
  const entries = Object.entries(style)
    .map(([k, v]) => `${k}: '${v}'`)
    .join(', ');
  return `:style="{ ${entries} }"`;
};

/** 1つの属性 → Vue 属性文字列。コンポーネントの数値/真偽 props はバインド(:) */
const attrToken = (name: string, value: UiAttrValue, component: boolean): string | null => {
  if (component) {
    if (typeof value === 'string') return `${name}="${escapeAttr(value)}"`;
    return `:${name}="${value}"`; // number / boolean はバインド
  }
  if (typeof value === 'boolean') return value ? name : null;
  return `${name}="${escapeAttr(String(value))}"`;
};

const VOID_TAGS = new Set(['img', 'input', 'br', 'hr']);

/** 中立要素 → Vue テンプレート行(インデント付き) */
export const emitVueElement = (el: UiElement, indent = 0): string[] => {
  const pad = '  '.repeat(indent);
  const head: string[] = [el.tag];
  if (el.classes.length > 0) head.push(`class="${el.classes.join(' ')}"`);
  if (Object.keys(el.style).length > 0) head.push(styleBinding(el.style));
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
    ...el.children.flatMap((c) => emitVueElement(c, indent + 1)),
    `${pad}</${el.tag}>`,
  ];
};

/** ComponentNode 木 → Vue 3 SFC(<script setup> + <template>)。
 *  importBase は UI 部品(Metric 等)の import 元ディレクトリ(既定 './realtime')。 */
export const emitVuePage = (
  root: ComponentNode,
  componentName: string,
  importBase = './realtime',
  screenStyle?: string,
): string => {
  const tree = toUiTree(root);
  const components = [...collectComponents(tree)].sort();
  const imports = components.map((c) => `import ${c} from '${importBase}/${c}.vue';`).join('\n');
  const template = screenStyle
    ? [
        `  <div class="page-screen" style="${screenStyle}">`,
        ...emitVueElement(tree, 2),
        '  </div>',
      ].join('\n')
    : emitVueElement(tree, 1).join('\n');

  return `<!-- 自動生成 — AppForge: Vue 3 SFC(framework generator PoC / ${componentName}) -->
<script setup lang="ts">
${imports || '// (UI 部品の参照なし)'}
</script>

<template>
${template}
</template>
`;
};
