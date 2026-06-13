import type { ComponentNode } from '@/domain/component-node';
import type { ProjectDoc } from '@/domain/project-doc';

/**
 * 画面(ページ / ダイアログ)と画面遷移(navigate / openDialog)を抽出する。
 * スクリーンボード(FR-PAGE-06)・画面遷移図・設計図エクスポート(FR-VIEW-06)で共用する。
 */

export type ScreenKind = 'page' | 'dialog';

export type ScreenNode = Readonly<{
  id: string;
  kind: ScreenKind;
  title: string;
  /** ページのパス(ダイアログは null) */
  path: string | null;
}>;

export type FlowEdge = Readonly<{
  from: string;
  to: string;
  action: 'navigate' | 'openDialog';
  /** 発火元の表示ラベル(ボタンのラベル等) */
  trigger: string;
}>;

export type ScreenFlow = Readonly<{
  screens: ReadonlyArray<ScreenNode>;
  edges: ReadonlyArray<FlowEdge>;
}>;

const nodeLabel = (node: ComponentNode): string => {
  const v = node.props['label'] ?? node.props['text'] ?? node.props['title'] ?? node.type;
  return String(v).slice(0, 16);
};

const collectEdgesFrom = (fromId: string, root: ComponentNode, doc: ProjectDoc, out: FlowEdge[]): void => {
  const walk = (node: ComponentNode): void => {
    for (const binding of node.events) {
      if (binding.event !== 'onClick') continue;
      const action = binding.action;
      if (action.kind === 'navigate') {
        if (doc.pages.some((p) => p.id === action.pageId)) {
          out.push({ from: fromId, to: action.pageId, action: 'navigate', trigger: nodeLabel(node) });
        }
      } else if (action.kind === 'openDialog') {
        if (doc.dialogs.some((d) => d.id === action.dialogId)) {
          out.push({ from: fromId, to: action.dialogId, action: 'openDialog', trigger: nodeLabel(node) });
        }
      }
    }
    node.children.forEach(walk);
  };
  walk(root);
};

export const collectScreenFlow = (doc: ProjectDoc): ScreenFlow => {
  const screens: ScreenNode[] = [
    ...doc.pages.map((p) => ({ id: p.id as string, kind: 'page' as const, title: p.name, path: p.path })),
    ...doc.dialogs.map((d) => ({ id: d.id as string, kind: 'dialog' as const, title: d.title, path: null })),
  ];

  const edges: FlowEdge[] = [];
  for (const page of doc.pages) {
    // ページ本体 + そのページで使う共通ヘッダー/フッターの遷移を、当該ページ発として集める
    collectEdgesFrom(page.id, page.root, doc, edges);
    if (page.useHeader && doc.layout.header) collectEdgesFrom(page.id, doc.layout.header, doc, edges);
    if (page.useFooter && doc.layout.footer) collectEdgesFrom(page.id, doc.layout.footer, doc, edges);
  }
  for (const dialog of doc.dialogs) {
    collectEdgesFrom(dialog.id, dialog.root, doc, edges);
  }

  // 同じ from→to→action は重複排除(トリガーは最初のものを残す)
  const seen = new Set<string>();
  const deduped = edges.filter((e) => {
    const key = `${e.from}|${e.to}|${e.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { screens, edges: deduped };
};
