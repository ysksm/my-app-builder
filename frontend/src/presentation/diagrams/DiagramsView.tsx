import { useEffect, useMemo, useRef, useState } from 'react';
import { exportDiagram, type DiagramKind } from '@/application/diagram-export';
import { useAppSelector } from '../store/hooks';

/**
 * 設計図エクスポート(FR-VIEW-06)のビュー。中立ドキュメントから導出した
 * 画面遷移図 / シーケンス図(Mermaid)/ レイヤー×機能トレーサビリティ(Markdown)を
 * テキスト(ソース)とプレビュー(描画)で切り替え表示・コピーできる。
 */

const TABS: ReadonlyArray<{ kind: DiagramKind; label: string; format: 'Mermaid' | 'Markdown' }> = [
  { kind: 'screen-flow', label: '画面遷移図', format: 'Mermaid' },
  { kind: 'sequence', label: 'シーケンス図', format: 'Mermaid' },
  { kind: 'traceability', label: 'レイヤー×機能', format: 'Markdown' },
];

type ViewMode = 'preview' | 'text';

export function DiagramsView() {
  const doc = useAppSelector((s) => s.editor.doc);
  const [kind, setKind] = useState<DiagramKind>('screen-flow');
  const [mode, setMode] = useState<ViewMode>('preview');
  const [copied, setCopied] = useState(false);

  const tab = TABS.find((t) => t.kind === kind)!;
  const content = useMemo(() => exportDiagram(doc, kind), [doc, kind]);

  const copy = () => {
    void navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="diagrams-root">
      <div className="diagrams-toolbar">
        <div className="diagrams-tabs">
          {TABS.map((t) => (
            <button
              key={t.kind}
              type="button"
              className={t.kind === kind ? 'on' : ''}
              onClick={() => setKind(t.kind)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="diagrams-modes">
          <button type="button" className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}>
            プレビュー
          </button>
          <button type="button" className={mode === 'text' ? 'on' : ''} onClick={() => setMode('text')}>
            テキスト
          </button>
        </div>
        <span className="diagrams-format muted">{tab.format} 形式</span>
        <button type="button" className="btn" onClick={copy}>
          {copied ? 'コピーしました' : '📋 コピー'}
        </button>
      </div>
      <p className="diagrams-hint muted">
        中立ドキュメントから自動生成。
        {mode === 'text'
          ? tab.format === 'Mermaid'
            ? ' Mermaid 対応エディタ(GitHub / mermaid.live 等)に貼り付けて図にできます。'
            : ' Markdown としてドキュメントに貼り付けられます。'
          : ' この画面でそのまま図として確認できます。「テキスト」でソースに切り替えられます。'}
      </p>
      {mode === 'text' ? (
        <pre className="diagrams-output">{content}</pre>
      ) : (
        <div className="diagrams-preview">
          {tab.format === 'Mermaid' ? (
            <MermaidView code={content} />
          ) : (
            <MarkdownTable source={content} />
          )}
        </div>
      )}
    </div>
  );
}

let mermaidSeq = 0;

/** Mermaid ソースを SVG として描画する(mermaid を遅延ロード) */
function MermaidView({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const id = useMemo(() => `appforge-mmd-${mermaidSeq++}`, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
        const { svg } = await mermaid.render(id, code);
        if (cancelled) return;
        if (ref.current) ref.current.innerHTML = svg;
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (error) {
    return (
      <div className="diagrams-error">
        図の描画に失敗しました。「テキスト」でソースを確認できます。
        <pre>{error}</pre>
      </div>
    );
  }
  return (
    <>
      {loading && <span className="muted diagrams-loading">図を描画中…</span>}
      <div className="diagrams-mermaid" ref={ref} />
    </>
  );
}

/** Markdown のパイプテーブルを HTML テーブルとして描画する */
function MarkdownTable({ source }: { source: string }) {
  const rows = source
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes('|'))
    .map((l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  const isSeparator = (cells: ReadonlyArray<string>) => cells.every((c) => /^:?-+:?$/.test(c));
  const dataRows = rows.filter((r) => !isSeparator(r));

  if (dataRows.length === 0) {
    return <p className="muted diagrams-empty">{source}</p>;
  }
  const [head, ...body] = dataRows;
  return (
    <table className="diagrams-table">
      <thead>
        <tr>{head!.map((c, i) => <th key={i}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {body.map((r, ri) => (
          <tr key={ri}>{r.map((c, ci) => <td key={ci}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
