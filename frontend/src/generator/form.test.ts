import { describe, expect, it } from 'vitest';
import { ProjectDoc, EditTarget } from '@/domain/project-doc';
import { applyCommand } from '@/application/commands';
import { generateProject } from './index';
import { generateSvelteProject } from './emit-svelte-project';

const get = (files: ReadonlyArray<{ path: string; content: string }>, path: string) =>
  files.find((f) => f.path.includes(path))?.content ?? '';

/** ホームにフォーム(中に入力)を置いた doc */
const withForm = () => {
  let doc = ProjectDoc.create();
  const home = doc.pages[0]!;
  const target = EditTarget.page(home.id);
  const f = applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'form' });
  if (!f.ok) throw new Error('form');
  doc = f.value.doc;
  const formNode = doc.pages[0]!.root.children[0]!;
  const i = applyCommand(doc, { kind: 'insertNode', target, parentId: formNode.id, index: 0, type: 'input' });
  if (!i.ok) throw new Error('input');
  return i.value.doc;
};

describe('フォーム部品(FR-GUI)', () => {
  it('React: <form onSubmit> + 子入力 + 自動の送信ボタン + トースト', () => {
    const page = get(generateProject(withForm(), 'x'), 'pages/Page0.tsx');
    expect(page).toContain('<form className="c-form"');
    expect(page).toContain('onSubmit=');
    expect(page).toContain('toastShown(');
    expect(page).toContain('type="submit"');
    expect(page).toContain('c-input'); // 子の入力が中にある
  });

  it('Svelte: <form> + 送信ボタン(中立ツリー経由)', () => {
    const page = get(generateSvelteProject(withForm(), 'x'), 'pages/Page0.svelte');
    expect(page).toContain('<form class="c-form">');
    expect(page).toContain('type="submit"');
  });

  it('必須入力: HTML5 ネイティブ検証(required / MUI required / React Aria isRequired)', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    const ins = applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'input' });
    if (!ins.ok) throw new Error('insert');
    doc = ins.value.doc;
    const inputId = doc.pages[0]!.root.children[0]!.id;
    const up = applyCommand(doc, { kind: 'updateNodeProps', target, nodeId: inputId, patch: { required: true } });
    if (!up.ok) throw new Error('update');
    doc = up.value.doc;
    // plain
    expect(get(generateProject(doc, 'x'), 'pages/Page0.tsx')).toContain('required');
    // MUI
    const mui = applyCommand(doc, { kind: 'setUiKit', framework: 'react', kit: 'mui' });
    if (!mui.ok) throw new Error('kit');
    expect(get(generateProject(mui.value.doc, 'x'), 'pages/Page0.tsx')).toContain('<TextField label={"ラベル"} type="text" size="small" variant="outlined" required');
    // React Aria
    const ra = applyCommand(doc, { kind: 'setUiKit', framework: 'react', kit: 'react-aria' });
    if (!ra.ok) throw new Error('kit');
    expect(get(generateProject(ra.value.doc, 'x'), 'pages/Page0.tsx')).toContain('isRequired');
  });
});
