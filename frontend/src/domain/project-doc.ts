import { err, ok, type Result } from '@/shared/result';
import { ComponentNode } from './component-node';
import { DataModel } from './data-model';
import { DataChannelDef } from './data-channel';
import { DesignTokens } from './design-tokens';
import { findDesignPreset } from './design-presets';
import { DialogDef } from './dialog';
import { CustomPartId } from './ids';
import { DomainError } from './errors';
import type { ChannelId, DialogId, PageId } from './ids';
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

/** ユーザー定義の複合パーツ(FR-GUI-09)。root はコンポーネント木のテンプレート */
export type CustomPartDef = Readonly<{
  id: CustomPartId;
  name: string;
  root: ComponentNode;
}>;

/** スタイル emitter の選択(FR-DS-05)。中立トークンからどの形式を生成するか */
export type StyleEmitter = 'css-variables' | 'tailwind';

/** 名前付きデザインテーマ(FR-DS-08)。デザイントークン一式のスナップショット */
export type ThemePreset = Readonly<{
  id: string;
  name: string;
  tokens: DesignTokens;
}>;

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
  customParts: ReadonlyArray<CustomPartDef>;
  styleEmitter: StyleEmitter;
  /** データチャネル登録簿(FR-RT-01)。モニタリング部品が参照する */
  channels: ReadonlyArray<DataChannelDef>;
  /** スクリーンボード上の画面カード位置(FR-PAGE-06)。画面 ID → 座標 */
  boardPositions: Readonly<Record<string, Readonly<{ x: number; y: number }>>>;
  /** 名前付きデザインテーマ(FR-DS-08)。保存したトークン一式を切り替えられる */
  themes: ReadonlyArray<ThemePreset>;
  /** フレームワークごとの UIライブラリ選択(FR-GUI-11)。framework id → kit id(既定 plain) */
  uiKits: Readonly<Record<string, string>>;
  /** デザイン対象フレームワーク(FR-GUI-11)。デザイン前に選ぶプロジェクト設定(既定 react) */
  targetFramework: string;
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
      customParts: [],
      styleEmitter: 'css-variables',
      channels: [],
      boardPositions: {},
      themes: [],
      uiKits: {},
      targetFramework: 'react',
    };
  },

  /** フレームワークの UIライブラリ(kit)を設定する */
  setUiKit(doc: ProjectDoc, framework: string, kit: string): ProjectDoc {
    return { ...doc, uiKits: { ...doc.uiKits, [framework]: kit } };
  },

  /** デザイン対象フレームワークを設定する */
  setTargetFramework(doc: ProjectDoc, framework: string): ProjectDoc {
    return { ...doc, targetFramework: framework };
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

  /** 既存ページと衝突しないパスにする(衝突時は -2, -3 … を付与)。except は自分自身の除外用 */
  uniquePath(doc: ProjectDoc, path: string, exceptId?: PageId): string {
    const base = Page.normalizePath(path);
    const taken = (p: string) => doc.pages.some((pg) => pg.id !== exceptId && pg.path === p);
    if (!taken(base)) return base;
    for (let i = 2; ; i += 1) {
      const candidate = base === '/' ? `/page-${i}` : `${base}-${i}`;
      if (!taken(candidate)) return candidate;
    }
  },

  /** すべての UI ツリー(ページ/ダイアログ/共通ヘッダー・フッター)の全ノードに f を適用する */
  mapAllTrees(doc: ProjectDoc, f: (node: ComponentNode) => ComponentNode): ProjectDoc {
    const tree = (n: ComponentNode) => ComponentNode.mapEvery(n, f);
    return {
      ...doc,
      pages: doc.pages.map((p) => ({ ...p, root: tree(p.root) })),
      dialogs: doc.dialogs.map((d) => ({ ...d, root: tree(d.root) })),
      layout: {
        ...doc.layout,
        header: doc.layout.header ? tree(doc.layout.header) : doc.layout.header,
        footer: doc.layout.footer ? tree(doc.layout.footer) : doc.layout.footer,
      },
    };
  },

  addPage(doc: ProjectDoc, name: string, path: string): Readonly<{ doc: ProjectDoc; page: Page }> {
    // パスの重複を自動回避(ルーティング衝突を防ぐ)
    const page = Page.create(name, ProjectDoc.uniquePath(doc, path));
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
    patch: Partial<Pick<Page, 'name' | 'path' | 'useHeader' | 'useFooter' | 'screen'>>,
  ): Result<ProjectDoc, DomainError> {
    if (!ProjectDoc.findPage(doc, pageId)) return err(DomainError.notFound('page'));
    let normalized = patch;
    if (patch.path !== undefined) {
      const path = Page.normalizePath(patch.path);
      // 他ページと同一パスは拒否(ルーティング衝突を防ぐ)
      if (doc.pages.some((p) => p.id !== pageId && p.path === path)) {
        return err(DomainError.create('INVALID', `path already in use: ${path}`));
      }
      normalized = { ...patch, path };
    }
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

  findCustomPart(doc: ProjectDoc, partId: CustomPartId): CustomPartDef | null {
    return doc.customParts.find((p) => p.id === partId) ?? null;
  },

  /** コンポーネント木をテンプレート(独立 ID)としてパーツ登録する */
  addCustomPart(
    doc: ProjectDoc,
    name: string,
    root: ComponentNode,
  ): Readonly<{ doc: ProjectDoc; part: CustomPartDef }> {
    const part: CustomPartDef = {
      id: CustomPartId.create(),
      name: name.trim() || `パーツ${doc.customParts.length + 1}`,
      root: ComponentNode.clone(root),
    };
    return { doc: { ...doc, customParts: [...doc.customParts, part] }, part };
  },

  removeCustomPart(doc: ProjectDoc, partId: CustomPartId): Result<ProjectDoc, DomainError> {
    if (!ProjectDoc.findCustomPart(doc, partId)) return err(DomainError.notFound('custom part'));
    return ok({ ...doc, customParts: doc.customParts.filter((p) => p.id !== partId) });
  },

  renameCustomPart(doc: ProjectDoc, partId: CustomPartId, name: string): Result<ProjectDoc, DomainError> {
    if (!ProjectDoc.findCustomPart(doc, partId)) return err(DomainError.notFound('custom part'));
    return ok({
      ...doc,
      customParts: doc.customParts.map((p) => (p.id === partId ? { ...p, name } : p)),
    });
  },

  findChannel(doc: ProjectDoc, channelId: ChannelId): DataChannelDef | null {
    return doc.channels.find((c) => c.id === channelId) ?? null;
  },

  addChannel(
    doc: ProjectDoc,
    name: string,
    patch: Partial<Omit<DataChannelDef, 'id'>> = {},
  ): Readonly<{ doc: ProjectDoc; channel: DataChannelDef }> {
    const channel = DataChannelDef.create(name, patch);
    return { doc: { ...doc, channels: [...doc.channels, channel] }, channel };
  },

  updateChannel(
    doc: ProjectDoc,
    channelId: ChannelId,
    patch: Partial<Omit<DataChannelDef, 'id'>>,
  ): Result<ProjectDoc, DomainError> {
    if (!ProjectDoc.findChannel(doc, channelId)) return err(DomainError.notFound('channel'));
    return ok({
      ...doc,
      channels: doc.channels.map((c) => (c.id === channelId ? { ...c, ...patch } : c)),
    });
  },

  removeChannel(doc: ProjectDoc, channelId: ChannelId): Result<ProjectDoc, DomainError> {
    if (!ProjectDoc.findChannel(doc, channelId)) return err(DomainError.notFound('channel'));
    return ok({ ...doc, channels: doc.channels.filter((c) => c.id !== channelId) });
  },

  /** スクリーンボードの画面カード位置を保存する(FR-PAGE-06) */
  setBoardPosition(doc: ProjectDoc, screenId: string, x: number, y: number): ProjectDoc {
    return { ...doc, boardPositions: { ...doc.boardPositions, [screenId]: { x, y } } };
  },

  /** 現在のデザイントークンを名前付きテーマとして保存する(FR-DS-08) */
  saveTheme(doc: ProjectDoc, name: string): Readonly<{ doc: ProjectDoc; theme: ThemePreset }> {
    const theme: ThemePreset = {
      id: crypto.randomUUID(),
      name: name.trim() || `テーマ${doc.themes.length + 1}`,
      tokens: doc.tokens,
    };
    return { doc: { ...doc, themes: [...doc.themes, theme] }, theme };
  },

  /** 保存済みテーマを適用する(現在のトークンを差し替える) */
  applyTheme(doc: ProjectDoc, themeId: string): Result<ProjectDoc, DomainError> {
    const theme = doc.themes.find((t) => t.id === themeId);
    if (!theme) return err(DomainError.notFound('theme'));
    return ok({ ...doc, tokens: theme.tokens });
  },

  removeTheme(doc: ProjectDoc, themeId: string): Result<ProjectDoc, DomainError> {
    if (!doc.themes.some((t) => t.id === themeId)) return err(DomainError.notFound('theme'));
    return ok({ ...doc, themes: doc.themes.filter((t) => t.id !== themeId) });
  },

  /** 既定のデザインシステム・プリセット(統一カラーパレット)を適用する */
  applyPreset(doc: ProjectDoc, presetId: string): Result<ProjectDoc, DomainError> {
    const preset = findDesignPreset(presetId);
    if (!preset) return err(DomainError.notFound('preset'));
    return ok({ ...doc, tokens: preset.tokens });
  },
} as const;
