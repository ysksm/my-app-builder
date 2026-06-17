import type { ComponentNode } from '@/domain/component-node';
import type { ProjectDoc } from '@/domain/project-doc';
import { hasExpr, parseExpr } from '@/domain/expr';

/** このノードがコンポーネント間スコープを必要とするか(名前付き=発行、queries 以外の式=参照) */
const nodeUsesScope = (n: ComponentNode): boolean => {
  if (n.name) return true;
  if (n.type === 'text' || n.type === 'heading') {
    const t = String(n.props.text ?? '');
    if (hasExpr(t) && parseExpr(t).some((seg) => seg.type === 'expr' && !/^queries\./.test(seg.path))) {
      return true;
    }
  }
  return n.children.some(nodeUsesScope);
};

export const usesScope = (doc: ProjectDoc): boolean =>
  doc.pages.some((p) => nodeUsesScope(p.root)) ||
  doc.dialogs.some((d) => nodeUsesScope(d.root)) ||
  (doc.layout.header !== null && nodeUsesScope(doc.layout.header)) ||
  (doc.layout.footer !== null && nodeUsesScope(doc.layout.footer));

/**
 * コンポーネント間スコープ(FR-DATA-02)。名前付きコンポーネントが公開変数を setVar で発行し、
 * 他コンポーネントの {{ name.var }} 式が useScope で購読する。React Context を使わず
 * モジュール単一ストア + useSyncExternalStore で反映する(プロバイダ不要)。
 */
export const scopeRuntimeTsx = `// 自動生成 — AppForge: コンポーネント間スコープ(公開変数)
import { useSyncExternalStore } from 'react';

type Scope = Record<string, Record<string, unknown>>;
let scope: Scope = {};
const listeners = new Set<() => void>();

/** 公開変数を発行する(値が同じなら通知しない) */
export function setVar(name: string, key: string, value: unknown): void {
  const cur = scope[name] ?? {};
  if (cur[key] === value) return;
  scope = { ...scope, [name]: { ...cur, [key]: value } };
  listeners.forEach((l) => l());
}

/** 現在のスコープを購読する({{ }} 式の評価に使う) */
export function useScope(): Scope {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => scope,
    () => scope,
  );
}

/** {{ }} 式のドットパスを scope から安全に解決して文字列化する(queries が無いアプリ向けにこちらにも用意) */
export function lookup(scope: unknown, path: string): string {
  const v = path.split('.').reduce<unknown>(
    (o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]),
    scope,
  );
  return v == null ? '' : String(v);
}
`;
