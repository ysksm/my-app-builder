import type { DesignTokens, TokenGroup } from '@/domain/design-tokens';
import { ComponentNode } from '@/domain/component-node';
import { tokenSet } from '../store/editor-slice';
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
  const tokens = useAppSelector((s) => s.editor.doc.tokens);

  return (
    <div className="design-root">
      <div className="design-editor">
        <h2 className="design-h2">デザイントークン</h2>
        <p className="muted design-note">
          編集はキャンバス・プレビュー・生成コードに反映されます(css-variables / tailwind emitter の単一ソース)。
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
