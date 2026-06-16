/** flex コンテナのレイアウト値 → CSS / Tailwind クラスへの相互変換。
 * doc には Tailwind クラス名ではなく構造化トークン(start/center/between…)を保存し、
 * ここで CSS 値(css-variables emitter)か Tailwind クラス(tailwind emitter)へ落とす。 */

const JUSTIFY_CSS: Readonly<Record<string, string>> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
};
const ALIGN_CSS: Readonly<Record<string, string>> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
};

export const justifyCss = (v: string): string => JUSTIFY_CSS[v] ?? 'flex-start';
export const alignCss = (v: string): string => ALIGN_CSS[v] ?? 'stretch';
export const wrapCss = (v: string): string => (v === 'wrap' ? 'wrap' : 'nowrap');

/** Tailwind クラス(slice4 の tailwind emitter 用に先行定義) */
const JUSTIFY_TW: Readonly<Record<string, string>> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
};
const ALIGN_TW: Readonly<Record<string, string>> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
};
export const justifyTw = (v: string): string => JUSTIFY_TW[v] ?? 'justify-start';
export const alignTw = (v: string): string => ALIGN_TW[v] ?? 'items-stretch';
export const wrapTw = (v: string): string => (v === 'wrap' ? 'flex-wrap' : 'flex-nowrap');
export const dirTw = (v: string): string => (v === 'row' ? 'flex-row' : 'flex-col');

/** flex コンテナの Tailwind ユーティリティクラス列(任意 px は arbitrary value で正確に) */
export const flexContainerTw = (opts: {
  direction: string;
  justify: string;
  align: string;
  wrap: string;
  gap: number;
  padding: number;
}): string[] => [
  'flex',
  dirTw(opts.direction),
  justifyTw(opts.justify),
  alignTw(opts.align),
  wrapTw(opts.wrap),
  `gap-[${opts.gap}px]`,
  `p-[${opts.padding}px]`,
];
