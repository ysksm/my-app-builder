import { describe, expect, it } from 'vitest';
import { ProjectDoc, EditTarget } from '@/domain/project-doc';
import { applyCommand } from '@/application/commands';
import { generateProject } from './index';

const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error('fixture');
  return r.value;
};
const pageOf = (files: ReadonlyArray<{ path: string; content: string }>) =>
  files.find((f) => f.path.includes('pages/Page0.tsx'))!.content;

describe('{{ }} 式バインドの生成 (data-layer slice2a)', () => {
  it('text の {{queries.*}} は useQuery + lookup(__scope) にコンパイルされる', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    doc = unwrap(applyCommand(doc, { kind: 'addQuery', name: 'getUsers', patch: { path: '/users' } })).doc;
    const ins = unwrap(applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'text' }));
    doc = ins.doc;
    const textId = doc.pages[0]!.root.children[0]!.id;
    doc = unwrap(
      applyCommand(doc, { kind: 'updateNodeProps', target, nodeId: textId, patch: { text: '件数: {{queries.getUsers.data}}' } }),
    ).doc;

    const page = pageOf(generateProject(doc, 'x'));
    expect(page).toContain('const q_getUsers = useQuery("getUsers");');
    expect(page).toContain('const __scope = { queries: { getUsers: q_getUsers } };');
    expect(page).toContain('lookup(__scope, "queries.getUsers.data")');
    expect(page).toContain('import { lookup, useQuery } from');
    // テンプレートリテラルでリテラル断片も保持
    expect(page).toContain('`件数: ${lookup(__scope, "queries.getUsers.data")}`');
  });

  it('式を含まない text は従来どおり文字列リテラル', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    const ins = unwrap(applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'text' }));
    doc = ins.doc;
    const textId = doc.pages[0]!.root.children[0]!.id;
    doc = unwrap(applyCommand(doc, { kind: 'updateNodeProps', target, nodeId: textId, patch: { text: 'ただのテキスト' } })).doc;
    const page = pageOf(generateProject(doc, 'x'));
    expect(page).toContain('{"ただのテキスト"}');
    expect(page).not.toContain('__scope');
  });
});
