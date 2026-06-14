import { useState } from 'react';
import type { DesignTokens, TokenGroup } from '@/domain/design-tokens';
import { ComponentNode } from '@/domain/component-node';
import { DESIGN_PRESETS } from '@/domain/design-presets';
import {
  presetApplied,
  styleEmitterSet,
  themeApplied,
  themeRemoved,
  themeSaved,
  tokenSet,
} from '../store/editor-slice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { NodeBody } from '../renderer/NodeRenderer';

/**
 * デザインシステムエディタ(FR-DS-08)。デザイントークン(色・余白・角丸・フォント)を編集し、
 * キャンバス/プレビュー(c-* スタイル)に即時反映する。トークンは生成アプリの単一ソース。
 */

const GROUPS: ReadonlyArray<{ group: keyof DesignTokens; label: string }> = [
  { group: 'color', label: '色' },
  { group: 'spacing', label: '余白 / サイズ' },
  { group: 'radius', label: '角丸' },
  { group: 'font', label: 'フォント' },
];

export function DesignSystemView() {
  const dispatch = useAppDispatch();
  const tokens = useAppSelector((s) => s.editor.doc.tokens);
  const emitter = useAppSelector((s) => s.editor.doc.styleEmitter);

  return (
    <div className="design-root">
      <div className="design-editor">
        <h2 className="design-h2">スタイル emitter</h2>
        <p className="muted design-note">
          中立トークンからどの形式で出力するか。Tailwind 非依存(既定)だが連携も選べます(FR-DS-05)。
        </p>
        <div className="emitter-toggle">
          <button
            type="button"
            className={emitter === 'css-variables' ? 'on' : ''}
            onClick={() => dispatch(styleEmitterSet('css-variables'))}
          >
            CSS 変数(依存ゼロ)
          </button>
          <button
            type="button"
            className={emitter === 'tailwind' ? 'on' : ''}
            onClick={() => dispatch(styleEmitterSet('tailwind'))}
          >
            Tailwind v4(@theme)
          </button>
        </div>

        <PresetsSection />

        <ThemesSection />

        <h2 className="design-h2" style={{ marginTop: 18 }}>
          デザイントークン
        </h2>
        <p className="muted design-note">
          編集はキャンバス・プレビュー・生成コードに反映されます(選択した emitter の単一ソース)。
        </p>
        {GROUPS.map(({ group, label }) => (
          <TokenGroupEditor key={group} group={group} label={label} tokens={tokens[group]} />
        ))}
      </div>
      <div className="design-preview">
        <h2 className="design-h2">プレビュー</h2>
        <DesignPreview />
      </div>
    </div>
  );
}

/** 既定のデザインシステム・プリセット(統一カラーパレット)をワンクリック適用 */
function PresetsSection() {
  const dispatch = useAppDispatch();
  return (
    <section className="presets-section">
      <h2 className="design-h2" style={{ marginTop: 18 }}>
        デザインシステム
      </h2>
      <p className="muted design-note">
        統一されたカラーパレットを用意しています。クリックでトークン一式を切り替えられます(色のみ変更、余白/角丸/フォントは共通)。
      </p>
      <div className="preset-grid">
        {DESIGN_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="preset-card"
            title={`${p.name} を適用`}
            onClick={() => dispatch(presetApplied(p.id))}
          >
            <span className="preset-swatches">
              {p.swatch.map((color, i) => (
                <span key={i} className="preset-swatch" style={{ background: color }} />
              ))}
            </span>
            <span className="preset-name">{p.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** 名前付きテーマの保存 / 適用 / 削除(FR-DS-08) */
function ThemesSection() {
  const dispatch = useAppDispatch();
  const themes = useAppSelector((s) => s.editor.doc.themes);
  const [name, setName] = useState('');

  const save = () => {
    dispatch(themeSaved(name.trim() || `テーマ${themes.length + 1}`));
    setName('');
  };

  return (
    <section className="themes-section">
      <h2 className="design-h2" style={{ marginTop: 18 }}>
        テーマ
      </h2>
      <p className="muted design-note">現在のトークン一式を名前を付けて保存し、ワンクリックで切り替えられます。</p>
      <div className="theme-save">
        <input
          type="text"
          value={name}
          placeholder="テーマ名(例: ダーク)"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
        <button type="button" className="btn" onClick={save}>
          現在の配色を保存
        </button>
      </div>
      {themes.length > 0 && (
        <ul className="theme-list">
          {themes.map((t) => (
            <li key={t.id} className="theme-row">
              <span
                className="theme-swatch"
                style={{ background: t.tokens.color.primary?.$value ?? '#888' }}
              />
              <span className="theme-name">{t.name}</span>
              <button type="button" className="btn small" onClick={() => dispatch(themeApplied(t.id))}>
                適用
              </button>
              <button type="button" className="icon-btn" title="削除" onClick={() => dispatch(themeRemoved(t.id))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TokenGroupEditor({
  group,
  label,
  tokens,
}: {
  group: keyof DesignTokens;
  label: string;
  tokens: TokenGroup;
}) {
  const dispatch = useAppDispatch();
  const entries = Object.entries(tokens);
  return (
    <section className="token-group">
      <h3>{label}</h3>
      {entries.map(([key, token]) => {
        const isColor = token.$type === 'color';
        return (
          <div key={key} className="token-row">
            <label className="token-key">{key}</label>
            {isColor && (
              <input
                type="color"
                className="token-color"
                value={token.$value}
                onChange={(e) => dispatch(tokenSet({ group, key, value: e.target.value }))}
              />
            )}
            <input
              type="text"
              className="token-value"
              defaultValue={token.$value}
              key={token.$value}
              onBlur={(e) => {
                if (e.target.value !== token.$value) {
                  dispatch(tokenSet({ group, key, value: e.target.value }));
                }
              }}
            />
          </div>
        );
      })}
    </section>
  );
}

/** トークンを使うコンポーネント群のサンプル表示(c-* が CSS 変数を参照するので即時反映) */
function DesignPreview() {
  const header = ComponentNode.create('header', { title: 'My App' });
  const heading = ComponentNode.create('heading', { text: '見出しサンプル', level: 2 });
  const text = ComponentNode.create('text', { text: '本文のサンプルテキストです。' });
  const primary = ComponentNode.create('button', { label: 'プライマリ', variant: 'primary' });
  const secondary = ComponentNode.create('button', { label: 'セカンダリ', variant: 'secondary' });
  const danger = ComponentNode.create('button', { label: '警告', variant: 'danger' });
  const input = ComponentNode.create('input', { label: '入力ラベル', placeholder: '入力…' });
  const table = ComponentNode.create('table', { columns: 'ID,名前,状態', rows: 2 });
  const footer = ComponentNode.create('footer', { text: '© 2026 My App' });

  return (
    <div className="design-sample page-frame">
      <NodeBody node={header} mode="preview" />
      <div className="design-sample-body">
        <NodeBody node={heading} mode="preview" />
        <NodeBody node={text} mode="preview" />
        <div className="design-sample-row">
          <NodeBody node={primary} mode="preview" />
          <NodeBody node={secondary} mode="preview" />
          <NodeBody node={danger} mode="preview" />
        </div>
        <NodeBody node={input} mode="preview" />
        <NodeBody node={table} mode="preview" />
      </div>
      <NodeBody node={footer} mode="preview" />
    </div>
  );
}
