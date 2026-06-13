import { DesignTokens } from '@/domain/design-tokens';
import type { StyleEmitter } from '@/domain/project-doc';

/**
 * トークン CSS の生成。スタイル emitter で出力形式を切り替える(FR-DS-05):
 * - css-variables(既定): `:root { --color-primary: ... }`(依存ゼロ)
 * - tailwind: Tailwind v4 の `@theme`(CSS-first 設定)。同じトークン名が CSS 変数兼
 *   ユーティリティ(bg-primary 等)の元になる。中立トークンを単一ソースに Tailwind と連携。
 */
export const emitTokensCss = (
  tokens: DesignTokens,
  emitter: StyleEmitter = 'css-variables',
): string => {
  const lines = DesignTokens.entries(tokens).map(([name, value]) => `  ${name}: ${value};`);
  if (emitter === 'tailwind') {
    return (
      `/* 自動生成: デザイントークン(tailwind emitter) */\n` +
      `@import "tailwindcss";\n\n` +
      `@theme {\n${lines.join('\n')}\n}\n`
    );
  }
  return `/* 自動生成: デザイントークン(css-variables emitter) */\n:root {\n${lines.join('\n')}\n}\n`;
};

/** パーツ共通スタイル。色・余白等はすべてトークン(CSS 変数)を参照する */
export const emitAppCss = (): string => `/* 自動生成: パーツ共通スタイル */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: var(--font-base);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
}

.app-root { min-height: 100vh; display: flex; flex-direction: column; }
.page-main { flex: 1; display: flex; flex-direction: column; }
.page-main > .c-container { flex: 1; }

.c-heading { line-height: 1.4; }
.c-text { line-height: 1.7; }

.c-button {
  border: none;
  border-radius: var(--radius-md);
  padding: 9px 18px;
  font-size: 14px;
  cursor: pointer;
  align-self: flex-start;
  font-family: inherit;
}
.c-button.v-primary { background: var(--color-primary); color: var(--color-primary-text); }
.c-button.v-secondary { background: var(--color-secondary); color: var(--color-secondary-text); }
.c-button.v-danger { background: var(--color-danger); color: var(--color-danger-text); }

.c-input { display: flex; flex-direction: column; gap: var(--spacing-xs); }
.c-input > span { font-size: 12px; color: var(--color-text-muted); }
.c-input input {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  font-size: 14px;
  background: var(--color-surface-card);
  color: var(--color-text);
  font-family: inherit;
}

.c-image { border-radius: var(--radius-sm); max-width: 100%; }

.c-metric {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
  align-self: flex-start;
  background: var(--color-surface-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 14px 20px;
  min-width: 140px;
}
.c-metric-label { font-size: 12px; color: var(--color-text-muted); }
.c-metric-value { font-size: 30px; font-weight: 700; color: var(--color-primary); line-height: 1.1; }
.c-metric-unit { font-size: 14px; font-weight: 500; color: var(--color-text-muted); margin-left: 4px; }

.c-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
  background: var(--color-surface-card);
}
.c-table th, .c-table td { border: 1px solid var(--color-border); padding: 7px 10px; text-align: left; }
.c-table th { background: var(--color-surface); }

.c-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  background: var(--color-header-bg);
  color: var(--color-header-text);
  padding: 12px 20px;
}
.c-header-title { font-size: 16px; }
.c-header-actions { display: flex; align-items: center; gap: 10px; }
.c-header .c-button { padding: 6px 12px; font-size: 13px; }

.c-footer {
  background: var(--color-header-bg);
  color: var(--color-header-text);
  opacity: .85;
  padding: 12px 20px;
  font-size: 12px;
  text-align: center;
  margin-top: auto;
}

.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(8, 10, 20, .55);
  display: flex; align-items: center; justify-content: center;
  z-index: 10;
}
.modal {
  background: var(--color-surface-card);
  color: var(--color-text);
  border-radius: var(--radius-lg);
  width: min(480px, 90%);
  max-height: 80%;
  overflow: auto;
}
.modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border);
  font-size: 15px;
}
.modal-close { background: none; border: none; cursor: pointer; font-size: 16px; color: var(--color-text-muted); }
.modal-body { padding: 18px; }

.toasts {
  position: fixed; right: 24px; bottom: 24px;
  display: flex; flex-direction: column; gap: var(--spacing-sm);
  z-index: 20;
}
.toast {
  background: var(--color-header-bg);
  color: var(--color-header-text);
  border-left: 3px solid var(--color-primary);
  border-radius: var(--radius-md);
  padding: 11px 18px;
  font-size: 13px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, .35);
}

.form-error { color: var(--color-danger); font-size: 13px; }
.admin-links { list-style: none; display: flex; flex-direction: column; gap: var(--spacing-sm); }
.admin-links a { color: var(--color-primary); font-size: 15px; }
`;
