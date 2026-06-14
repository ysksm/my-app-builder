import type { ReactNode } from 'react';
import MuiButton from '@mui/material/Button';
import MuiTextField from '@mui/material/TextField';
import { Button as RAButton, Input as RAInput, Label as RALabel, TextField as RATextField } from 'react-aria-components';
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from '@headlessui/react';

/**
 * ビルダーのキャンバスで「選択中の React UIライブラリ(kit)の実物」を描画する(FR-GUI-11)。
 * 生成側 react-ui-kits.ts と同じ写像を、実コンポーネントで実装する(編集画面の WYSIWYG)。
 * 対応しない (kit, 種別) は null を返し、呼び出し側が plain(c-*)へフォールバックする。
 */

export const kitButton = (kit: string, p: { label: string; variant: string }): ReactNode | null => {
  if (kit === 'mui') {
    return (
      <MuiButton
        variant={p.variant === 'secondary' ? 'outlined' : 'contained'}
        color={p.variant === 'danger' ? 'error' : 'primary'}
      >
        {p.label}
      </MuiButton>
    );
  }
  if (kit === 'react-aria') {
    return <RAButton className={`c-button v-${p.variant}`}>{p.label}</RAButton>;
  }
  return null;
};

export const kitInput = (
  kit: string,
  p: { label: string; placeholder: string; inputType: string },
): ReactNode | null => {
  if (kit === 'mui') {
    return (
      <MuiTextField
        label={p.label}
        type={p.inputType}
        placeholder={p.placeholder || undefined}
        size="small"
        variant="outlined"
      />
    );
  }
  if (kit === 'react-aria') {
    return (
      <RATextField className="c-input">
        <RALabel>{p.label}</RALabel>
        <RAInput type={p.inputType} placeholder={p.placeholder || undefined} />
      </RATextField>
    );
  }
  return null;
};

export const kitDisclosure = (kit: string, p: { title: string; content: string }): ReactNode | null => {
  if (kit === 'headless') {
    return (
      <Disclosure as="div" className="c-disclosure">
        <DisclosureButton className="c-disclosure-summary">{p.title}</DisclosureButton>
        <DisclosurePanel className="c-disclosure-content">{p.content}</DisclosurePanel>
      </Disclosure>
    );
  }
  return null;
};

export const kitMenu = (kit: string, p: { label: string; items: ReadonlyArray<string> }): ReactNode | null => {
  if (kit === 'headless') {
    return (
      <Menu as="div" className="c-menu">
        <MenuButton className="c-menu-button">{p.label}</MenuButton>
        <MenuItems anchor="bottom start" className="c-menu-list">
          {p.items.map((i, idx) => (
            <MenuItem key={idx}>
              <button type="button" className="c-menu-item">
                {i}
              </button>
            </MenuItem>
          ))}
        </MenuItems>
      </Menu>
    );
  }
  return null;
};
