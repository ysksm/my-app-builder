import { useEffect, useState } from 'react';
import { loadOrCreateProject } from './application/load-or-create-project';
import { container } from './di/container';
import { EditorPage } from './presentation/editor/EditorPage';
import { TopBar } from './presentation/editor/TopBar';
import { ScreenBoard } from './presentation/board/ScreenBoard';
import { ModelDesigner } from './presentation/model/ModelDesigner';
import { PreviewApp } from './presentation/preview/PreviewApp';
import { RunApp } from './presentation/run/RunApp';
import {
  docLoaded,
  saveFailed,
  saveStarted,
  saveSucceeded,
} from './presentation/store/editor-slice';
import { useAppDispatch, useAppSelector } from './presentation/store/hooks';

/** 編集内容をデバウンス自動保存する。revision で「保存中にさらに編集された」競合を検出する */
function useAutosave(): void {
  const dispatch = useAppDispatch();
  const projectId = useAppSelector((s) => s.editor.projectId);
  const projectName = useAppSelector((s) => s.editor.projectName);
  const doc = useAppSelector((s) => s.editor.doc);
  const dirty = useAppSelector((s) => s.editor.dirty);
  const revision = useAppSelector((s) => s.editor.revision);

  useEffect(() => {
    if (!dirty || !projectId) return;
    const timer = setTimeout(() => {
      dispatch(saveStarted());
      void container.projectRepository.save(projectId, projectName, doc).then((result) => {
        dispatch(result.ok ? saveSucceeded({ revision }) : saveFailed());
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [dispatch, projectId, projectName, doc, dirty, revision]);
}

type BootState =
  | Readonly<{ phase: 'loading' }>
  | Readonly<{ phase: 'ready' }>
  | Readonly<{ phase: 'error'; message: string }>;

export function App() {
  const dispatch = useAppDispatch();
  const [boot, setBoot] = useState<BootState>({ phase: 'loading' });
  const viewMode = useAppSelector((s) => s.editor.viewMode);
  useAutosave();

  useEffect(() => {
    let cancelled = false;
    void loadOrCreateProject(container.projectRepository).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        dispatch(
          docLoaded({
            projectId: result.value.id,
            name: result.value.name,
            doc: result.value.doc,
          }),
        );
        setBoot({ phase: 'ready' });
      } else {
        setBoot({ phase: 'error', message: result.error.message });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  if (boot.phase === 'loading') {
    return <div className="boot">読み込み中…</div>;
  }
  if (boot.phase === 'error') {
    return (
      <div className="boot error">
        <p>プロジェクトを読み込めませんでした: {boot.message}</p>
        <p>
          バックエンドが起動しているか確認してください(<code>cd backend && cargo run</code>)
        </p>
      </div>
    );
  }
  return (
    <div className="app">
      <TopBar />
      {viewMode === 'edit' && <EditorPage />}
      {viewMode === 'model' && <ModelDesigner />}
      {viewMode === 'board' && <ScreenBoard />}
      {viewMode === 'preview' && <PreviewApp />}
      {viewMode === 'run' && <RunApp />}
    </div>
  );
}
