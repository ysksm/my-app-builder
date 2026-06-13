import { useEffect, useState } from 'react';
import JSZip from 'jszip';
import {
  generateProject,
  generateSvelteProject,
  generateVueProject,
  type GeneratedFile,
} from '@/generator';
import { toPackageName } from '@/generator/identifiers';
import { useAppSelector } from '../store/hooks';

type BuildState =
  | Readonly<{ phase: 'building' }>
  | Readonly<{ phase: 'ok'; log: string }>
  | Readonly<{ phase: 'error'; log: string }>;

type Framework = 'react' | 'vue' | 'svelte';

const FRAMEWORKS: ReadonlyArray<{ id: Framework; label: string }> = [
  { id: 'react', label: 'React' },
  { id: 'vue', label: 'Vue' },
  { id: 'svelte', label: 'Svelte' },
];

const generateFor = (framework: Framework, doc: Parameters<typeof generateProject>[0], name: string): GeneratedFile[] => {
  switch (framework) {
    case 'vue':
      return generateVueProject(doc, name);
    case 'svelte':
      return generateSvelteProject(doc, name);
    default:
      return generateProject(doc, name);
  }
};

/**
 * 実行モード: ドキュメントから React / Vue / Svelte(FR-GEN-07)ソースを生成し、BE の
 * ビルドランナーで npm install → 型チェック + vite build を実行、成果物を iframe で表示する。
 */
export function RunApp() {
  const doc = useAppSelector((s) => s.editor.doc);
  const projectId = useAppSelector((s) => s.editor.projectId);
  const projectName = useAppSelector((s) => s.editor.projectName);
  const [framework, setFramework] = useState<Framework>('react');
  const [state, setState] = useState<BuildState>({ phase: 'building' });
  const [nonce, setNonce] = useState(0);
  const [showLog, setShowLog] = useState(false);

  // フレームワークごとに独立したビルドワークスペースを使う(各フレームワークの生成物が
  // 混在しないように。共有すると一方の残存ファイルが他方の型チェックを壊す)
  const buildId = framework === 'react' ? projectId : `${projectId}-${framework}`;

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setState({ phase: 'building' });
    const files = generateFor(framework, doc, projectName);
    void fetch(`/api/projects/${buildId}/build`, {
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
  }, [doc, projectId, projectName, nonce, framework, buildId]);

  const download = async () => {
    const zip = new JSZip();
    for (const f of generateFor(framework, doc, projectName)) {
      zip.file(f.path, f.content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${toPackageName(projectName)}-${framework}.zip`;
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
        <div className="run-framework" role="group" aria-label="生成フレームワーク">
          {FRAMEWORKS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={framework === f.id ? 'on' : ''}
              disabled={state.phase === 'building'}
              onClick={() => setFramework(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
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
          src={`/preview/${buildId}/?v=${nonce}&fw=${framework}`}
        />
      )}
      {state.phase === 'building' && (
        <div className="boot">ソース生成 → npm install → tsc + vite build を実行中…</div>
      )}
    </div>
  );
}
