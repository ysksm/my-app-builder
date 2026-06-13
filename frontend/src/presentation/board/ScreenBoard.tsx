import { useMemo, useRef, useState } from 'react';
import { collectScreenFlow, type ScreenNode } from '@/application/screen-flow';
import { ProjectDoc } from '@/domain/project-doc';
import { NodeBody } from '../renderer/NodeRenderer';
import { useAppSelector } from '../store/hooks';

/**
 * スクリーンボード(FR-PAGE-06): 全画面を Figma 的にミニチュア一覧表示し、
 * 画面遷移(navigate / openDialog)を矢印で接続する。位置はドラッグで調整できる。
 * (位置のプロジェクト保存は次段。現状は自動レイアウト + ローカルドラッグ)
 */

const CARD_W = 280;
const CARD_H = 200;
const GAP_X = 120;
const GAP_Y = 90;
const COLS = 3;
const SCALE = 0.32;

type Pos = Readonly<{ x: number; y: number }>;

const autoLayout = (index: number): Pos => ({
  x: 40 + (index % COLS) * (CARD_W + GAP_X),
  y: 40 + Math.floor(index / COLS) * (CARD_H + GAP_Y),
});

export function ScreenBoard() {
  const doc = useAppSelector((s) => s.editor.doc);
  const flow = useMemo(() => collectScreenFlow(doc), [doc]);
  const [positions, setPositions] = useState<Record<string, Pos>>({});

  const posOf = (id: string, index: number): Pos => positions[id] ?? autoLayout(index);
  const indexOf = new Map(flow.screens.map((s, i) => [s.id, i] as const));

  const anchor = (id: string, side: 'out' | 'in'): Pos => {
    const i = indexOf.get(id) ?? 0;
    const p = posOf(id, i);
    return { x: p.x + (side === 'out' ? CARD_W : 0), y: p.y + CARD_H / 2 };
  };

  return (
    <div className="board-root">
      <div className="board-toolbar">
        <span className="muted">
          {flow.screens.length} 画面 / {flow.edges.length} 遷移 — カードをドラッグで配置できます
        </span>
      </div>
      <div className="board-canvas">
        <svg className="board-svg">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
            </marker>
          </defs>
          {flow.edges.map((e, i) => {
            const a = anchor(e.from, 'out');
            const b = anchor(e.to, 'in');
            const mx = (a.x + b.x) / 2;
            return (
              <g key={i}>
                <path
                  d={`M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`}
                  className={`board-edge ${e.action}`}
                  markerEnd="url(#arrow)"
                />
              </g>
            );
          })}
        </svg>
        {flow.screens.map((screen, i) => (
          <ScreenCard
            key={screen.id}
            screen={screen}
            doc={doc}
            pos={posOf(screen.id, i)}
            onMove={(p) => setPositions((prev) => ({ ...prev, [screen.id]: p }))}
          />
        ))}
        {flow.screens.length === 0 && <p className="muted board-empty">画面がありません</p>}
      </div>
    </div>
  );
}

function ScreenCard({
  screen,
  doc,
  pos,
  onMove,
}: {
  screen: ScreenNode;
  doc: ProjectDoc;
  pos: Pos;
  onMove: (p: Pos) => void;
}) {
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const page = screen.kind === 'page' ? ProjectDoc.findPage(doc, screen.id as never) : null;
  const dialog = screen.kind === 'dialog' ? ProjectDoc.findDialog(doc, screen.id as never) : null;

  return (
    <div className={`board-card kind-${screen.kind}`} style={{ left: pos.x, top: pos.y, width: CARD_W }}>
      <div
        className="board-card-head"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          onMove({
            x: Math.max(0, drag.current.ox + e.clientX - drag.current.sx),
            y: Math.max(0, drag.current.oy + e.clientY - drag.current.sy),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <span className={`board-badge kind-${screen.kind}`}>
          {screen.kind === 'page' ? 'ページ' : 'ダイアログ'}
        </span>
        <span className="board-title">{screen.title}</span>
        {screen.path && <span className="board-path">{screen.path}</span>}
      </div>
      <div className="board-thumb" style={{ height: CARD_H }}>
        <div className="board-thumb-scale" style={{ transform: `scale(${SCALE})`, width: `${100 / SCALE}%` }}>
          {page && (
            <div className="thumb-page">
              {page.useHeader && doc.layout.header && <NodeBody node={doc.layout.header} mode="preview" />}
              <div className="thumb-main">
                <NodeBody node={page.root} mode="preview" />
              </div>
              {page.useFooter && doc.layout.footer && <NodeBody node={doc.layout.footer} mode="preview" />}
            </div>
          )}
          {dialog && (
            <div className="thumb-dialog">
              <div className="thumb-dialog-title">{dialog.title}</div>
              <NodeBody node={dialog.root} mode="preview" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
