/**
 * `{{ ... }}` 式バインド(FR-DATA-02)。安全性とコード生成の相性のため、任意 JS ではなく
 * **ドットパス式**に限定する(例: `{{ queries.getUsers.data }}` / `{{ table1.selectedRow.name }}`)。
 * 生成時に lookup(scope, path) へコンパイルし、ランタイムで安全にパス解決する。
 */
export type ExprSegment = Readonly<{ type: 'text'; value: string } | { type: 'expr'; path: string }>;

const TOKEN = /\{\{\s*([^{}]*?)\s*\}\}/g;
/** ドットパスのみ許可(任意 JS は不可)。空・括弧・演算子等は式として扱わない(契約の強制) */
const DOTPATH = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;

/** 文字列に有効なドットパス式が含まれるか */
export const hasExpr = (s: string): boolean => parseExpr(s).some((seg) => seg.type === 'expr');

/** 文字列をリテラル断片とドットパス式断片に分解する。
 * 有効なドットパスでない {{ ... }}(空 / 演算子 / 関数呼び出し等)はリテラルとして扱う。 */
export const parseExpr = (s: string): ExprSegment[] => {
  const out: ExprSegment[] = [];
  let last = 0;
  const push = (seg: ExprSegment) => {
    // 連続するテキストは結合(無効式をリテラルに戻したときに分断しない)
    const prev = out[out.length - 1];
    if (seg.type === 'text' && prev && prev.type === 'text') {
      out[out.length - 1] = { type: 'text', value: prev.value + seg.value };
    } else {
      out.push(seg);
    }
  };
  for (const m of s.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) push({ type: 'text', value: s.slice(last, idx) });
    const path = m[1]!.trim();
    if (DOTPATH.test(path)) push({ type: 'expr', path });
    else push({ type: 'text', value: m[0] }); // 無効式はそのまま表示
    last = idx + m[0].length;
  }
  if (last < s.length) push({ type: 'text', value: s.slice(last) });
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
