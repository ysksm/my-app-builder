import type { DialogId, PageId } from '@/domain/ids';
import type { ProjectDoc } from '@/domain/project-doc';

/**
 * ドキュメント上の ID と生成コードの識別子の対応表。
 * 識別子は配列順の連番(Page0, Dialog0…)で安定させ、元の名前はコメントとして残す。
 */
export type NameTable = Readonly<{
  pageComponent: (id: PageId) => string | null;
  pagePath: (id: PageId) => string | null;
  dialogComponent: (id: DialogId) => string | null;
  /** uiSlice 上のダイアログキー(例: 'dialog0') */
  dialogKey: (id: DialogId) => string | null;
}>;

export const buildNameTable = (doc: ProjectDoc): NameTable => {
  const pageComponent = new Map(doc.pages.map((p, i) => [p.id, `Page${i}`] as const));
  const pagePath = new Map(doc.pages.map((p) => [p.id, p.path] as const));
  const dialogComponent = new Map(doc.dialogs.map((d, i) => [d.id, `Dialog${i}`] as const));
  const dialogKey = new Map(doc.dialogs.map((d, i) => [d.id, `dialog${i}`] as const));
  return {
    pageComponent: (id) => pageComponent.get(id) ?? null,
    pagePath: (id) => pagePath.get(id) ?? null,
    dialogComponent: (id) => dialogComponent.get(id) ?? null,
    dialogKey: (id) => dialogKey.get(id) ?? null,
  };
};

/** npm パッケージ名として安全な名前に変換する */
export const toPackageName = (name: string): string => {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii || 'appforge-app';
};
