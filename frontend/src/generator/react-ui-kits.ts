/**
 * React の UIライブラリ(kit)アダプタ(FR-GUI-11)。中立コンポーネントを各 kit の部品へ
 * 変換する。kit が対応しない種別は undefined を返し、emit-jsx が plain(c-*)へフォールバックする。
 */
export type KitEmit = Readonly<{ jsx: string[]; imports: ReadonlyArray<string> }>;

export type ReactUiKit = Readonly<{
  id: string;
  /** この kit を使うとき package.json に追加する npm 依存 */
  deps: Readonly<Record<string, string>>;
  button?: (a: { pad: string; labelExpr: string; variant: string; onClick: string }) => KitEmit;
  input?: (a: {
    pad: string;
    labelExpr: string;
    placeholderExpr: string | null;
    inputType: string;
  }) => KitEmit;
}>;

const PLAIN: ReactUiKit = { id: 'plain', deps: {} };

// ---- MUI(Material UI)----
const muiButtonVariant = (variant: string): string => (variant === 'secondary' ? 'outlined' : 'contained');
const muiButtonColor = (variant: string): string => (variant === 'danger' ? 'error' : 'primary');

const MUI: ReactUiKit = {
  id: 'mui',
  deps: {
    '@mui/material': '^6.4.7',
    '@emotion/react': '^11.13.5',
    '@emotion/styled': '^11.13.5',
  },
  button: ({ pad, labelExpr, variant, onClick }) => ({
    imports: [`import Button from '@mui/material/Button';`],
    jsx: [
      `${pad}<Button variant="${muiButtonVariant(variant)}" color="${muiButtonColor(variant)}"${onClick}>{${labelExpr}}</Button>`,
    ],
  }),
  input: ({ pad, labelExpr, placeholderExpr, inputType }) => ({
    imports: [`import TextField from '@mui/material/TextField';`],
    jsx: [
      `${pad}<TextField label={${labelExpr}} type="${inputType}" size="small" variant="outlined"${placeholderExpr ? ` placeholder={${placeholderExpr}}` : ''} />`,
    ],
  }),
};

// ---- React Aria Components(ヘッドレス・アクセシブル。スタイルは c-* トークンを流用)----
const REACT_ARIA: ReactUiKit = {
  id: 'react-aria',
  deps: { 'react-aria-components': '^1.5.0' },
  button: ({ pad, labelExpr, variant, onClick }) => ({
    imports: [`import { Button } from 'react-aria-components';`],
    // React Aria は onClick ではなく onPress。スタイルは既存トークンクラスを流用
    jsx: [
      `${pad}<Button className="c-button v-${variant}"${onClick.replace('onClick=', 'onPress=')}>{${labelExpr}}</Button>`,
    ],
  }),
  input: ({ pad, labelExpr, placeholderExpr, inputType }) => ({
    imports: [`import { Input, Label, TextField } from 'react-aria-components';`],
    jsx: [
      `${pad}<TextField className="c-input">`,
      `${pad}  <Label>{${labelExpr}}</Label>`,
      `${pad}  <Input type="${inputType}"${placeholderExpr ? ` placeholder={${placeholderExpr}}` : ''} />`,
      `${pad}</TextField>`,
    ],
  }),
};

const REACT_KITS: Readonly<Record<string, ReactUiKit>> = {
  plain: PLAIN,
  mui: MUI,
  'react-aria': REACT_ARIA,
};

/** kit id → アダプタ(未知/未指定は plain) */
export const resolveReactKit = (id: string | undefined): ReactUiKit => REACT_KITS[id ?? 'plain'] ?? PLAIN;
