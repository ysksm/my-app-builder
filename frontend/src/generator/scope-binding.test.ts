import { describe, expect, it } from 'vitest';
import { ProjectDoc, EditTarget } from '@/domain/project-doc';
import { ComponentNode } from '@/domain/component-node';
import { applyCommand } from '@/application/commands';
import { generateProject } from './index';

const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error('fixture');
  return r.value;
};
const pageOf = (files: ReadonlyArray<{ path: string; content: string }>) =>
  files.find((f) => f.path.includes('pages/Page0.tsx'))!.content;
const has = (files: ReadonlyArray<{ path: string }>, p: string) => files.some((f) => f.path.includes(p));

/** input(name=input1) + text({{input1.value}}) の doc */
const scopeDoc = () => {
  let doc = ProjectDoc.create();
  const home = doc.pages[0]!;
  const target = EditTarget.page(home.id);
  const insI = unwrap(applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'input' }));
  doc = insI.doc;
  const inputId = doc.pages[0]!.root.children[0]!.id;
  doc = unwrap(applyCommand(doc, { kind: 'setNodeName', target, nodeId: inputId, name: 'input 1!' })).doc; // → input_1 へ正規化
  const insT = unwrap(applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 1, type: 'text' }));
  doc = insT.doc;
  const textId = doc.pages[0]!.root.children[1]!.id;
  doc = unwrap(applyCommand(doc, { kind: 'updateNodeProps', target, nodeId: textId, patch: { text: '入力値: {{input_1.value}}' } })).doc;
  return { doc, inputId };
};

describe('コンポーネント間スコープ (data-layer slice2b)', () => {
  it('setNodeName は識別子へ正規化する', () => {
    const { doc, inputId } = scopeDoc();
    expect(ComponentNode.find(doc.pages[0]!.root, inputId)!.name).toBe('input_1');
  });

  it('名前付き入力は controlled + setVar を生成する', () => {
    const page = pageOf(generateProject(scopeDoc().doc, 'x'));
    expect(page).toContain("const [input_1, set_input_1] = useState('');");
    expect(page).toContain('setVar("input_1", \'value\', input_1);');
    expect(page).toContain('value={input_1} onChange={(e) => set_input_1(e.target.value)}');
  });

  it('{{input_1.value}} は useScope + lookup(__scope) にコンパイルされる', () => {
    const page = pageOf(generateProject(scopeDoc().doc, 'x'));
    expect(page).toContain('const __live = useScope();');
    expect(page).toContain('...__live');
    expect(page).toContain('lookup(__scope, "input_1.value")');
  });

  it('scope.tsx ランタイムが出力される', () => {
    const files = generateProject(scopeDoc().doc, 'x');
    expect(has(files, 'shared/data/scope.tsx')).toBe(true);
    const scope = files.find((f) => f.path.includes('shared/data/scope.tsx'))!.content;
    expect(scope).toContain('export function setVar');
    expect(scope).toContain('export function useScope');
    expect(scope).toContain('useSyncExternalStore');
  });

  it('名前も式も無ければ scope.tsx は出力しない', () => {
    expect(has(generateProject(ProjectDoc.create(), 'x'), 'shared/data/scope.tsx')).toBe(false);
  });
});
