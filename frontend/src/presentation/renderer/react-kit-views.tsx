import type { ReactNode } from 'react';
import MuiButton from '@mui/material/Button';
import MuiTextField from '@mui/material/TextField';
import MuiSwitch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Rating from '@mui/material/Rating';
import Slider from '@mui/material/Slider';
import Chip from '@mui/material/Chip';
import MuiAccordion from '@mui/material/Accordion';
import MuiAccordionSummary from '@mui/material/AccordionSummary';
import MuiAccordionDetails from '@mui/material/AccordionDetails';
import {
  Button as RAButton,
  Disclosure as RADisclosure,
  DisclosurePanel as RADisclosurePanel,
  Heading as RAHeading,
  Input as RAInput,
  Label as RALabel,
  Menu as RAMenu,
  MenuItem as RAMenuItem,
  MenuTrigger as RAMenuTrigger,
  Popover as RAPopover,
  Switch as RASwitch,
  TextField as RATextField,
} from 'react-aria-components';
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
  if (kit === 'mui') {
    return (
      <MuiAccordion>
        <MuiAccordionSummary>{p.title}</MuiAccordionSummary>
        <MuiAccordionDetails>{p.content}</MuiAccordionDetails>
      </MuiAccordion>
    );
  }
  if (kit === 'react-aria') {
    return (
      <RADisclosure className="c-disclosure">
        <RAHeading>
          <RAButton slot="trigger" className="c-disclosure-summary">
            {p.title}
          </RAButton>
        </RAHeading>
        <RADisclosurePanel className="c-disclosure-content">{p.content}</RADisclosurePanel>
      </RADisclosure>
    );
  }
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

export const kitSwitch = (kit: string, p: { label: string; checked: boolean }): ReactNode | null => {
  if (kit === 'mui') {
    return <FormControlLabel control={<MuiSwitch defaultChecked={p.checked} />} label={p.label} />;
  }
  if (kit === 'react-aria') {
    return (
      <RASwitch defaultSelected={p.checked} className="c-switch">
        <span className="c-switch-indicator" />
        {p.label}
      </RASwitch>
    );
  }
  return null;
};

export const kitRating = (kit: string, p: { label: string; value: number; max: number }): ReactNode | null => {
  if (kit === 'mui') {
    return (
      <div className="c-rating">
        <span className="c-rating-label">{p.label}</span>
        <Rating defaultValue={p.value} max={p.max} />
      </div>
    );
  }
  return null;
};

export const kitSlider = (
  kit: string,
  p: { label: string; value: number; min: number; max: number },
): ReactNode | null => {
  if (kit === 'mui') {
    return (
      <label className="c-slider">
        <span className="c-slider-label">{p.label}</span>
        <Slider defaultValue={p.value} min={p.min} max={p.max} />
      </label>
    );
  }
  return null;
};

export const kitChip = (kit: string, p: { label: string; color: string }): ReactNode | null => {
  if (kit === 'mui') {
    return <Chip label={p.label} color={(p.color === 'default' ? 'default' : p.color) as 'primary' | 'secondary' | 'default'} />;
  }
  return null;
};

export const kitMenu = (kit: string, p: { label: string; items: ReadonlyArray<string> }): ReactNode | null => {
  if (kit === 'react-aria') {
    return (
      <RAMenuTrigger>
        <RAButton className="c-menu-button">{p.label}</RAButton>
        <RAPopover className="c-menu-list">
          <RAMenu>
            {p.items.map((i, idx) => (
              <RAMenuItem key={idx} className="c-menu-item">
                {i}
              </RAMenuItem>
            ))}
          </RAMenu>
        </RAPopover>
      </RAMenuTrigger>
    );
  }
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
