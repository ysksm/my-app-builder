import { useEffect, useState } from 'react';
import JSZip from 'jszip';
import { generateProject } from '@/generator';
import { toPackageName } from '@/generator/identifiers';
import { useAppSelector } from '../store/hooks';

type BuildState =
  | Readonly<{ phase: 'building' }>
  | Readonly<{ phase: 'ok'; log: string }>
  | Readonly<{ phase: 'error'; log: string }>;

/**
 * 実行モード: ドキュメントから React ソースを生成し、BE のビルドランナーで
 * npm install → tsc + vite build を実行、成果物を iframe で表示する。
 */
export function RunApp() {
  const doc = useAppSelector((s) => s.editor.doc);
  const projectId = useAppSelector((s) => s.editor.projectId);
  const projectName = useAppSelector((s) => s.editor.projectName);
  const [state, setState] = useState<BuildState>({ phase: 'building' });
  const [nonce, setNonce] = useState(0);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setState({ phase: 'building' });
    const files = generateProject(doc, projectName);
    void fetch(`/api/projects/${projectId}/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        return (await res.json()) as { ok: boolean; log: string };
      })
      .then((result) => {
        if (cancelled) return;
        setState(
          result.ok ? { phase: 'ok', log: result.log } : { phase: 'error', log: result.log },
        );
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ phase: 'error', log: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [doc, projectId, projectName, nonce]);

  const download = async () => {
    const zip = new JSZip();
    for (const f of generateProject(doc, projectName)) {
      zip.file(f.path, f.content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${toPackageName(projectName)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!projectId) {
    return <div className="boot">プロジェクトが読み込まれていません</div>;
  }

  const statusLabel =
    state.phase === 'building'
      ? 'ビルド中…(初回は依存取得で1分ほどかかります)'
      : state.phase === 'ok'
        ? 'ビルド成功'
        : 'ビルド失敗';

  return (
    <div className="run-root">
      <div className="run-toolbar">
        <span className={`run-status ${state.phase}`}>{statusLabel}</span>
        <button
          type="button"
          className="btn"
          disabled={state.phase === 'building'}
          onClick={() => setNonce((n) => n + 1)}
        >
          ↻ 再ビルド
        </button>
        <button type="button" className="btn" onClick={() => void download()}>
          ⬇ ソースを ZIP ダウンロード
        </button>
        {state.phase !== 'building' && (
          <button type="button" className="btn" onClick={() => setShowLog((v) => !v)}>
            {showLog ? 'ログを隠す' : 'ビルドログ'}
          </button>
        )}
      </div>
      {(showLog || state.phase === 'error') && state.phase !== 'building' && (
        <pre className="run-log">{state.log}</pre>
      )}
      {state.phase === 'ok' && (
        <iframe
          className="run-iframe"
          title="生成アプリ"
          sandbox="allow-scripts allow-same-origin"
          src={`/preview/${projectId}/?v=${nonce}`}
        />
      )}
      {state.phase === 'building' && (
        <div className="boot">ソース生成 → npm install → tsc + vite build を実行中…</div>
      )}
    </div>
  );
}
