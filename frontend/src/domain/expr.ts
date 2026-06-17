/**
 * `{{ ... }}` 式バインド(FR-DATA-02)。安全性とコード生成の相性のため、任意 JS ではなく
 * **ドットパス式**に限定する(例: `{{ queries.getUsers.data }}` / `{{ table1.selectedRow.name }}`)。
 * 生成時に lookup(scope, path) へコンパイルし、ランタイムで安全にパス解決する。
 */
export type ExprSegment = Readonly<{ type: 'text'; value: string } | { type: 'expr'; path: string }>;

const TOKEN = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** 文字列に式が含まれるか */
export const hasExpr = (s: string): boolean => /\{\{\s*[^{}]+?\s*\}\}/.test(s);

/** 文字列をリテラル断片と式断片に分解する */
export const parseExpr = (s: string): ExprSegment[] => {
  const out: ExprSegment[] = [];
  let last = 0;
  for (const m of s.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ type: 'text', value: s.slice(last, idx) });
    out.push({ type: 'expr', path: m[1]!.trim() });
    last = idx + m[0].length;
  }
  if (last < s.length) out.push({ type: 'text', value: s.slice(last) });
  return out;
};

/** 式が参照するクエリ名(queries.<name>...)を集める */
export const referencedQueries = (s: string): string[] => {
  const names = new Set<string>();
  for (const seg of parseExpr(s)) {
    if (seg.type === 'expr') {
      const m = seg.path.match(/^queries\.([A-Za-z0-9_]+)/);
      if (m) names.add(m[1]!);
    }
  }
  return [...names];
};
