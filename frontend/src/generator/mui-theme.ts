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

export const muiThemeOptions = (tokens: DesignTokens): Record<string, unknown> => {
  const c = (key: string, fb: string): string => tokens.color[key]?.$value ?? fb;
  return {
    palette: {
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
