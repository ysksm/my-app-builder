import { describe, expect, it } from 'vitest';
import { DesignTokens } from './design-tokens';
import { ProjectDoc } from './project-doc';
import { parseProjectDoc } from './schema';

describe('DesignTokens', () => {
  it('CSS 変数名と entries を生成できる', () => {
    const tokens = DesignTokens.default();
    expect(DesignTokens.cssVarName('color', 'primary')).toBe('--color-primary');
    const entries = DesignTokens.entries(tokens);
    expect(entries).toContainEqual(['--color-primary', '#4263eb']);
    expect(entries).toContainEqual(['--spacing-md', '16px']);
  });
});

describe('DesignTokens.setToken', () => {
  it('既存トークンの値を更新する($type は保持)', () => {
    const tokens = DesignTokens.default();
    const next = DesignTokens.setToken(tokens, 'color', 'primary', '#ff0000');
    expect(next.color['primary']!.$value).toBe('#ff0000');
    expect(next.color['primary']!.$type).toBe('color');
    // 元は不変
    expect(tokens.color['primary']!.$value).toBe('#4263eb');
    // entries に反映
    expect(DesignTokens.entries(next)).toContainEqual(['--color-primary', '#ff0000']);
  });

  it('存在しないキーは無視する', () => {
    const tokens = DesignTokens.default();
    expect(DesignTokens.setToken(tokens, 'color', 'nope', '#fff')).toBe(tokens);
  });
});

describe('tokens の後方互換', () => {
  it('tokens を持たない旧ドキュメントはデフォルトテーマで補完される', () => {
    const doc = ProjectDoc.create();
    const legacy = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
    delete legacy['tokens'];

    const parsed = parseProjectDoc(legacy);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.tokens).toEqual(DesignTokens.default());
  });

  it('tokens 込みで roundtrip できる', () => {
    const doc = ProjectDoc.create();
    const parsed = parseProjectDoc(JSON.parse(JSON.stringify(doc)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.tokens).toEqual(doc.tokens);
  });
});
