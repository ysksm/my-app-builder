import { describe, expect, it } from 'vitest';
import { ProjectDoc, EditTarget } from '@/domain/project-doc';
import { applyCommand } from '@/application/commands';
import { generateProject } from './index';

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
    expect(page).toContain("from 'react-aria-components'");
    expect(page).toContain('<Button ');
    expect(page).toContain('<TextField');
    expect(get(files, 'package.json')).toContain('react-aria-components');
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
