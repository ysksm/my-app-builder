import { describe, expect, it } from 'vitest';
import { ProjectDoc } from '@/domain/project-doc';
import { applyCommand } from './commands';

const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error('fixture');
  return r.value;
};

describe('ライブデータ層: データソース＋クエリ CRUD', () => {
  it('データソースとクエリを追加・更新・削除できる', () => {
    let doc = ProjectDoc.create();
    // データソース追加
    const add = unwrap(applyCommand(doc, { kind: 'addDataSource', name: 'API', baseUrl: 'https://api.example.com' }));
    doc = add.doc;
    const dsId = add.created!.dataSourceId!;
    expect(doc.dataSources).toHaveLength(1);
    expect(doc.dataSources[0]!.baseUrl).toBe('https://api.example.com');

    // クエリ追加(名前は識別子へ正規化)
    const addQ = unwrap(
      applyCommand(doc, { kind: 'addQuery', name: 'get users!', patch: { dataSourceId: dsId, method: 'GET', path: '/users' } }),
    );
    doc = addQ.doc;
    const qId = addQ.created!.queryId!;
    expect(doc.queries[0]!.name).toBe('get_users');
    expect(doc.queries[0]!.dataSourceId).toBe(dsId);

    // クエリ更新
    doc = unwrap(applyCommand(doc, { kind: 'updateQuery', queryId: qId, patch: { path: '/v2/users' } })).doc;
    expect(doc.queries[0]!.path).toBe('/v2/users');

    // データソース削除 → クエリの dataSourceId がクリアされる(死参照防止)
    doc = unwrap(applyCommand(doc, { kind: 'removeDataSource', dataSourceId: dsId })).doc;
    expect(doc.dataSources).toHaveLength(0);
    expect(doc.queries[0]!.dataSourceId).toBe('');

    // クエリ削除
    doc = unwrap(applyCommand(doc, { kind: 'removeQuery', queryId: qId })).doc;
    expect(doc.queries).toHaveLength(0);
  });

  it('schema は dataSources/queries 未保存の旧ドキュメントを既定[]で補完する(後方互換)', async () => {
    const { parseProjectDoc } = await import('@/domain/schema');
    const base = ProjectDoc.create() as Record<string, unknown>;
    delete base.dataSources;
    delete base.queries;
    const res = parseProjectDoc(base);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.dataSources).toEqual([]);
      expect(res.value.queries).toEqual([]);
    }
  });
});
