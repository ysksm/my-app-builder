import type { DesignTokens } from '@/domain/design-tokens';

/**
 * デザイントークン → MUI createTheme のオプション(プレーンデータ、FR-GUI-11)。
 * 生成側は JSON 化して `createTheme(...)` に渡し、ビルダーは直接 createTheme に渡す。
 * これにより MUI 部品がプロジェクトのカラーパレットで描画される(編集画面・生成物の両方)。
 */
const px = (v: string | undefined, fallback: number): number => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
};

/** 背景色の知覚輝度が低ければダークテーマと判定する */
const isDarkSurface = (hex: string): boolean => {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.padEnd(6, '0').slice(0, 6);
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
};

export const muiThemeOptions = (tokens: DesignTokens): Record<string, unknown> => {
  const c = (key: string, fb: string): string => tokens.color[key]?.$value ?? fb;
  return {
    palette: {
      mode: isDarkSurface(c('surface', '#f5f6fa')) ? 'dark' : 'light',
      primary: { main: c('primary', '#4263eb') },
      secondary: { main: c('header-bg', '#273057') },
      error: { main: c('danger', '#e03131') },
      background: { default: c('surface', '#f5f6fa'), paper: c('surface-card', '#ffffff') },
      text: { primary: c('text', '#1d2230'), secondary: c('text-muted', '#5b6480') },
    },
    typography: { fontFamily: tokens.font.base?.$value ?? 'system-ui, sans-serif' },
    shape: { borderRadius: px(tokens.radius.md?.$value, 8) },
  };
};

/** 生成物の src/app/mui-theme.ts の中身 */
export const muiThemeFile = (tokens: DesignTokens): string =>
  `// 自動生成 — AppForge: デザイントークン連携の MUI テーマ
import { createTheme } from '@mui/material/styles';

export const muiTheme = createTheme(${JSON.stringify(muiThemeOptions(tokens), null, 2)});
`;
