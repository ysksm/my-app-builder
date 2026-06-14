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
  disclosure?: (a: { pad: string; titleExpr: string; contentExpr: string }) => KitEmit;
  menu?: (a: { pad: string; labelExpr: string; items: ReadonlyArray<string> }) => KitEmit;
  switch?: (a: { pad: string; labelExpr: string; checked: boolean }) => KitEmit;
  rating?: (a: { pad: string; labelExpr: string; value: number; max: number }) => KitEmit;
  slider?: (a: { pad: string; labelExpr: string; value: number; min: number; max: number }) => KitEmit;
  chip?: (a: { pad: string; labelExpr: string; color: string }) => KitEmit;
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
  switch: ({ pad, labelExpr, checked }) => ({
    imports: [`import FormControlLabel from '@mui/material/FormControlLabel';`, `import Switch from '@mui/material/Switch';`],
    jsx: [`${pad}<FormControlLabel control={<Switch defaultChecked={${checked}} />} label={${labelExpr}} />`],
  }),
  rating: ({ pad, labelExpr, value, max }) => ({
    imports: [`import Rating from '@mui/material/Rating';`],
    jsx: [
      `${pad}<div className="c-rating"><span className="c-rating-label">{${labelExpr}}</span><Rating defaultValue={${value}} max={${max}} /></div>`,
    ],
  }),
  slider: ({ pad, labelExpr, value, min, max }) => ({
    imports: [`import Slider from '@mui/material/Slider';`],
    jsx: [
      `${pad}<label className="c-slider"><span className="c-slider-label">{${labelExpr}}</span><Slider defaultValue={${value}} min={${min}} max={${max}} /></label>`,
    ],
  }),
  chip: ({ pad, labelExpr, color }) => ({
    imports: [`import Chip from '@mui/material/Chip';`],
    jsx: [`${pad}<Chip label={${labelExpr}} color=${JSON.stringify(color === 'default' ? 'default' : color)} />`],
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
  switch: ({ pad, labelExpr, checked }) => ({
    imports: [`import { Switch } from 'react-aria-components';`],
    jsx: [
      `${pad}<Switch defaultSelected={${checked}} className="c-switch"><span className="c-switch-indicator" />{${labelExpr}}</Switch>`,
    ],
  }),
};

// ---- Headless UI(対話部品。button/input は持たないので未スタイル対話部品のみ提供)----
const s = (v: string): string => JSON.stringify(v);

const HEADLESS: ReactUiKit = {
  id: 'headless',
  deps: { '@headlessui/react': '^2.2.0' },
  disclosure: ({ pad, titleExpr, contentExpr }) => ({
    imports: [`import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react';`],
    jsx: [
      `${pad}<Disclosure as="div" className="c-disclosure">`,
      `${pad}  <DisclosureButton className="c-disclosure-summary">{${titleExpr}}</DisclosureButton>`,
      `${pad}  <DisclosurePanel className="c-disclosure-content">{${contentExpr}}</DisclosurePanel>`,
      `${pad}</Disclosure>`,
    ],
  }),
  menu: ({ pad, labelExpr, items }) => ({
    imports: [`import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';`],
    jsx: [
      `${pad}<Menu as="div" className="c-menu">`,
      `${pad}  <MenuButton className="c-menu-button">{${labelExpr}}</MenuButton>`,
      `${pad}  <MenuItems anchor="bottom start" className="c-menu-list">`,
      ...items.map(
        (i) =>
          `${pad}    <MenuItem><button type="button" className="c-menu-item">{${s(i)}}</button></MenuItem>`,
      ),
      `${pad}  </MenuItems>`,
      `${pad}</Menu>`,
    ],
  }),
};

const REACT_KITS: Readonly<Record<string, ReactUiKit>> = {
  plain: PLAIN,
  mui: MUI,
  'react-aria': REACT_ARIA,
  headless: HEADLESS,
};

/** kit id → アダプタ(未知/未指定は plain) */
export const resolveReactKit = (id: string | undefined): ReactUiKit => REACT_KITS[id ?? 'plain'] ?? PLAIN;
