import type { ProjectDoc } from '@/domain/project-doc';

/** ライブデータ層を使うか(クエリが1つでもあれば runtime を出力) */
export const usesAnyQuery = (doc: ProjectDoc): boolean => doc.queries.length > 0;

/**
 * クエリ実行ランタイム(shared/data/queries.tsx)。
 * doc.queries × dataSources からクエリ登録簿を焼き込み、useQuery(fetch)と
 * クエリ結果を描画する QueryTable を出力する。table.queryRef はこの QueryTable に解決される。
 */
export const queryRuntimeTsx = (doc: ProjectDoc): string => {
  const entries = doc.queries
    .map((q) => {
      const ds = doc.dataSources.find((d) => d.id === q.dataSourceId);
      const url = (ds?.baseUrl ?? '') + q.path;
      return `  ${JSON.stringify(q.name)}: { url: ${JSON.stringify(url)}, method: ${JSON.stringify(q.method)} },`;
    })
    .join('\n');

  return `// 自動生成 — AppForge: ライブデータ層(クエリ実行 + QueryTable)
import { useEffect, useState } from 'react';

type QuerySpec = { url: string; method: string };
const queries: Record<string, QuerySpec> = {
${entries}
};

export function useQuery<T = unknown>(name: string) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({
    data: null,
    loading: true,
    error: null,
  });
  useEffect(() => {
    const spec = queries[name];
    if (!spec) {
      setState({ data: null, loading: false, error: 'unknown query: ' + name });
      return;
    }
    let aborted = false;
    setState((s) => ({ ...s, loading: true }));
    fetch(spec.url, { method: spec.method })
      .then((r) => r.json())
      .then((d) => {
        if (!aborted) setState({ data: d as T, loading: false, error: null });
      })
      .catch((e) => {
        if (!aborted) setState({ data: null, loading: false, error: String(e) });
      });
    return () => {
      aborted = true;
    };
  }, [name]);
  return state;
}

type Row = Record<string, unknown>;

export function QueryTable({ query }: { query: string }) {
  const { data, loading, error } = useQuery<Row[]>(query);
  if (loading) return <div className="c-query-state">読み込み中…</div>;
  if (error) return <div className="c-query-state c-query-error">エラー: {error}</div>;
  const rows: Row[] = Array.isArray(data) ? data : [];
  const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
  return (
    <table className="c-table">
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {cols.map((c) => (
              <td key={c}>{String(row[c] ?? '')}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
`;
};
