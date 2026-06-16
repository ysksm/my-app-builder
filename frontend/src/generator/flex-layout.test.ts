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

/** flex コンテナ + style 付きボタン子の doc */
const sizedChildDoc = () => {
  const { doc: base, cid } = flexDoc();
  let doc = base;
  const target = EditTarget.page(doc.pages[0]!.id);
  const ins = applyCommand(doc, { kind: 'insertNode', target, parentId: cid, index: 0, type: 'button' });
  doc = unwrap(ins).doc;
  const btnId = unwrap(ins).created!.nodeId!;
  doc = unwrap(
    applyCommand(doc, { kind: 'setNodeStyle', target, nodeId: btnId, patch: { width: '200px', flexGrow: 1 } }),
  ).doc;
  return { doc, target, btnId };
};

describe('setNodeStyle コマンド', () => {
  it('style をパッチマージし、空文字のキーは削除される', () => {
    const { doc, target, btnId } = sizedChildDoc();
    let d = doc;
    expect(ComponentNode.find(d.pages[0]!.root, btnId)!.style).toEqual({ width: '200px', flexGrow: 1 });
    d = unwrap(applyCommand(d, { kind: 'setNodeStyle', target, nodeId: btnId, patch: { width: '' } })).doc;
    expect(ComponentNode.find(d.pages[0]!.root, btnId)!.style).toEqual({ flexGrow: 1 });
  });
});

describe('style 付き子の生成(flex アイテムのラップ)', () => {
  it('React: style を持つ子は style 付き div でラップされる', () => {
    const { doc } = sizedChildDoc();
    const page = get(generateProject(doc, 'x'), 'pages/Page0.tsx');
    expect(page).toContain("<div style={{ width: '200px', flexGrow: 1 }}>");
  });

  it('中立モデル: style を持つ子は style 付き div でラップされる', () => {
    const { doc } = sizedChildDoc();
    const container = doc.pages[0]!.root.children[0]!;
    const ui = toUiTree(container);
    const wrapper = ui.children?.[0];
    expect(wrapper?.tag).toBe('div');
    expect(wrapper?.style).toMatchObject({ width: '200px', flexGrow: '1' });
  });
});

const tw = (doc: ProjectDoc): ProjectDoc =>
  unwrap(applyCommand(doc, { kind: 'setStyleEmitter', emitter: 'tailwind' })).doc;

describe('tailwind emitter のレイアウト生成(ユーティリティクラス)', () => {
  it('flex コンテナはユーティリティクラスを出力(inline flex style は出さない)', () => {
    const page = get(generateProject(tw(flexDoc().doc), 'x'), 'pages/Page0.tsx');
    expect(page).toContain('c-container flex flex-row justify-between items-center flex-wrap gap-[12px] p-[16px]');
    expect(page).not.toContain("display: 'flex'");
  });

  it('style を持つ子は w-[..]/grow 等のクラスでラップされる', () => {
    const page = get(generateProject(tw(sizedChildDoc().doc), 'x'), 'pages/Page0.tsx');
    expect(page).toContain('<div className="w-[200px] grow">');
  });
});

describe('任意クラス(エスケープハッチ) className', () => {
  it('setNodeClassName で設定/空文字で解除', () => {
    const { doc, target, btnId } = sizedChildDoc();
    let d = unwrap(applyCommand(doc, { kind: 'setNodeClassName', target, nodeId: btnId, className: 'shadow-lg' })).doc;
    expect(ComponentNode.find(d.pages[0]!.root, btnId)!.className).toBe('shadow-lg');
    d = unwrap(applyCommand(d, { kind: 'setNodeClassName', target, nodeId: btnId, className: '  ' })).doc;
    expect(ComponentNode.find(d.pages[0]!.root, btnId)!.className).toBeUndefined();
  });

  it('css-variables 生成: className がラッパー div に付く', () => {
    const { doc, target, btnId } = sizedChildDoc();
    // style を消して className だけのケースも確認
    const d = unwrap(applyCommand(doc, { kind: 'setNodeClassName', target, nodeId: btnId, className: 'shadow-lg' })).doc;
    const page = get(generateProject(d, 'x'), 'pages/Page0.tsx');
    expect(page).toContain('className="shadow-lg"');
  });

  it('tailwind 生成: サイズクラスと任意クラスが結合される', () => {
    const { doc, target, btnId } = sizedChildDoc();
    const d = tw(unwrap(applyCommand(doc, { kind: 'setNodeClassName', target, nodeId: btnId, className: 'shadow-lg' })).doc);
    const page = get(generateProject(d, 'x'), 'pages/Page0.tsx');
    expect(page).toContain('<div className="w-[200px] grow shadow-lg">');
  });
});
