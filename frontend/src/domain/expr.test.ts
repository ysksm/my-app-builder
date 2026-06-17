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

  it('referencedQueries は queries.<name> を抽出(重複排除)', () => {
    expect(referencedQueries('{{queries.a.data}} {{queries.a.loading}} {{queries.b.error}} {{table1.x}}')).toEqual([
      'a',
      'b',
    ]);
  });
});
