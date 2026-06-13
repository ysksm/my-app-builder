import { useMemo, useState } from 'react';
import { exportDiagram, type DiagramKind } from '@/application/diagram-export';
import { useAppSelector } from '../store/hooks';

/**
 * 設計図エクスポート(FR-VIEW-06)のビュー。中立ドキュメントから導出した
 * 画面遷移図 / シーケンス図(Mermaid)/ レイヤー×機能トレーサビリティ(Markdown)を表示・コピーできる。
 */

const TABS: ReadonlyArray<{ kind: DiagramKind; label: string; format: string }> = [
  { kind: 'screen-flow', label: '画面遷移図', format: 'Mermaid' },
  { kind: 'sequence', label: 'シーケンス図', format: 'Mermaid' },
  { kind: 'traceability', label: 'レイヤー×機能', format: 'Markdown' },
];

export function DiagramsView() {
  const doc = useAppSelector((s) => s.editor.doc);
  const [kind, setKind] = useState<DiagramKind>('screen-flow');
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
        <span className="diagrams-format muted">{tab.format} 形式</span>
        <button type="button" className="btn" onClick={copy}>
          {copied ? 'コピーしました' : '📋 コピー'}
        </button>
      </div>
      <p className="diagrams-hint muted">
        中立ドキュメントから自動生成。
        {tab.format === 'Mermaid'
          ? ' Mermaid 対応エディタ(GitHub / mermaid.live 等)に貼り付けて図として表示できます。'
          : ' Markdown としてドキュメントに貼り付けられます。'}
      </p>
      <pre className="diagrams-output">{content}</pre>
    </div>
  );
}
