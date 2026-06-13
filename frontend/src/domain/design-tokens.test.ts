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
