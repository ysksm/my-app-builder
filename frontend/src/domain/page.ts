import { ComponentNode } from './component-node';
import { PageId } from './ids';

/** 画面サイズの指定方法(軸ごと): 自動 / 固定 / 最小 / 最大 */
export type SizeMode = 'auto' | 'fixed' | 'min' | 'max';
export type SizeConstraint = Readonly<{ mode: SizeMode; value: number }>;
/** 画面(ページ)のサイズ指定。width / height をそれぞれ固定・最小・最大で指定できる */
export type ScreenSize = Readonly<{ width: SizeConstraint; height: SizeConstraint }>;

export type Page = Readonly<{
  id: PageId;
  name: string;
  path: string;
  root: ComponentNode;
  useHeader: boolean;
  useFooter: boolean;
  screen: ScreenSize;
}>;

export const Page = {
  /** 既定の画面サイズ = 最大幅 960 / 最小高さ 540(従来のビルダー表示と一致) */
  defaultScreen: {
    width: { mode: 'max', value: 960 },
    height: { mode: 'min', value: 540 },
  } as ScreenSize,

  create(name: string, path: string): Page {
    return {
      id: PageId.create(),
      name,
      path: Page.normalizePath(path),
      root: ComponentNode.create('container'),
      useHeader: true,
      useFooter: true,
      screen: Page.defaultScreen,
    };
  },

  normalizePath(path: string): string {
    const trimmed = path.trim().replace(/\s+/g, '-');
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  },

  /**
   * 画面サイズ → CSS box プロパティ(camelCase、全6プロパティを明示)。
   * 未使用の軸は 'none'/'0'/'auto' に明示リセットするため、外側 CSS を完全に上書きできる。
   * ビルダーの page-frame inline と、生成物の page-screen ラッパー双方で使う。
   */
  screenBox(screen: ScreenSize): Record<string, string> {
    const { width: w, height: h } = screen;
    return {
      width: w.mode === 'fixed' ? `${w.value}px` : '100%',
      minWidth: w.mode === 'min' ? `${w.value}px` : '0',
      maxWidth: w.mode === 'max' ? `${w.value}px` : 'none',
      height: h.mode === 'fixed' ? `${h.value}px` : 'auto',
      minHeight: h.mode === 'min' ? `${h.value}px` : '0',
      maxHeight: h.mode === 'max' ? `${h.value}px` : 'none',
    };
  },

  /** 高さがコンテンツ追従(自動/最小)なら縦に伸ばしてよい。固定/最大は伸ばさない */
  screenFillsHeight(screen: ScreenSize): boolean {
    return screen.height.mode === 'auto' || screen.height.mode === 'min';
  },
} as const;
