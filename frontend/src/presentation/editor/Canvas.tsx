import { EditTarget, ProjectDoc } from '@/domain/project-doc';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { editTargetChanged, nodeSelected } from '../store/editor-slice';
import { EditRootView, NodeBody } from '../renderer/NodeRenderer';

export function Canvas() {
  const dispatch = useAppDispatch();
  const doc = useAppSelector((s) => s.editor.doc);
  const target = useAppSelector((s) => s.editor.editTarget);
  const tree = ProjectDoc.getTree(doc, target);

  if (!tree) {
    return <div className="canvas">編集対象がありません</div>;
  }

  const page = target.kind === 'page' ? ProjectDoc.findPage(doc, target.pageId) : null;
  const dialog = target.kind === 'dialog' ? ProjectDoc.findDialog(doc, target.dialogId) : null;

  const breadcrumb =
    target.kind === 'header'
      ? '共通ヘッダーを編集中'
      : target.kind === 'footer'
        ? '共通フッターを編集中'
        : target.kind === 'dialog'
          ? `ダイアログ「${dialog?.title ?? ''}」を編集中`
          : null;

  return (
    <div className="canvas canvas-edit" onClick={() => dispatch(nodeSelected(tree.id))}>
      {breadcrumb && (
        <div className="canvas-breadcrumb">
          <span>{breadcrumb}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dispatch(editTargetChanged(EditTarget.page(doc.pages[0]!.id)));
            }}
          >
            ページ編集へ戻る
          </button>
        </div>
      )}
      <div className={`page-frame${target.kind === 'dialog' ? ' dialog-frame' : ''}`}>
        {page?.useHeader && doc.layout.header && (
          <div
            className="layout-strip"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              dispatch(editTargetChanged(EditTarget.header));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') dispatch(editTargetChanged(EditTarget.header));
            }}
          >
            <span className="layout-strip-tag">共通ヘッダー — クリックで編集</span>
            <div className="layout-strip-body">
              <NodeBody node={doc.layout.header} mode="preview" />
            </div>
          </div>
        )}
        <EditRootView tree={tree} />
        {page?.useFooter && doc.layout.footer && (
          <div
            className="layout-strip"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              dispatch(editTargetChanged(EditTarget.footer));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') dispatch(editTargetChanged(EditTarget.footer));
            }}
          >
            <span className="layout-strip-tag">共通フッター — クリックで編集</span>
            <div className="layout-strip-body">
              <NodeBody node={doc.layout.footer} mode="preview" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
