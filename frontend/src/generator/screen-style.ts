import { Page, type ScreenSize } from '@/domain/page';

/**
 * 画面サイズ(ScreenSize)→ 生成物の page-screen ラッパーに付ける inline style。
 * box プロパティ(幅/高さの固定・最小・最大)に加え、高さがコンテンツ追従なら
 * flex で縦に伸ばす(固定/最大は伸ばさない)。ビルダーの page-frame は Page.screenBox を直接使う。
 */
const styleEntries = (screen: ScreenSize): ReadonlyArray<[string, string]> => [
  ...Object.entries(Page.screenBox(screen)),
  ['flex', Page.screenFillsHeight(screen) ? '1 1 auto' : '0 0 auto'],
];

const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** React/Remix 用: `style={{ <ここ> }}` の中身(camelCase) */
export const screenStyleJs = (screen: ScreenSize): string =>
  styleEntries(screen)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(', ');

/** Vue/Svelte 用: `style="<ここ>"` の中身(kebab-case) */
export const screenStyleCss = (screen: ScreenSize): string =>
  styleEntries(screen)
    .map(([k, v]) => `${kebab(k)}: ${v}`)
    .join('; ');
