import type { ComponentNode } from '@/domain/component-node';
import { collectComponents, toUiTree, type UiElement } from './ui-model';

/**
 * Angular アダプタ(framework generator、FR-GEN-07)。中立 UI 要素モデル → Angular テンプレート。
 * React/Vue/Svelte に続く実装。表現構造のみ対象(イベント配線は対象外)。
 * component:true(Metric 等の未対応部品)はプレースホルダにフォールバックしてビルドを壊さない。
 */

const escapeText = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Angular の補間 {{ }} と衝突しないよう波括弧をエスケープ
    .replace(/{/g, '&#123;')
    .replace(/}/g, '&#125;');

const escapeAttr = (s: string): string => s.replace(/"/g, '&quot;');

const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

const styleAttr = (style: Readonly<Record<string, string>>): string => {
  const decls = Object.entries(style)
    .map(([k, v]) => `${kebab(k)}: ${v}`)
    .join('; ');
  return `style="${escapeAttr(decls)}"`;
};

const VOID_TAGS = new Set(['img', 'input', 'br', 'hr']);

/** 中立要素 → Angular テンプレート行(インデント付き) */
export const emitAngularElement = (el: UiElement, indent = 0): string[] => {
  const pad = '  '.repeat(indent);

  // 未対応のコンポーネント参照(Metric 等)はプレースホルダにフォールバック
  if (el.component) {
    return [`${pad}<div class="c-ext-unsupported">[${escapeText(el.tag)}]</div>`];
  }

  const head: string[] = [el.tag];
  if (el.classes.length > 0) head.push(`class="${el.classes.join(' ')}"`);
  if (Object.keys(el.style).length > 0) head.push(styleAttr(el.style));
  for (const [name, value] of Object.entries(el.attrs)) {
    if (typeof value === 'boolean') {
      if (value) head.push(name);
    } else {
      head.push(`${name}="${escapeAttr(String(value))}"`);
    }
  }
  const open = head.join(' ');

  if (VOID_TAGS.has(el.tag)) {
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
    ...el.children.flatMap((c) => emitAngularElement(c, indent + 1)),
    `${pad}</${el.tag}>`,
  ];
};

/** ComponentNode 木 → Angular テンプレート文字列(コンポーネントの template に埋める) */
export const emitAngularTemplate = (root: ComponentNode, indent = 0): string =>
  emitAngularElement(toUiTree(root), indent).join('\n');

/** 木の中で使われている UI 部品名(未対応コンポーネント参照の検出など) */
export const angularUsedComponents = (root: ComponentNode): Set<string> =>
  collectComponents(toUiTree(root));
