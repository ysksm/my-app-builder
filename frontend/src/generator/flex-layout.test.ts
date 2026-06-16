import { describe, expect, it } from 'vitest';
import { ProjectDoc, EditTarget } from '@/domain/project-doc';
import { applyCommand } from '@/application/commands';
import { ComponentNode } from '@/domain/component-node';
import { toUiTree } from './ui-model';
import { generateProject } from './index';

const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error('fixture');
  return r.value;
};
const get = (files: ReadonlyArray<{ path: string; content: string }>, path: string) =>
  files.find((f) => f.path.includes(path))?.content ?? '';

/** root > flex コンテナ(row, justify=between, items=center, wrap) の doc */
const flexDoc = () => {
  let doc: ProjectDoc = ProjectDoc.create();
  const home = doc.pages[0]!;
  const target = EditTarget.page(home.id);
  doc = unwrap(applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'container' })).doc;
  const cid = doc.pages[0]!.root.children[0]!.id;
  doc = unwrap(
    applyCommand(doc, {
      kind: 'updateNodeProps',
      target,
      nodeId: cid,
      patch: { direction: 'row', justifyContent: 'between', alignItems: 'center', flexWrap: 'wrap' },
    }),
  ).doc;
  return { doc, cid };
};

describe('flex プロパティの React 生成', () => {
  it('justify/align/wrap が CSS 値で出力される', () => {
    const { doc } = flexDoc();
    const page = get(generateProject(doc, 'x'), 'pages/Page0.tsx');
    expect(page).toContain("flexDirection: 'row'");
    expect(page).toContain("justifyContent: 'space-between'");
    expect(page).toContain("alignItems: 'center'");
    expect(page).toContain("flexWrap: 'wrap'");
  });

  it('既定値は flex-start / stretch / nowrap', () => {
    let doc: ProjectDoc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    doc = unwrap(applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'container' })).doc;
    const page = get(generateProject(doc, 'x'), 'pages/Page0.tsx');
    expect(page).toContain("justifyContent: 'flex-start'");
    expect(page).toContain("alignItems: 'stretch'");
    expect(page).toContain("flexWrap: 'nowrap'");
  });
});

describe('flex プロパティの中立 UI モデル(Vue/Svelte/Angular/Remix 共通)', () => {
  it('toUiTree のコンテナ style に justify/align/wrap が入る', () => {
    const { doc, cid } = flexDoc();
    const container = ComponentNode.find(doc.pages[0]!.root, cid)!;
    const ui = toUiTree(container);
    expect(ui.style).toMatchObject({
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      flexDirection: 'row',
    });
  });
});
