import type { ProjectDoc } from '@/domain/project-doc';

/** ライブデータ層を使うか(クエリが1つでもあれば runtime を出力) */
export const usesAnyQuery = (doc: ProjectDoc): boolean => doc.queries.length > 0;

/**
 * クエリ実行ランタイム(shared/data/queries.tsx)。
 * doc.queries × dataSources からクエリ登録簿を焼き込み、useQuery(fetch)と
 * クエリ結果を描画する QueryTable を出力する。table.queryRef はこの QueryTable に解決される。
 */
export const queryRuntimeTsx = (doc: ProjectDoc): string => {
  // 名前重複に備えて Map で一意化(後勝ち)。オブジェクトリテラルの重複キーを防ぐ
  const byName = new Map<string, { url: string; method: string }>();
  for (const q of doc.queries) {
    const ds = doc.dataSources.find((d) => d.id === q.dataSourceId);
    byName.set(q.name, { url: (ds?.baseUrl ?? '') + q.path, method: q.method });
  }
  const entries = [...byName]
    .map(([name, spec]) => `  ${JSON.stringify(name)}: { url: ${JSON.stringify(spec.url)}, method: ${JSON.stringify(spec.method)} },`)
    .join('\n');

  return `// 自動生成 — AppForge: ライブデータ層(共有クエリストア + 実行 + QueryTable)
import { useEffect, useState, useSyncExternalStore } from 'react';

type QuerySpec = { url: string; method: string };
const queries: Record<string, QuerySpec> = {
${entries}
};

type QueryState = { data: unknown; loading: boolean; error: string | null };
let store: Record<string, QueryState> = {};
const listeners = new Set<() => void>();
const pick = (s: Record<string, QueryState>, name: string): QueryState =>
  s[name] ?? { data: null, loading: false, error: null };
const set = (name: string, st: QueryState) => {
  store = { ...store, [name]: st };
  listeners.forEach((l) => l());
};

/** クエリを実行し結果を共有ストアへ反映する(ボタン等から手動実行も可能 / runQuery アクション) */
export async function runQuery(name: string): Promise<void> {
  const spec = queries[name];
  if (!spec) return;
  set(name, { ...pick(store, name), loading: true });
  try {
    const r = await fetch(spec.url, { method: spec.method });
    const d = await r.json();
    set(name, { data: d, loading: false, error: null });
  } catch (e) {
    set(name, { data: null, loading: false, error: String(e) });
  }
}

function useStore(): Record<string, QueryState> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => store,
    () => store,
  );
}

/** クエリ状態を購読する。初回購読時に自動実行(従来の表示バインドの挙動を維持) */
export function useQuery<T = unknown>(name: string): { data: T | null; loading: boolean; error: string | null } {
  const s = useStore();
  useEffect(() => {
    if (!store[name]) runQuery(name);
  }, [name]);
  const st = pick(s, name);
  return { data: st.data as T | null, loading: st.loading, error: st.error };
}

/** {{ }} 式のドットパスを scope から安全に解決して文字列化する(FR-DATA-02) */
export function lookup(scope: unknown, path: string): string {
  const v = path.split('.').reduce<unknown>(
    (o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]),
    scope,
  );
  if (v == null) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

type Row = Record<string, unknown>;

export function QueryTable({ query, onSelectRow }: { query: string; onSelectRow?: (row: Row) => void }) {
  const { data, loading, error } = useQuery<Row[]>(query);
  const [selected, setSelected] = useState<number | null>(null);
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
          <tr
            key={i}
            className={selected === i ? 'c-row-selected' : undefined}
            onClick={onSelectRow ? () => { setSelected(i); onSelectRow(row); } : undefined}
            style={onSelectRow ? { cursor: 'pointer' } : undefined}
          >
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
