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
/* 画面サイズ指定のラッパー(幅/高さの固定・最小・最大は inline style で付与、ここで中央寄せ) */
.page-screen { flex: 1; width: 100%; margin-inline: auto; display: flex; flex-direction: column; }
.page-screen > .c-container { flex: 1; }

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
.c-metric-label { font-size: 12px; color: var(--color-text-muted); display: flex; align-items: center; gap: 6px; }
.c-metric-value { font-size: 30px; font-weight: 700; color: var(--color-primary); line-height: 1.1; }
.c-metric-unit { font-size: 14px; font-weight: 500; color: var(--color-text-muted); margin-left: 4px; }
/* しきい値アラート(FR-RT-04): 警告 / 危険で枠と値の色を変える */
.c-metric.s-warn { border-color: var(--color-warn, #d98e00); box-shadow: 0 0 0 1px var(--color-warn, #d98e00); }
.c-metric.s-warn .c-metric-value { color: var(--color-warn, #d98e00); }
.c-metric.s-crit { border-color: var(--color-danger); box-shadow: 0 0 0 1px var(--color-danger); }
.c-metric.s-crit .c-metric-value { color: var(--color-danger); }

/* ゲージ(横バー)。fill 幅で現在値、しきい値で色が変わる */
.c-gauge {
  display: flex; flex-direction: column; gap: 6px; align-self: stretch;
  min-width: 200px; background: var(--color-surface-card);
  border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 12px 16px;
}
.c-gauge-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.c-gauge-label { font-size: 12px; color: var(--color-text-muted); }
.c-gauge-value { font-size: 18px; font-weight: 700; color: var(--color-primary); }
.c-gauge-track { height: 10px; border-radius: 999px; background: var(--color-surface); overflow: hidden; }
.c-gauge-fill { height: 100%; background: var(--color-primary); border-radius: 999px; transition: width .3s ease; }
.c-gauge.s-warn .c-gauge-fill { background: var(--color-warn, #d98e00); }
.c-gauge.s-warn .c-gauge-value { color: var(--color-warn, #d98e00); }
.c-gauge.s-crit .c-gauge-fill { background: var(--color-danger); }
.c-gauge.s-crit .c-gauge-value { color: var(--color-danger); }

/* ステータスランプ。重大度を色付きの丸で示す(正常=緑 / 警告=黄 / 危険=赤) */
.c-lamp {
  display: inline-flex; align-items: center; gap: 10px; align-self: flex-start;
  background: var(--color-surface-card); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); padding: 10px 16px; min-width: 160px;
}
.c-lamp-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--color-ok, #2f9e44); flex: none; }
.c-lamp-dot.s-warn { background: var(--color-warn, #d98e00); }
.c-lamp-dot.s-crit { background: var(--color-danger); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-danger) 25%, transparent); }
.c-lamp-label { font-size: 13px; color: var(--color-text); }
.c-lamp-value { font-size: 13px; font-weight: 600; color: var(--color-text-muted); margin-left: auto; }

/* スパークラインチャート(時系列)。線色がしきい値で変わる */
.c-chart {
  display: flex; flex-direction: column; gap: 6px; align-self: stretch; min-width: 240px;
  background: var(--color-surface-card); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); padding: 12px 16px;
}
.c-chart-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.c-chart-label { font-size: 12px; color: var(--color-text-muted); }
.c-chart-value { font-size: 18px; font-weight: 700; color: var(--color-primary); }
.c-chart-svg { width: 100%; height: 56px; display: block; }
.c-chart-line { stroke: var(--color-primary); stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }
.c-chart.s-warn .c-chart-line { stroke: var(--color-warn, #d98e00); }
.c-chart.s-warn .c-chart-value { color: var(--color-warn, #d98e00); }
.c-chart.s-crit .c-chart-line { stroke: var(--color-danger); }
.c-chart.s-crit .c-chart-value { color: var(--color-danger); }

/* 外部ライブラリ製コンポーネント(uPlot / ECharts / AG Grid) */
.c-uplot, .c-echart {
  display: flex; flex-direction: column; gap: 6px; align-self: stretch; min-width: 280px;
  background: var(--color-surface-card); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); padding: 12px 16px;
}
.c-uplot-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.c-uplot-label, .c-echart-label { font-size: 12px; color: var(--color-text-muted); }
.c-uplot-value { font-size: 18px; font-weight: 700; color: var(--color-primary); }
.c-uplot-canvas { width: 100%; min-height: 120px; }
.c-echart-canvas { width: 100%; height: 180px; }
.c-aggrid { width: 100%; height: 280px; align-self: stretch; }

/* 対話部品(アコーディオン / ドロップダウン) */
.c-disclosure {
  border: 1px solid var(--color-border); border-radius: var(--radius-md);
  background: var(--color-surface-card); overflow: hidden; align-self: stretch;
}
.c-disclosure-summary {
  cursor: pointer; padding: 10px 14px; font-weight: 600; color: var(--color-text);
  list-style: none; user-select: none;
}
.c-disclosure-content { padding: 12px 14px; color: var(--color-text-muted); border-top: 1px solid var(--color-border); }
.c-menu { position: relative; display: inline-block; align-self: flex-start; }
.c-menu-button {
  cursor: pointer; padding: 8px 14px; border-radius: var(--radius-sm);
  background: var(--color-primary); color: var(--color-primary-text);
  list-style: none; user-select: none; font-weight: 600; border: none;
}
.c-menu-list {
  margin: 4px 0 0; padding: 6px; list-style: none; min-width: 160px;
  background: var(--color-surface-card); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); box-shadow: 0 8px 24px rgba(0,0,0,.12);
}
.c-menu-item {
  display: block; width: 100%; text-align: left; padding: 8px 10px; border: none; background: none;
  border-radius: var(--radius-sm); color: var(--color-text); cursor: pointer; font: inherit;
}
.c-menu-item:hover { background: var(--color-secondary); }

/* トグル / レーティング / スライダー / チップ(plain フォールバック) */
.c-switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.c-switch-input { width: 0; height: 0; opacity: 0; position: absolute; }
.c-switch-track {
  width: 38px; height: 22px; border-radius: 11px; background: var(--color-border);
  position: relative; transition: background .15s; flex: none;
}
.c-switch-track::after {
  content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px;
  border-radius: 50%; background: #fff; transition: transform .15s;
}
.c-switch-input:checked + .c-switch-track { background: var(--color-primary); }
.c-switch-input:checked + .c-switch-track::after { transform: translateX(16px); }
.c-rating { display: inline-flex; align-items: center; gap: 8px; }
.c-rating-label { font-size: 13px; color: var(--color-text-muted); }
.c-rating-stars { color: #f59f00; letter-spacing: 2px; }
.c-slider { display: flex; flex-direction: column; gap: 4px; align-self: stretch; max-width: 280px; }
.c-slider-label { font-size: 13px; color: var(--color-text-muted); }
.c-slider-input { width: 100%; accent-color: var(--color-primary); }
.c-chip {
  display: inline-flex; align-items: center; padding: 4px 12px; border-radius: 999px;
  font-size: 13px; background: var(--color-secondary); color: var(--color-secondary-text); align-self: flex-start;
}
.c-chip-primary { background: var(--color-primary); color: var(--color-primary-text); }

/* タブ */
.c-tabs { align-self: stretch; }
.c-tab-list { display: flex; gap: 4px; border-bottom: 1px solid var(--color-border); }
.c-tab {
  padding: 8px 14px; cursor: pointer; border: none; background: none; color: var(--color-text-muted);
  border-bottom: 2px solid transparent; font: inherit;
}
.c-tab[data-selected], .c-tab[data-headlessui-state~="selected"], .c-tab.is-selected {
  color: var(--color-primary); border-bottom-color: var(--color-primary);
}
.c-tab-panel { padding: 14px 4px; color: var(--color-text); }
.c-tab-section + .c-tab-section { border-top: 1px solid var(--color-border); }
.c-tab-section .c-tab-label { padding: 8px 4px 0; font-weight: 600; color: var(--color-text); }

/* アラート / バッジ / アバター(plain フォールバック) */
.c-alert { padding: 10px 14px; border-radius: var(--radius-md); font-size: 14px; align-self: stretch; border: 1px solid; }
.c-alert-info { background: #e7f5ff; border-color: #74c0fc; color: #1864ab; }
.c-alert-success { background: #ebfbee; border-color: #69db7c; color: #2b8a3e; }
.c-alert-warning { background: #fff9db; border-color: #ffd43b; color: #e67700; }
.c-alert-error { background: #fff5f5; border-color: #ff8787; color: #c92a2a; }
.c-badge-wrap { position: relative; display: inline-flex; align-items: center; padding: 4px 6px; }
.c-badge {
  position: absolute; top: -6px; right: -8px; min-width: 18px; height: 18px; padding: 0 5px;
  border-radius: 9px; font-size: 11px; line-height: 18px; text-align: center;
  background: var(--color-primary); color: var(--color-primary-text);
}
.c-badge-secondary { background: var(--color-secondary); color: var(--color-secondary-text); }
.c-badge-error { background: var(--color-danger); color: var(--color-danger-text, #fff); }
.c-avatar {
  display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px;
  border-radius: 50%; background: var(--color-primary); color: var(--color-primary-text); font-size: 14px; font-weight: 600;
}
.c-combobox-input {
  padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  background: var(--color-surface-card); color: var(--color-text); font: inherit; min-width: 200px;
}
.c-progress { display: flex; flex-direction: column; gap: 4px; align-self: stretch; max-width: 320px; }
.c-progress-label { font-size: 13px; color: var(--color-text-muted); }
.c-progress-track { height: 8px; border-radius: 4px; background: var(--color-secondary); overflow: hidden; }
.c-progress-fill { height: 100%; background: var(--color-primary); transition: width .2s; }

/* 設定値の書き込みコントロール(設定ツール) */
.c-setpoint {
  display: inline-flex; flex-direction: column; gap: 8px; align-self: flex-start;
  background: var(--color-surface-card); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); padding: 14px 18px; min-width: 220px;
}
.c-setpoint-label { font-size: 12px; color: var(--color-text-muted); }
.c-setpoint-row { display: flex; align-items: center; gap: 8px; }
.c-setpoint-input {
  flex: 1; min-width: 0; border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  padding: 8px 10px; font-size: 15px; background: var(--color-surface); color: var(--color-text);
}
.c-setpoint-unit { font-size: 13px; color: var(--color-text-muted); }
.c-setpoint-btn {
  border: none; border-radius: var(--radius-md); padding: 8px 14px; font-size: 13px;
  cursor: pointer; background: var(--color-primary); color: var(--color-primary-text);
}
.c-setpoint-status { font-size: 12px; color: var(--color-text-muted); }

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
