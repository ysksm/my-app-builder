import { describe, expect, it } from 'vitest';
import { ProjectDoc, EditTarget } from '@/domain/project-doc';
import { applyCommand } from '@/application/commands';
import { parseProjectDoc } from '@/domain/schema';
import { generateProject } from './index';

const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error('fixture');
  return r.value;
};
const get = (files: ReadonlyArray<{ path: string; content: string }>, path: string) =>
  files.find((f) => f.path.includes(path));

/** データソース + クエリ + queryRef を張った table の doc */
const queryDoc = () => {
  let doc = ProjectDoc.create();
  const home = doc.pages[0]!;
  const target = EditTarget.page(home.id);
  const ds = unwrap(applyCommand(doc, { kind: 'addDataSource', name: 'API', baseUrl: 'https://api.example.com' }));
  doc = ds.doc;
  const dataSourceId = doc.dataSources[0]!.id;
  const q = unwrap(applyCommand(doc, { kind: 'addQuery', name: 'getUsers', patch: { dataSourceId, method: 'GET', path: '/users' } }));
  doc = q.doc;
  const queryId = doc.queries[0]!.id;
  const ins = unwrap(applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'table' }));
  doc = ins.doc;
  const tableId = doc.pages[0]!.root.children[0]!.id;
  doc = unwrap(applyCommand(doc, { kind: 'updateNodeProps', target, nodeId: tableId, patch: { queryRef: queryId } })).doc;
  return doc;
};

describe('テーブルのクエリ・バインド生成 (data-layer slice1c)', () => {
  it('queryRef を張った table は <QueryTable> を出力し、import される', () => {
    const files = generateProject(queryDoc(), 'x');
    const page = get(files, 'pages/Page0.tsx')!.content;
    expect(page).toContain('<QueryTable query={"getUsers"} />');
    expect(page).toContain('import { QueryTable } from');
  });

  it('クエリ実行ランタイム(queries.tsx)が出力され、URL とメソッドが焼き込まれる', () => {
    const files = generateProject(queryDoc(), 'x');
    const runtime = get(files, 'shared/data/queries.tsx');
    expect(runtime).toBeTruthy();
    expect(runtime!.content).toContain('"getUsers": { url: "https://api.example.com/users", method: "GET" }');
    expect(runtime!.content).toContain('export function QueryTable');
    expect(runtime!.content).toContain('export function useQuery');
  });

  it('クエリ未使用なら queries.tsx は出力しない', () => {
    const files = generateProject(ProjectDoc.create(), 'x');
    expect(get(files, 'shared/data/queries.tsx')).toBeUndefined();
  });

  it('ボタンの runQuery アクションは runQuery(name) を生成する(イベント起動)', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    doc = unwrap(applyCommand(doc, { kind: 'addQuery', name: 'getUsers', patch: { path: '/users' } })).doc;
    const queryId = doc.queries[0]!.id;
    const ins = unwrap(applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'button' }));
    doc = ins.doc;
    const btnId = doc.pages[0]!.root.children[0]!.id;
    doc = unwrap(
      applyCommand(doc, { kind: 'setNodeEvents', target, nodeId: btnId, events: [{ event: 'onClick', action: { kind: 'runQuery', queryId } }] }),
    ).doc;
    const page = get(generateProject(doc, 'x'), 'pages/Page0.tsx')!.content;
    expect(page).toContain('runQuery("getUsers");');
    expect(page).toContain('import { runQuery }');
    const runtime = get(generateProject(doc, 'x'), 'shared/data/queries.tsx')!.content;
    expect(runtime).toContain('export async function runQuery');
    expect(runtime).toContain('useSyncExternalStore');
  });

  it('非GETクエリ + runQuery アクションは body をコンパイルして渡し、登録簿に refetch を焼き込む(slice2c-B)', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    // 一覧クエリ(再取得先)
    doc = unwrap(applyCommand(doc, { kind: 'addQuery', name: 'listUsers', patch: { method: 'GET', path: '/users' } })).doc;
    // 書き込みクエリ(POST + body + refetch)
    doc = unwrap(
      applyCommand(doc, {
        kind: 'addQuery',
        name: 'createUser',
        patch: { method: 'POST', path: '/users', body: '{ "name": "{{input1.value}}" }', refetch: 'listUsers' },
      }),
    ).doc;
    const createId = doc.queries.find((q) => q.name === 'createUser')!.id;
    const ins = unwrap(applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'button' }));
    doc = ins.doc;
    const btnId = doc.pages[0]!.root.children[0]!.id;
    doc = unwrap(
      applyCommand(doc, {
        kind: 'setNodeEvents',
        target,
        nodeId: btnId,
        events: [{ event: 'onClick', action: { kind: 'runQuery', queryId: createId } }],
      }),
    ).doc;

    const files = generateProject(doc, 'x');
    const page = get(files, 'pages/Page0.tsx')!.content;
    // body は {{ }} 式コンパイル済みのテンプレートリテラルとして第2引数に渡る
    // body は lookupJson で JSON 安全に値を埋め込む(引用符・改行をエスケープ)
    expect(page).toContain('runQuery("createUser", `{ "name": "${lookupJson(__scope, "input1.value")}" }`);');
    const rt = get(generateProject(doc, 'x'), 'shared/data/queries.tsx')!.content;
    expect(rt).toContain('export function lookupJson'); // JSON 安全な埋め込み
    expect(rt).toContain('chain.has(name)'); // refetch 循環ガード
    expect(rt).toContain('body === undefined'); // body 無しは Content-Type を付けない
    // 登録簿に refetch が焼き込まれる
    const runtime = get(files, 'shared/data/queries.tsx')!.content;
    expect(runtime).toContain('"createUser": { url: "/users", method: "POST", refetch: "listUsers" }');
    // GET(一覧)は refetch なし
    expect(runtime).toContain('"listUsers": { url: "/users", method: "GET" }');
    // runQuery ランタイムが body / refetch を扱う
    expect(runtime).toContain('export async function runQuery(name: string, body?: string,');
  });

  it('runQuery アクションを含む doc は schema で読み込める(永続化の後方互換)', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    doc = unwrap(applyCommand(doc, { kind: 'addQuery', name: 'getUsers' })).doc;
    const queryId = doc.queries[0]!.id;
    const ins = unwrap(applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'button' }));
    doc = ins.doc;
    const btnId = doc.pages[0]!.root.children[0]!.id;
    doc = unwrap(
      applyCommand(doc, { kind: 'setNodeEvents', target, nodeId: btnId, events: [{ event: 'onClick', action: { kind: 'runQuery', queryId } }] }),
    ).doc;
    // JSON 化 → parseProjectDoc で round-trip(保存ドキュメントの読込)
    const round = parseProjectDoc(JSON.parse(JSON.stringify(doc)));
    expect(round.ok).toBe(true);
  });
});
