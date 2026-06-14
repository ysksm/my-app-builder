import { DesignTokens, type TokenValue } from './design-tokens';

/**
 * 既定で用意する「デザインシステム」プリセット(統一カラーパレット)。
 * 余白・角丸・フォントは共通(DesignTokens.default())のまま、色だけを
 * 一貫したパレットに差し替える。ワンクリックで適用でき、トークンを単一ソースに
 * css-variables / tailwind どちらの emitter でも反映される。
 */

export type DesignPreset = Readonly<{
  id: string;
  name: string;
  /** UI のスウォッチや説明に使う代表色 */
  swatch: ReadonlyArray<string>;
  tokens: DesignTokens;
}>;

const c = (value: string): TokenValue => ({ $type: 'color', $value: value });

/** color 群だけ差し替えたデザイントークンを作る(余白/角丸/フォントは共通) */
const palette = (colors: Record<string, string>): DesignTokens => {
  const base = DesignTokens.default();
  const color: Record<string, TokenValue> = {};
  for (const [k, v] of Object.entries(colors)) color[k] = c(v);
  return { ...base, color };
};

const PALETTES: ReadonlyArray<{ id: string; name: string; colors: Record<string, string> }> = [
  {
    id: 'indigo',
    name: 'インディゴ(既定)',
    colors: {
      primary: '#4263eb',
      'primary-text': '#ffffff',
      secondary: '#e3e7f3',
      'secondary-text': '#2b3354',
      danger: '#e03131',
      'danger-text': '#ffffff',
      surface: '#f5f6fa',
      'surface-card': '#ffffff',
      text: '#1d2230',
      'text-muted': '#5b6480',
      border: '#c6cde4',
      'header-bg': '#273057',
      'header-text': '#ffffff',
    },
  },
  {
    id: 'ocean',
    name: 'オーシャン',
    colors: {
      primary: '#0c8599',
      'primary-text': '#ffffff',
      secondary: '#d5f0f5',
      'secondary-text': '#0b525b',
      danger: '#e03131',
      'danger-text': '#ffffff',
      surface: '#f2fafb',
      'surface-card': '#ffffff',
      text: '#0b2933',
      'text-muted': '#4a6b73',
      border: '#b3dde4',
      'header-bg': '#0b525b',
      'header-text': '#ffffff',
    },
  },
  {
    id: 'forest',
    name: 'フォレスト',
    colors: {
      primary: '#2f9e44',
      'primary-text': '#ffffff',
      secondary: '#d3f9d8',
      'secondary-text': '#1b4332',
      danger: '#e03131',
      'danger-text': '#ffffff',
      surface: '#f4fbf4',
      'surface-card': '#ffffff',
      text: '#15311c',
      'text-muted': '#50705a',
      border: '#b2e2bb',
      'header-bg': '#1b4332',
      'header-text': '#ffffff',
    },
  },
  {
    id: 'sunset',
    name: 'サンセット',
    colors: {
      primary: '#e8590c',
      'primary-text': '#ffffff',
      secondary: '#ffe8cc',
      'secondary-text': '#7f3a09',
      danger: '#c92a2a',
      'danger-text': '#ffffff',
      surface: '#fff8f2',
      'surface-card': '#ffffff',
      text: '#3a1d0e',
      'text-muted': '#8a5a3c',
      border: '#ffd8a8',
      'header-bg': '#7f3a09',
      'header-text': '#ffffff',
    },
  },
  {
    id: 'grape',
    name: 'グレープ',
    colors: {
      primary: '#7048e8',
      'primary-text': '#ffffff',
      secondary: '#e5dbff',
      'secondary-text': '#3f2d73',
      danger: '#e03131',
      'danger-text': '#ffffff',
      surface: '#faf8ff',
      'surface-card': '#ffffff',
      text: '#241a3d',
      'text-muted': '#6c5b8f',
      border: '#d0bfff',
      'header-bg': '#3f2d73',
      'header-text': '#ffffff',
    },
  },
  {
    id: 'slate-dark',
    name: 'スレート(ダーク)',
    colors: {
      primary: '#4dabf7',
      'primary-text': '#0b1220',
      secondary: '#2b3340',
      'secondary-text': '#dbe4f0',
      danger: '#ff6b6b',
      'danger-text': '#1a0b0b',
      surface: '#11161f',
      'surface-card': '#1b2430',
      text: '#e6edf6',
      'text-muted': '#9aa7b8',
      border: '#2b3340',
      'header-bg': '#0b1220',
      'header-text': '#e6edf6',
    },
  },
];

/** 既定で選べるデザインシステム・プリセット一覧 */
export const DESIGN_PRESETS: ReadonlyArray<DesignPreset> = PALETTES.map((p) => ({
  id: p.id,
  name: p.name,
  swatch: [p.colors.primary!, p.colors.secondary!, p.colors.surface!, p.colors['header-bg']!],
  tokens: palette(p.colors),
}));

export const findDesignPreset = (id: string): DesignPreset | undefined =>
  DESIGN_PRESETS.find((p) => p.id === id);
