import {
  projectRenamed,
  redone,
  undone,
  viewModeChanged,
  type SaveState,
} from '../store/editor-slice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

const saveLabel = (saveState: SaveState, dirty: boolean): string => {
  if (saveState === 'saving') return '保存中…';
  if (saveState === 'error') return '保存エラー';
  if (dirty) return '未保存の変更';
  if (saveState === 'saved') return '保存済み';
  return '';
};

export function TopBar() {
  const dispatch = useAppDispatch();
  const projectName = useAppSelector((s) => s.editor.projectName);
  const viewMode = useAppSelector((s) => s.editor.viewMode);
  const canUndo = useAppSelector((s) => s.editor.past.length > 0);
  const canRedo = useAppSelector((s) => s.editor.future.length > 0);
  const saveState = useAppSelector((s) => s.editor.saveState);
  const dirty = useAppSelector((s) => s.editor.dirty);

  return (
    <header className="topbar">
      <span className="brand">AppForge</span>
      <input
        className="project-name"
        type="text"
        value={projectName}
        onChange={(e) => dispatch(projectRenamed(e.target.value))}
      />
      <div className="topbar-actions">
        <button type="button" className="btn" disabled={!canUndo} onClick={() => dispatch(undone())}>
          ↺ 元に戻す
        </button>
        <button type="button" className="btn" disabled={!canRedo} onClick={() => dispatch(redone())}>
          ↻ やり直す
        </button>
        <div className="mode-toggle">
          <button
            type="button"
            className={viewMode === 'edit' ? 'on' : ''}
            onClick={() => dispatch(viewModeChanged('edit'))}
          >
            編集
          </button>
          <button
            type="button"
            className={viewMode === 'model' ? 'on' : ''}
            onClick={() => dispatch(viewModeChanged('model'))}
          >
            ◆ モデル
          </button>
          <button
            type="button"
            className={viewMode === 'board' ? 'on' : ''}
            onClick={() => dispatch(viewModeChanged('board'))}
          >
            ▭ ボード
          </button>
          <button
            type="button"
            className={viewMode === 'diagrams' ? 'on' : ''}
            onClick={() => dispatch(viewModeChanged('diagrams'))}
          >
            📄 設計図
          </button>
          <button
            type="button"
            className={viewMode === 'design' ? 'on' : ''}
            onClick={() => dispatch(viewModeChanged('design'))}
          >
            🎨 デザイン
          </button>
          <button
            type="button"
            className={viewMode === 'preview' ? 'on' : ''}
            onClick={() => dispatch(viewModeChanged('preview'))}
          >
            ▶ プレビュー
          </button>
          <button
            type="button"
            className={viewMode === 'run' ? 'on' : ''}
            onClick={() => dispatch(viewModeChanged('run'))}
          >
            ⚡ 実行
          </button>
        </div>
        <span className={`save-state ${saveState}`}>{saveLabel(saveState, dirty)}</span>
      </div>
    </header>
  );
}
