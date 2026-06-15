import { describe, expect, it } from 'vitest';
import { ProjectDoc, EditTarget } from '@/domain/project-doc';
import { applyCommand } from '@/application/commands';
import { ComponentNode } from '@/domain/component-node';
import { generateProject } from './index';

const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error('fixture');
  return r.value;
};

const get = (files: ReadonlyArray<{ path: string; content: string }>, path: string) =>
  files.find((f) => f.path.includes(path))?.content ?? '';

/** root > grid container > button(配置 {x:2,y:1,w:4,h:3}) の doc を組む */
const gridDoc = () => {
  let doc: ProjectDoc = ProjectDoc.create();
  const home = doc.pages[0]!;
  const target = EditTarget.page(home.id);
  const insC = applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'container' });
  doc = unwrap(insC).doc;
  const containerId = doc.pages[0]!.root.children[0]!.id;
  doc = unwrap(
    applyCommand(doc, { kind: 'updateNodeProps', target, nodeId: containerId, patch: { layoutMode: 'grid' } }),
  ).doc;
  const insB = applyCommand(doc, { kind: 'insertNode', target, parentId: containerId, index: 0, type: 'button' });
  doc = unwrap(insB).doc;
  const buttonId = unwrap(insB).created!.nodeId!;
  doc = unwrap(
    applyCommand(doc, { kind: 'setNodeLayout', target, nodeId: buttonId, layout: { x: 2, y: 1, w: 4, h: 3 } }),
  ).doc;
  return { doc, target, buttonId };
};

describe('setNodeLayout コマンド', () => {
  it('ノードに layout を設定し、木に反映される', () => {
    const { doc, buttonId } = gridDoc();
    const root = doc.pages[0]!.root;
    const button = ComponentNode.find(root, buttonId)!;
    expect(button.layout).toEqual({ x: 2, y: 1, w: 4, h: 3 });
  });

  it('未知ノードへの setNodeLayout はエラー', () => {
    const { doc, target } = gridDoc();
    const res = applyCommand(doc, {
      kind: 'setNodeLayout',
      target,
      nodeId: ComponentNode.create('text').id,
      layout: { x: 0, y: 0, w: 1, h: 1 },
    });
    expect(res.ok).toBe(false);
  });
});

describe('グリッドレイアウトの生成(React)', () => {
  it('grid コンテナは CSS grid を、子は grid 配置を出力する', () => {
    const { doc } = gridDoc();
    const page = get(generateProject(doc, 'x'), 'pages/Page0.tsx');
    expect(page).toContain("gridTemplateColumns: 'repeat(12, 1fr)'");
    expect(page).toContain("gridAutoRows: '36px'");
    // {x:2,y:1,w:4,h:3} → 1 始まりに変換
    expect(page).toContain("gridColumn: '3 / span 4'");
    expect(page).toContain("gridRow: '2 / span 3'");
  });

  it('flow コンテナ(既定)は従来どおり flex を出力する', () => {
    let doc: ProjectDoc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    doc = unwrap(applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'container' })).doc;
    const page = get(generateProject(doc, 'x'), 'pages/Page0.tsx');
    expect(page).toContain("display: 'flex'");
    expect(page).not.toContain('gridTemplateColumns');
  });
});
