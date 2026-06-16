import { useEffect, useMemo, useState } from 'react';
import { PreviewState, type Toast } from '@/application/preview-interpreter';
import { ProjectDoc } from '@/domain/project-doc';
import { ActionRunnerContext, NodeBody, type ActionRunner } from '../renderer/NodeRenderer';
import { useAppSelector } from '../store/hooks';

/**
 * エディタ内プレビュー。イベントバインディングをインタープリタ実行し、
 * ページ遷移・ダイアログ開閉・トーストが実際に動作する。
 */
export function PreviewApp() {
  const doc = useAppSelector((s) => s.editor.doc);
  const [state, setState] = useState(() => PreviewState.initial(doc));

  const runner = useMemo<ActionRunner>(
    () => ({
      run: (events, event) => setState((s) => PreviewState.run(doc, s, events, event)),
    }),
    [doc],
  );

  const page = ProjectDoc.findPage(doc, state.currentPageId) ?? doc.pages[0]!;
  const dialog = state.openDialogId ? ProjectDoc.findDialog(doc, state.openDialogId) : null;
  const closeDialog = () =>
    setState((s) => PreviewState.apply(doc, s, { kind: 'closeDialog' }));
  const goTo = (pageId: typeof page.id) =>
    setState((s) => PreviewState.apply(doc, s, { kind: 'navigate', pageId }));

  return (
    <ActionRunnerContext.Provider value={runner}>
      <div className="preview-root">
        <div className="preview-chrome">
          <span className="preview-dot" />
          <span className="preview-url">{page.path}</span>
          <nav className="preview-pages">
            {doc.pages.map((pg) => (
              <button
                key={pg.id}
                type="button"
                className={`preview-page-tab${pg.id === page.id ? ' active' : ''}`}
                onClick={() => goTo(pg.id)}
                title={pg.path}
              >
                {pg.name}
              </button>
            ))}
          </nav>
        </div>
        <div className="preview-page">
          {page.useHeader && doc.layout.header && (
            <NodeBody node={doc.layout.header} mode="preview" />
          )}
          <main className="preview-main">
            <NodeBody node={page.root} mode="preview" />
          </main>
          {page.useFooter && doc.layout.footer && (
            <NodeBody node={doc.layout.footer} mode="preview" />
          )}
        </div>
        {dialog && (
          <div className="modal-backdrop" onClick={closeDialog}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <strong>{dialog.title}</strong>
                <button type="button" className="icon-btn" onClick={closeDialog}>
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <NodeBody node={dialog.root} mode="preview" />
              </div>
            </div>
          </div>
        )}
        <div className="toasts">
          {state.toasts.map((t) => (
            <ToastView
              key={t.id}
              toast={t}
              onDismiss={() => setState((s) => PreviewState.dismissToast(s, t.id))}
            />
          ))}
        </div>
      </div>
    </ActionRunnerContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);
  return <div className="toast">{toast.message}</div>;
}
