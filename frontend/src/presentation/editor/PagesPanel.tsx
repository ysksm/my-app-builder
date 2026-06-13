import { EditTarget, ProjectDoc } from '@/domain/project-doc';
import {
  dialogAdded,
  dialogRemoved,
  dialogRenamed,
  editTargetChanged,
  pageAdded,
  pageRemoved,
  pageUpdated,
} from '../store/editor-slice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

export function PagesPanel() {
  const dispatch = useAppDispatch();
  const doc = useAppSelector((s) => s.editor.doc);
  const target = useAppSelector((s) => s.editor.editTarget);

  const activePage =
    target.kind === 'page' ? ProjectDoc.findPage(doc, target.pageId) : null;
  const activeDialog =
    target.kind === 'dialog' ? ProjectDoc.findDialog(doc, target.dialogId) : null;

  return (
    <section className="panel-section pages-panel">
      <h3>ページ</h3>
      {doc.pages.map((p) => (
        <div key={p.id} className={`list-row${activePage?.id === p.id ? ' active' : ''}`}>
          <button
            type="button"
            className="row-main"
            onClick={() => dispatch(editTargetChanged(EditTarget.page(p.id)))}
          >
            {p.name} <span className="muted">{p.path}</span>
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={doc.pages.length <= 1}
            title="削除"
            onClick={() => {
              if (window.confirm(`ページ「${p.name}」を削除しますか?`)) {
                dispatch(pageRemoved({ pageId: p.id }));
              }
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() =>
          dispatch(
            pageAdded({
              name: `ページ${doc.pages.length + 1}`,
              path: `/page-${doc.pages.length + 1}`,
            }),
          )
        }
      >
        + ページ追加
      </button>

      {activePage && (
        <div className="detail-box">
          <label className="field">
            <span>名前</span>
            <input
              type="text"
              value={activePage.name}
              onChange={(e) =>
                dispatch(pageUpdated({ pageId: activePage.id, patch: { name: e.target.value } }))
              }
            />
          </label>
          <label className="field">
            <span>パス</span>
            <input
              type="text"
              value={activePage.path}
              onChange={(e) =>
                dispatch(pageUpdated({ pageId: activePage.id, patch: { path: e.target.value } }))
              }
            />
          </label>
          <label className="field row">
            <input
              type="checkbox"
              checked={activePage.useHeader}
              onChange={(e) =>
                dispatch(
                  pageUpdated({ pageId: activePage.id, patch: { useHeader: e.target.checked } }),
                )
              }
            />
            <span>共通ヘッダーを使う</span>
          </label>
          <label className="field row">
            <input
              type="checkbox"
              checked={activePage.useFooter}
              onChange={(e) =>
                dispatch(
                  pageUpdated({ pageId: activePage.id, patch: { useFooter: e.target.checked } }),
                )
              }
            />
            <span>共通フッターを使う</span>
          </label>
        </div>
      )}

      <h3>共通レイアウト</h3>
      <div className="button-row">
        <button
          type="button"
          className={`btn${target.kind === 'header' ? ' on' : ''}`}
          onClick={() => dispatch(editTargetChanged(EditTarget.header))}
        >
          ヘッダーを編集
        </button>
        <button
          type="button"
          className={`btn${target.kind === 'footer' ? ' on' : ''}`}
          onClick={() => dispatch(editTargetChanged(EditTarget.footer))}
        >
          フッターを編集
        </button>
      </div>

      <h3>ダイアログ</h3>
      {doc.dialogs.map((d) => (
        <div key={d.id} className={`list-row${activeDialog?.id === d.id ? ' active' : ''}`}>
          <button
            type="button"
            className="row-main"
            onClick={() => dispatch(editTargetChanged(EditTarget.dialog(d.id)))}
          >
            {d.title}
          </button>
          <button
            type="button"
            className="icon-btn"
            title="削除"
            onClick={() => {
              if (window.confirm(`ダイアログ「${d.title}」を削除しますか?`)) {
                dispatch(dialogRemoved({ dialogId: d.id }));
              }
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() => dispatch(dialogAdded({ title: `ダイアログ${doc.dialogs.length + 1}` }))}
      >
        + ダイアログ追加
      </button>

      {activeDialog && (
        <div className="detail-box">
          <label className="field">
            <span>タイトル</span>
            <input
              type="text"
              value={activeDialog.title}
              onChange={(e) =>
                dispatch(dialogRenamed({ dialogId: activeDialog.id, title: e.target.value }))
              }
            />
          </label>
        </div>
      )}
    </section>
  );
}
