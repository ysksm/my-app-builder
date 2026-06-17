import { describe, expect, it } from 'vitest';
import { hasExpr, parseExpr, referencedQueries } from './expr';

describe('{{ }} 式パーサ (FR-DATA-02)', () => {
  it('hasExpr', () => {
    expect(hasExpr('件数 {{ queries.q.data }}')).toBe(true);
    expect(hasExpr('ただのテキスト')).toBe(false);
    expect(hasExpr('{{}}')).toBe(false);
  });

  it('parseExpr はテキストと式に分解する', () => {
    expect(parseExpr('CPU: {{ queries.cpu.data }}%')).toEqual([
      { type: 'text', value: 'CPU: ' },
      { type: 'expr', path: 'queries.cpu.data' },
      { type: 'text', value: '%' },
    ]);
  });

  it('ドットパス以外の {{ }}(空/演算子/関数呼び出し)はリテラル扱い(契約の強制)', () => {
    expect(hasExpr('{{ }}')).toBe(false);
    expect(hasExpr('{{ a + b }}')).toBe(false);
    expect(hasExpr('{{ foo() }}')).toBe(false);
    expect(hasExpr('{{ a ? b : c }}')).toBe(false);
    // 無効式はそのまま表示(リテラルに結合)
    expect(parseExpr('x {{ a+b }} y')).toEqual([{ type: 'text', value: 'x {{ a+b }} y' }]);
    // 有効なドットパスは式
    expect(hasExpr('{{ queries.a.data }}')).toBe(true);
    expect(hasExpr('{{ table1.selectedRow.name }}')).toBe(true);
  });

  it('referencedQueries は queries.<name> を抽出(重複排除)', () => {
    expect(referencedQueries('{{queries.a.data}} {{queries.a.loading}} {{queries.b.error}} {{table1.x}}')).toEqual([
      'a',
      'b',
    ]);
  });
});
