import { useEffect, useState } from 'react';
import { loadOrCreateProject } from './application/load-or-create-project';
import { container } from './di/container';
import { EditorPage } from './presentation/editor/EditorPage';
import { TopBar } from './presentation/editor/TopBar';
import { DesignTokens } from './domain/design-tokens';
import { ScreenBoard } from './presentation/board/ScreenBoard';
import { ChannelsView } from './presentation/channels/ChannelsView';
import { DemoView } from './presentation/demo/DemoView';
import { DesignSystemView } from './presentation/design/DesignSystemView';
import { DiagramsView } from './presentation/diagrams/DiagramsView';
import { ModelDesigner } from './presentation/model/ModelDesigner';
import { PreviewApp } from './presentation/preview/PreviewApp';
import { ChannelsContext } from './presentation/renderer/NodeRenderer';
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
        dispatch(
          result.ok ? saveSucceeded({ revision, updatedAt: result.value.updatedAt }) : saveFailed(),
        );
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [dispatch, projectId, projectName, doc, dirty, revision]);
}

/**
 * 外部更新の検知と再読込(MCP Phase 2 / FR-MCP-02)。MCP エージェント等が同じ
 * プロジェクトを編集すると updatedAt が進む。ビルダーがアイドル(未編集・非保存中)の
 * ときだけ安全に再読込する(ローカル編集を失わない)。戻り値は再読込を通知するフラグ。
 */
function useExternalSync(active: boolean): boolean {
  const dispatch = useAppDispatch();
  const projectId = useAppSelector((s) => s.editor.projectId);
  const syncedAt = useAppSelector((s) => s.editor.syncedAt);
  const dirty = useAppSelector((s) => s.editor.dirty);
  const saveState = useAppSelector((s) => s.editor.saveState);
  const [reloaded, setReloaded] = useState(false);

  useEffect(() => {
    if (!active || !projectId) return;
    // 自分の編集・保存中は比較しない(自分の保存による updatedAt 変化と区別できないため)
    if (dirty || saveState === 'saving') return;
    let cancelled = false;
    const id = setInterval(() => {
      void container.projectRepository.get(projectId).then((result) => {
        if (cancelled || !result.ok) return;
        if (result.value.updatedAt !== syncedAt) {
          // アイドル中の差分は外部更新。ローカル編集はないので安全に再読込
          dispatch(
            docLoaded({
              projectId: result.value.id,
              name: result.value.name,
              doc: result.value.doc,
              updatedAt: result.value.updatedAt,
            }),
          );
          setReloaded(true);
          setTimeout(() => setReloaded(false), 4000);
        }
      });
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active, projectId, syncedAt, dirty, saveState, dispatch]);

  return reloaded;
}

type BootState =
  | Readonly<{ phase: 'loading' }>
  | Readonly<{ phase: 'ready' }>
  | Readonly<{ phase: 'error'; message: string }>;

export function App() {
  const dispatch = useAppDispatch();
  const [boot, setBoot] = useState<BootState>({ phase: 'loading' });
  const viewMode = useAppSelector((s) => s.editor.viewMode);
  const channels = useAppSelector((s) => s.editor.doc.channels);
  useAutosave();
  const externallyReloaded = useExternalSync(boot.phase === 'ready');

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
            updatedAt: result.value.updatedAt,
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
    <ChannelsContext.Provider value={channels}>
      <div className="app">
        <TokenVars />
        <TopBar />
        {externallyReloaded && (
          <div className="sync-notice">🔄 外部の変更(MCP 等)を読み込みました</div>
        )}
        {viewMode === 'edit' && <EditorPage />}
        {viewMode === 'model' && <ModelDesigner />}
        {viewMode === 'board' && <ScreenBoard />}
        {viewMode === 'diagrams' && <DiagramsView />}
        {viewMode === 'design' && <DesignSystemView />}
        {viewMode === 'channels' && <ChannelsView />}
        {viewMode === 'demo' && <DemoView />}
        {viewMode === 'preview' && <PreviewApp />}
        {viewMode === 'run' && <RunApp />}
      </div>
    </ChannelsContext.Provider>
  );
}

/** プロジェクトのデザイントークンを CSS 変数として注入し、c-* スタイルに即時反映させる */
function TokenVars() {
  const tokens = useAppSelector((s) => s.editor.doc.tokens);
  const css = `.app{${DesignTokens.entries(tokens)
    .map(([name, value]) => `${name}:${value}`)
    .join(';')}}`;
  return <style>{css}</style>;
}
