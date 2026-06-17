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
  const byName = new Map<string, { url: string; method: string; refetch?: string }>();
  for (const q of doc.queries) {
    const ds = doc.dataSources.find((d) => d.id === q.dataSourceId);
    byName.set(q.name, {
      url: (ds?.baseUrl ?? '') + q.path,
      method: q.method,
      // body は実行時にコンポーネントから渡すので登録簿には入れない。refetch だけ焼き込む
      ...(q.refetch ? { refetch: q.refetch } : {}),
    });
  }
  const entries = [...byName]
    .map(([name, spec]) => {
      const refetch = spec.refetch ? `, refetch: ${JSON.stringify(spec.refetch)}` : '';
      return `  ${JSON.stringify(name)}: { url: ${JSON.stringify(spec.url)}, method: ${JSON.stringify(spec.method)}${refetch} },`;
    })
    .join('\n');

  return `// 自動生成 — AppForge: ライブデータ層(共有クエリストア + 実行 + QueryTable)
import { useEffect, useState, useSyncExternalStore } from 'react';

type QuerySpec = { url: string; method: string; refetch?: string };
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

/** クエリを実行し結果を共有ストアへ反映する(ボタン等から手動実行も可能 / runQuery アクション)。
 * 非GET(書き込み)のときは body(JSON 文字列)を送信し、成功後 spec.refetch があれば一覧を再取得する。 */
export async function runQuery(name: string, body?: string, seen?: Set<string>): Promise<void> {
  const spec = queries[name];
  if (!spec) return;
  // refetch の循環(A→B→A)を遮断するため、1回の連鎖で同じクエリは一度だけ
  const chain = seen ?? new Set<string>();
  if (chain.has(name)) return;
  chain.add(name);
  set(name, { ...pick(store, name), loading: true });
  let ok = false;
  try {
    const init: RequestInit =
      spec.method === 'GET' || body === undefined
        ? { method: spec.method }
        : { method: spec.method, headers: { 'Content-Type': 'application/json' }, body };
    const r = await fetch(spec.url, init);
    const d = await r.json();
    set(name, { data: d, loading: false, error: null });
    ok = true;
  } catch (e) {
    set(name, { data: null, loading: false, error: String(e) });
  }
  // 成功後のみ再取得(refetch の失敗は別クエリの状態に出る。この書き込みの成功は保持)
  if (ok && spec.refetch) runQuery(spec.refetch, undefined, chain);
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
    // 自動取得は GET(読み取り)のみ。非GET(書き込み)はイベント(runQuery)でのみ実行する
    if (!store[name] && queries[name]?.method === 'GET') runQuery(name);
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

/** JSON ボディテンプレートの "..." 内に安全に埋め込む値(引用符・改行をエスケープ。囲みの " は含めない) */
export function lookupJson(scope: unknown, path: string): string {
  const s = lookup(scope, path);
  return JSON.stringify(s).slice(1, -1);
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
