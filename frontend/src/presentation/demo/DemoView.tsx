import { useEffect, useMemo, useState } from 'react';
import { buildDemoSteps } from '@/application/demo-scenario';
import { ChannelsContext, NodeBody } from '../renderer/NodeRenderer';

/**
 * デモモード(FR-DEMO)。サンプルアプリ(サーバー監視ダッシュボード)が
 * コマンド層で1ステップずつ組み上がる様子をナレーション付きで再生する。
 *
 * 完全にサンドボックス: ユーザーの実プロジェクト(editor slice の doc)には
 * 触れず、シナリオが返すスナップショットをこのビュー内だけで描画する。
 * 自動保存にも影響しない。
 */
const STEP_MS = 3200;

export function DemoView() {
  const steps = useMemo(() => buildDemoSteps(), []);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const last = steps.length - 1;
  const step = steps[index]!;

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setIndex((i) => Math.min(last, i + 1)), STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, index, last]);

  const home = step.doc.pages[0]!;

  return (
    <div className="demo-root">
      <div className="demo-stage">
        <ChannelsContext.Provider value={step.doc.channels}>
          <div className="preview-page demo-screen">
            {home.useHeader && step.doc.layout.header && (
              <NodeBody node={step.doc.layout.header} mode="preview" />
            )}
            <main className="preview-main">
              <NodeBody node={home.root} mode="preview" />
            </main>
            {home.useFooter && step.doc.layout.footer && (
              <NodeBody node={step.doc.layout.footer} mode="preview" />
            )}
          </div>
        </ChannelsContext.Provider>
      </div>

      <div className="demo-panel">
        <div className="demo-progress">
          <span className="demo-badge">
            デモ {index + 1} / {steps.length}
          </span>
          <div className="demo-dots">
            {steps.map((_, i) => (
              <span key={i} className={`demo-dot${i === index ? ' on' : ''}${i < index ? ' done' : ''}`} />
            ))}
          </div>
        </div>
        <p className="demo-narration">{step.narration}</p>
        <div className="demo-controls">
          <button type="button" className="btn" disabled={index === 0} onClick={() => { setPlaying(false); setIndex((i) => Math.max(0, i - 1)); }}>
            ◀ 前へ
          </button>
          {index >= last ? (
            <button type="button" className="btn primary" onClick={() => { setIndex(0); setPlaying(true); }}>
              ↺ 最初から
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={() => setPlaying((p) => !p)}>
              {playing ? '⏸ 一時停止' : '▶ 再生'}
            </button>
          )}
          <button type="button" className="btn" disabled={index >= last} onClick={() => { setPlaying(false); setIndex((i) => Math.min(last, i + 1)); }}>
            次へ ▶
          </button>
        </div>
        <p className="muted demo-note">
          これはサンドボックス再生です。あなたのプロジェクトには影響しません。
        </p>
      </div>
    </div>
  );
}
