import { describe, expect, it } from 'vitest';
import { DESIGN_PRESETS, findDesignPreset } from './design-presets';
import { DesignTokens } from './design-tokens';
import { ProjectDoc } from './project-doc';
import { applyCommand } from '@/application/commands';

describe('DESIGN_PRESETS(デザインシステム・プリセット)', () => {
  it('複数のプリセットがあり、既定(indigo)とダークを含む', () => {
    const ids = DESIGN_PRESETS.map((p) => p.id);
    expect(ids).toContain('indigo');
    expect(ids).toContain('slate-dark');
    expect(DESIGN_PRESETS.length).toBeGreaterThanOrEqual(4);
  });

  it('各プリセットは既定と同じ色キー一式を持つ(余白/角丸/フォントは共通)', () => {
    const defColorKeys = Object.keys(DesignTokens.default().color).sort();
    for (const p of DESIGN_PRESETS) {
      expect(Object.keys(p.tokens.color).sort()).toEqual(defColorKeys);
      expect(p.tokens.spacing).toEqual(DesignTokens.default().spacing);
      expect(p.tokens.font).toEqual(DesignTokens.default().font);
      expect(p.swatch.length).toBeGreaterThan(0);
    }
  });

  it('indigo プリセットは既定トークンと一致する', () => {
    expect(findDesignPreset('indigo')!.tokens).toEqual(DesignTokens.default());
  });

  it('findDesignPreset は未知 id で undefined', () => {
    expect(findDesignPreset('nope')).toBeUndefined();
  });
});

describe('applyPreset コマンド(GUI/MCP 共通経路)', () => {
  it('プリセット適用でトークンが差し替わる', () => {
    const doc = ProjectDoc.create();
    const res = applyCommand(doc, { kind: 'applyPreset', presetId: 'slate-dark' });
    if (!res.ok) throw new Error('apply failed');
    expect(res.value.doc.tokens.color.surface!.$value).toBe('#11161f');
    expect(res.value.doc.tokens).toEqual(findDesignPreset('slate-dark')!.tokens);
  });

  it('未知のプリセット id は notFound エラー', () => {
    const res = applyCommand(ProjectDoc.create(), { kind: 'applyPreset', presetId: 'nope' });
    expect(res.ok).toBe(false);
  });
});
