import { err, ok, type Result } from '@/shared/result';
import { ComponentNode } from './component-node';
import { DataModel } from './data-model';
import { DesignTokens } from './design-tokens';
import { DialogDef } from './dialog';
import { DomainError } from './errors';
import type { DialogId, PageId } from './ids';
import { Page } from './page';

export type EditTarget =
  | Readonly<{ kind: 'page'; pageId: PageId }>
  | Readonly<{ kind: 'header' }>
  | Readonly<{ kind: 'footer' }>
  | Readonly<{ kind: 'dialog'; dialogId: DialogId }>;

export const EditTarget = {
  page: (pageId: PageId): EditTarget => ({ kind: 'page', pageId }),
  header: { kind: 'header' } as EditTarget,
  footer: { kind: 'footer' } as EditTarget,
  dialog: (dialogId: DialogId): EditTarget => ({ kind: 'dialog', dialogId }),

  equals(a: EditTarget, b: EditTarget): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'page' && b.kind === 'page') return a.pageId === b.pageId;
    if (a.kind === 'dialog' && b.kind === 'dialog') return a.dialogId === b.dialogId;
    return true;
  },
} as const;

export type ProjectDoc = Readonly<{
  schemaVersion: 1;
  pages: ReadonlyArray<Page>;
  layout: Readonly<{
    header: ComponentNode | null;
    footer: ComponentNode | null;
  }>;
  dialogs: ReadonlyArray<DialogDef>;
  tokens: DesignTokens;
  dataModel: DataModel;
}>;

export const ProjectDoc = {
  create(): ProjectDoc {
    return {
      schemaVersion: 1,
      pages: [Page.create('ホーム', '/')],
      layout: {
        header: ComponentNode.create('header', { title: 'My App' }),
        footer: ComponentNode.create('footer', { text: '© 2026 My App' }),
      },
      dialogs: [],
      tokens: DesignTokens.default(),
      dataModel: DataModel.empty(),
    };
  },

  findPage(doc: ProjectDoc, pageId: PageId): Page | null {
    return doc.pages.find((p) => p.id === pageId) ?? null;
  },

  findDialog(doc: ProjectDoc, dialogId: DialogId): DialogDef | null {
    return doc.dialogs.find((d) => d.id === dialogId) ?? null;
  },

  /** 編集対象(ページ / ヘッダー / フッター / ダイアログ)のコンポーネント木を返す */
  getTree(doc: ProjectDoc, target: EditTarget): ComponentNode | null {
    switch (target.kind) {
      case 'page':
        return ProjectDoc.findPage(doc, target.pageId)?.root ?? null;
      case 'header':
        return doc.layout.header;
      case 'footer':
        return doc.layout.footer;
      case 'dialog':
        return ProjectDoc.findDialog(doc, target.dialogId)?.root ?? null;
    }
  },

  setTree(doc: ProjectDoc, target: EditTarget, root: ComponentNode): ProjectDoc {
    switch (target.kind) {
      case 'page':
        return {
          ...doc,
          pages: doc.pages.map((p) => (p.id === target.pageId ? { ...p, root } : p)),
        };
      case 'header':
        return { ...doc, layout: { ...doc.layout, header: root } };
      case 'footer':
        return { ...doc, layout: { ...doc.layout, footer: root } };
      case 'dialog':
        return {
          ...doc,
          dialogs: doc.dialogs.map((d) => (d.id === target.dialogId ? { ...d, root } : d)),
        };
    }
  },

  addPage(doc: ProjectDoc, name: string, path: string): Readonly<{ doc: ProjectDoc; page: Page }> {
    const page = Page.create(name, path);
    return { doc: { ...doc, pages: [...doc.pages, page] }, page };
  },

  removePage(doc: ProjectDoc, pageId: PageId): Result<ProjectDoc, DomainError> {
    if (doc.pages.length <= 1) {
      return err(DomainError.create('INVALID', 'cannot remove the last page'));
    }
    if (!ProjectDoc.findPage(doc, pageId)) return err(DomainError.notFound('page'));
    return ok({ ...doc, pages: doc.pages.filter((p) => p.id !== pageId) });
  },

  updatePage(
    doc: ProjectDoc,
    pageId: PageId,
    patch: Partial<Pick<Page, 'name' | 'path' | 'useHeader' | 'useFooter'>>,
  ): Result<ProjectDoc, DomainError> {
    if (!ProjectDoc.findPage(doc, pageId)) return err(DomainError.notFound('page'));
    const normalized = patch.path !== undefined ? { ...patch, path: Page.normalizePath(patch.path) } : patch;
    return ok({
      ...doc,
      pages: doc.pages.map((p) => (p.id === pageId ? { ...p, ...normalized } : p)),
    });
  },

  addDialog(doc: ProjectDoc, title: string): Readonly<{ doc: ProjectDoc; dialog: DialogDef }> {
    const dialog = DialogDef.create(title);
    return { doc: { ...doc, dialogs: [...doc.dialogs, dialog] }, dialog };
  },

  removeDialog(doc: ProjectDoc, dialogId: DialogId): Result<ProjectDoc, DomainError> {
    if (!ProjectDoc.findDialog(doc, dialogId)) return err(DomainError.notFound('dialog'));
    return ok({ ...doc, dialogs: doc.dialogs.filter((d) => d.id !== dialogId) });
  },

  renameDialog(doc: ProjectDoc, dialogId: DialogId, title: string): Result<ProjectDoc, DomainError> {
    if (!ProjectDoc.findDialog(doc, dialogId)) return err(DomainError.notFound('dialog'));
    return ok({
      ...doc,
      dialogs: doc.dialogs.map((d) => (d.id === dialogId ? { ...d, title } : d)),
    });
  },
} as const;
