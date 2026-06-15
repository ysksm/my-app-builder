import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { muiThemeOptions } from './generator/mui-theme';
import { ChannelsContext, UiKitContext } from './presentation/renderer/NodeRenderer';
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
 * ときだけ安全に再読込する(ローカル編集を失わない)。
 *
 * 即時性は BE の WebSocket(/api/projects/{id}/events)で実現し、ポーリングは
 * 接続断時のフォールバック(長めの間隔)。戻り値は再読込を通知するフラグ。
 */
function useExternalSync(active: boolean): boolean {
  const dispatch = useAppDispatch();
  const projectId = useAppSelector((s) => s.editor.projectId);
  const syncedAt = useAppSelector((s) => s.editor.syncedAt);
  const dirty = useAppSelector((s) => s.editor.dirty);
  const saveState = useAppSelector((s) => s.editor.saveState);
  const [reloaded, setReloaded] = useState(false);

  // 最新状態を ref に保持(WS ハンドラが再購読せずに参照できるように)
  const stateRef = useRef({ syncedAt, dirty, saveState });
  stateRef.current = { syncedAt, dirty, saveState };

  const reloadIfExternal = useCallback(async () => {
    if (!projectId) return;
    const cur = stateRef.current;
    // 自分の編集・保存中は比較しない(自分の保存による更新と区別できないため)
    if (cur.dirty || cur.saveState === 'saving') return;
    const result = await container.projectRepository.get(projectId);
    if (!result.ok) return;
    if (result.value.updatedAt !== stateRef.current.syncedAt) {
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
  }, [projectId, dispatch]);

  // WebSocket による即時プッシュ(切断時は指数バックオフで再接続)
  useEffect(() => {
    if (!active || !projectId) return;
    let closed = false;
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer = 0;
    const open = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/api/projects/${encodeURIComponent(projectId)}/events`);
      ws.onopen = () => { retry = 0; };
      ws.onmessage = () => { void reloadIfExternal(); };
      ws.onclose = () => {
        if (closed) return;
        timer = window.setTimeout(open, Math.min(5000, 500 * 2 ** retry));
        retry += 1;
      };
      ws.onerror = () => { try { ws?.close(); } catch { /* ignore */ } };
    };
    open();
    return () => { closed = true; clearTimeout(timer); if (ws) ws.close(); };
  }, [active, projectId, reloadIfExternal]);

  // フォールバック: WS が落ちている場合に備えた長めのポーリング
  useEffect(() => {
    if (!active || !projectId) return;
    const id = setInterval(() => { void reloadIfExternal(); }, 15000);
    return () => clearInterval(id);
  }, [active, projectId, reloadIfExternal]);

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
  // 編集画面の実物描画: 対象 FW=React のときだけ選択中の kit を適用(他 FW は plain 近似)
  const builderKit = useAppSelector((s) =>
    s.editor.doc.targetFramework === 'react' ? (s.editor.doc.uiKits.react ?? 'plain') : 'plain',
  );
  // MUI 選択時、編集画面の MUI 部品をデザイントークン連携テーマで描画する
  const tokens = useAppSelector((s) => s.editor.doc.tokens);
  const muiTheme = useMemo(() => createTheme(muiThemeOptions(tokens)), [tokens]);
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
      <UiKitContext.Provider value={builderKit}>
      <ThemeProvider theme={muiTheme}>
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
      </ThemeProvider>
      </UiKitContext.Provider>
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
