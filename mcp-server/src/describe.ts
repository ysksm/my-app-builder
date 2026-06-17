import type { ComponentNode } from '@/domain/component-node';
import type { ProjectDoc } from '@/domain/project-doc';

/** AI エージェント向けの構造化サマリ(describe_app ツールの本体) */

const countComponents = (node: ComponentNode, counts: Record<string, number>): void => {
  counts[node.type] = (counts[node.type] ?? 0) + 1;
  for (const child of node.children) countComponents(child, counts);
};

type Transition = Readonly<{ trigger: string; actions: ReadonlyArray<string> }>;

const collectTransitions = (doc: ProjectDoc, root: ComponentNode): Transition[] => {
  const result: Transition[] = [];
  const walk = (node: ComponentNode): void => {
    const clicks = node.events.filter((e) => e.event === 'onClick');
    if (clicks.length > 0) {
      const label = String(node.props['label'] ?? node.props['text'] ?? node.type);
      const actions = clicks.map((b) => {
        const action = b.action;
        switch (action.kind) {
          case 'navigate': {
            const page = doc.pages.find((p) => p.id === action.pageId);
            return `navigate → ${page ? page.path : '(削除済みページ)'}`;
          }
          case 'openDialog': {
            const dialog = doc.dialogs.find((d) => d.id === action.dialogId);
            return `openDialog → ${dialog ? dialog.title : '(削除済みダイアログ)'}`;
          }
          case 'closeDialog':
            return 'closeDialog';
          case 'showToast':
            return `showToast「${action.message}」`;
          case 'openUrl':
            return `openUrl → ${action.url}`;
        }
      });
      result.push({ trigger: `${node.type}「${label}」`, actions });
    }
    node.children.forEach(walk);
  };
  walk(root);
  return result;
};

export const describeApp = (name: string, doc: ProjectDoc) => ({
  name,
  pages: doc.pages.map((p) => {
    const componentCounts: Record<string, number> = {};
    countComponents(p.root, componentCounts);
    return {
      name: p.name,
      path: p.path,
      useHeader: p.useHeader,
      useFooter: p.useFooter,
      componentCounts,
      transitions: collectTransitions(doc, p.root),
    };
  }),
  layout: {
    header: doc.layout.header ? collectTransitions(doc, doc.layout.header) : null,
    footer: doc.layout.footer ? 'あり' : null,
  },
  dialogs: doc.dialogs.map((d) => ({
    title: d.title,
    transitions: collectTransitions(doc, d.root),
  })),
  dataModel: {
    models: doc.dataModel.models.map((m) => ({
      name: m.name,
      kind: m.kind,
      fields: m.fields.map(
        (f) =>
          `${f.name}${f.required ? '' : '?'}: ${f.type}` +
          (f.min !== null || f.max !== null ? ` [${f.min ?? ''}..${f.max ?? ''}]` : '') +
          (f.pattern ? ` /${f.pattern}/` : ''),
      ),
    })),
    relations: doc.dataModel.relations.map((r) => {
      const from = doc.dataModel.models.find((m) => m.id === r.from)?.name ?? '?';
      const to = doc.dataModel.models.find((m) => m.id === r.to)?.name ?? '?';
      return `${from}.${r.name}: ${to}${r.kind === 'hasMany' ? '[]' : ''}`;
    }),
  },
});
