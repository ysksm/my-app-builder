import { describe, expect, it } from 'vitest';
import { ProjectDoc, EditTarget } from '@/domain/project-doc';
import { applyCommand } from '@/application/commands';
import { generateProject } from './index';
import { generateSvelteProject } from './emit-svelte-project';

/** ホームに button + input を置いた doc(任意で React kit を設定) */
const withControls = (kit?: string) => {
  let doc = ProjectDoc.create();
  const home = doc.pages[0]!;
  const target = EditTarget.page(home.id);
  (['button', 'input'] as const).forEach((type, i) => {
    const res = applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: i, type });
    if (!res.ok) throw new Error('insert');
    doc = res.value.doc;
  });
  if (kit) {
    const res = applyCommand(doc, { kind: 'setUiKit', framework: 'react', kit });
    if (!res.ok) throw new Error('setUiKit');
    doc = res.value.doc;
  }
  return doc;
};

const get = (files: ReadonlyArray<{ path: string; content: string }>, path: string) =>
  files.find((f) => f.path.includes(path))?.content ?? '';

describe('UIライブラリ選択(FR-GUI-11)', () => {
  it('既定(plain)は c-* を出力し MUI 依存を入れない', () => {
    const files = generateProject(withControls(), 'x');
    const page = get(files, 'pages/Page0.tsx');
    expect(page).toContain('className="c-button');
    expect(page).toContain('className="c-input"');
    expect(get(files, 'package.json')).not.toContain('@mui/material');
  });

  it('React=MUI を選ぶと Button/TextField + @mui 依存を出力', () => {
    const files = generateProject(withControls('mui'), 'x');
    const page = get(files, 'pages/Page0.tsx');
    expect(page).toContain('<Button ');
    expect(page).toContain('<TextField ');
    expect(page).toContain("from '@mui/material/Button'");
    expect(page).toContain("from '@mui/material/TextField'");
    const pkg = get(files, 'package.json');
    expect(pkg).toContain('@mui/material');
    expect(pkg).toContain('@emotion/react');
  });

  it('React=React Aria を選ぶと react-aria-components の部品 + 依存を出力', () => {
    const files = generateProject(withControls('react-aria'), 'x');
    const page = get(files, 'pages/Page0.tsx');
    expect(page).toContain("import * as RAria from 'react-aria-components'");
    expect(page).toContain('<RAria.Button ');
    expect(page).toContain('<RAria.TextField');
    expect(get(files, 'package.json')).toContain('react-aria-components');
  });

  it('対話部品: plain は <details>、Headless UI は @headlessui/react の部品', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    (['disclosure', 'menu'] as const).forEach((type, i) => {
      const r = applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: i, type });
      if (!r.ok) throw new Error('insert');
      doc = r.value.doc;
    });
    // plain
    const plain = get(generateProject(doc, 'x'), 'pages/Page0.tsx');
    expect(plain).toContain('<details className="c-disclosure">');
    expect(plain).toContain('<details className="c-menu">');
    // Headless UI
    const r = applyCommand(doc, { kind: 'setUiKit', framework: 'react', kit: 'headless' });
    if (!r.ok) throw new Error('setUiKit');
    const files = generateProject(r.value.doc, 'x');
    const page = get(files, 'pages/Page0.tsx');
    expect(page).toContain("from '@headlessui/react'");
    expect(page).toContain('<Disclosure');
    expect(page).toContain('<Menu');
    expect(get(files, 'package.json')).toContain('@headlessui/react');
  });

  it('Headless UI は button/input には非対応 → plain にフォールバック', () => {
    const files = generateProject(withControls('headless'), 'x');
    const page = get(files, 'pages/Page0.tsx');
    expect(page).toContain('className="c-button'); // kit 未対応 → plain
    expect(page).toContain('className="c-input"');
  });

  it('Svelte×Bits UI: plain は <details>、bits はラッパー + bits-ui 依存', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    (['disclosure', 'menu'] as const).forEach((type, i) => {
      const r = applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: i, type });
      if (!r.ok) throw new Error('insert');
      doc = r.value.doc;
    });
    // plain
    const plain = get(generateSvelteProject(doc, 'x'), 'pages/Page0.svelte');
    expect(plain).toContain('<details class="c-disclosure">');
    // bits
    const r = applyCommand(doc, { kind: 'setUiKit', framework: 'svelte', kit: 'bits' });
    if (!r.ok) throw new Error('setUiKit');
    const files = generateSvelteProject(r.value.doc, 'x');
    const page = get(files, 'pages/Page0.svelte');
    expect(page).toContain('<Disclosure');
    expect(page).toContain('<Menu');
    expect(get(files, 'shared/realtime/Disclosure.svelte')).toContain("from 'bits-ui'");
    expect(get(files, 'package.json')).toContain('bits-ui');
  });

  it('switch: plain は c-switch、MUI は FormControlLabel+Switch', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    const r = applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'switch' });
    if (!r.ok) throw new Error('insert');
    doc = r.value.doc;
    expect(get(generateProject(doc, 'x'), 'pages/Page0.tsx')).toContain('className="c-switch"');
    const mr = applyCommand(doc, { kind: 'setUiKit', framework: 'react', kit: 'mui' });
    if (!mr.ok) throw new Error('kit');
    const page = get(generateProject(mr.value.doc, 'x'), 'pages/Page0.tsx');
    expect(page).toContain('<FormControlLabel');
    expect(page).toContain('<Switch ');
  });

  it('MUI 固有部品: rating/slider/chip が MUI 部品 + 依存で出力', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    (['rating', 'slider', 'chip'] as const).forEach((type, i) => {
      const r = applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: i, type });
      if (!r.ok) throw new Error('insert');
      doc = r.value.doc;
    });
    const mr = applyCommand(doc, { kind: 'setUiKit', framework: 'react', kit: 'mui' });
    if (!mr.ok) throw new Error('kit');
    const files = generateProject(mr.value.doc, 'x');
    const page = get(files, 'pages/Page0.tsx');
    expect(page).toContain('<Rating ');
    expect(page).toContain('<Slider ');
    expect(page).toContain('<Chip ');
    expect(get(files, 'package.json')).toContain('@mui/material');
  });

  it('kit 固有部品はパレットで kit 一致時のみ(catalog.kit)', async () => {
    const { componentDefs } = await import('@/domain/catalog/component-defs');
    expect(componentDefs.rating.kit).toBe('mui');
    expect(componentDefs.switch.kit).toBeUndefined(); // switch は中立
  });

  it('tabs: plain は縦並び、Headless UI は TabGroup、React Aria は Tabs', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    const r = applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'tabs' });
    if (!r.ok) throw new Error('insert');
    doc = r.value.doc;
    expect(get(generateProject(doc, 'x'), 'pages/Page0.tsx')).toContain('className="c-tab-section"');
    const setKit = (k: string) => {
      const rr = applyCommand(doc, { kind: 'setUiKit', framework: 'react', kit: k });
      if (!rr.ok) throw new Error('kit');
      return get(generateProject(rr.value.doc, 'x'), 'pages/Page0.tsx');
    };
    expect(setKit('headless')).toContain('<TabGroup>');
    const aria = setKit('react-aria');
    expect(aria).toContain('<RAria.Tabs');
    expect(aria).toContain('<RAria.TabPanel');
  });

  it('MUI 静的固有部品: alert/badge/avatar が MUI 部品で出力', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    (['alert', 'badge', 'avatar'] as const).forEach((type, i) => {
      const r = applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: i, type });
      if (!r.ok) throw new Error('insert');
      doc = r.value.doc;
    });
    // plain
    expect(get(generateProject(doc, 'x'), 'pages/Page0.tsx')).toContain('className="c-alert');
    // MUI
    const mr = applyCommand(doc, { kind: 'setUiKit', framework: 'react', kit: 'mui' });
    if (!mr.ok) throw new Error('kit');
    const page = get(generateProject(mr.value.doc, 'x'), 'pages/Page0.tsx');
    expect(page).toContain('<Alert ');
    expect(page).toContain('<Badge ');
    expect(page).toContain('<Avatar>');
  });

  it('setUiKit は framework→kit を doc に保存', () => {
    const res = applyCommand(ProjectDoc.create(), { kind: 'setUiKit', framework: 'react', kit: 'mui' });
    if (!res.ok) throw new Error('apply');
    expect(res.value.doc.uiKits.react).toBe('mui');
  });

  it('後方互換: uiKits 無しの旧 doc は plain 扱い', () => {
    const files = generateProject(ProjectDoc.create(), 'x');
    expect(get(files, 'package.json')).not.toContain('@mui/material');
  });
});
