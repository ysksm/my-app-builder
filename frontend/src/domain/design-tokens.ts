/**
 * デザイントークン(W3C DTCG 互換のサブセット)。
 * Tailwind 等の特定フレームワークに依存しない中立な単一ソースで、
 * スタイル emitter(css-variables / 将来 tailwind)がここから出力を生成する。
 */
export type TokenType = 'color' | 'dimension' | 'fontFamily';

export type TokenValue = Readonly<{
  $type: TokenType;
  $value: string;
}>;

export type TokenGroup = Readonly<Record<string, TokenValue>>;

export type DesignTokens = Readonly<{
  color: TokenGroup;
  spacing: TokenGroup;
  radius: TokenGroup;
  font: TokenGroup;
}>;

const color = (value: string): TokenValue => ({ $type: 'color', $value: value });
const dim = (value: string): TokenValue => ({ $type: 'dimension', $value: value });

export const DesignTokens = {
  /** 既定テーマ(M4 のトークンエディタまでは固定) */
  default(): DesignTokens {
    return {
      color: {
        primary: color('#4263eb'),
        'primary-text': color('#ffffff'),
        secondary: color('#e3e7f3'),
        'secondary-text': color('#2b3354'),
        danger: color('#e03131'),
        'danger-text': color('#ffffff'),
        surface: color('#f5f6fa'),
        'surface-card': color('#ffffff'),
        text: color('#1d2230'),
        'text-muted': color('#5b6480'),
        border: color('#c6cde4'),
        'header-bg': color('#273057'),
        'header-text': color('#ffffff'),
      },
      spacing: {
        xs: dim('4px'),
        sm: dim('8px'),
        md: dim('16px'),
        lg: dim('24px'),
        xl: dim('32px'),
      },
      radius: {
        sm: dim('4px'),
        md: dim('8px'),
        lg: dim('12px'),
      },
      font: {
        base: {
          $type: 'fontFamily',
          $value: '"Hiragino Sans", "Noto Sans JP", system-ui, sans-serif',
        },
      },
    };
  },

  /** CSS カスタムプロパティ名(css-variables emitter / エディタ内反映で共用) */
  cssVarName(group: keyof DesignTokens, key: string): string {
    return `--${group}-${key}`;
  },

  /** 全トークンを [変数名, 値] のフラットな並びにする */
  entries(tokens: DesignTokens): ReadonlyArray<readonly [string, string]> {
    return (Object.keys(tokens) as Array<keyof DesignTokens>).flatMap((group) =>
      Object.entries(tokens[group]).map(
        ([key, token]) => [DesignTokens.cssVarName(group, key), token.$value] as const,
      ),
    );
  },

  /** 既存トークンの値を更新する(存在しない group/key は無視) */
  setToken(
    tokens: DesignTokens,
    group: keyof DesignTokens,
    key: string,
    value: string,
  ): DesignTokens {
    const current = tokens[group][key];
    if (!current) return tokens;
    return { ...tokens, [group]: { ...tokens[group], [key]: { ...current, $value: value } } };
  },
} as const;
