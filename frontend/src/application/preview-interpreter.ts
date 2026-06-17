import type { Action, EventBinding, EventType } from '@/domain/actions';
import type { DialogId, PageId } from '@/domain/ids';
import { ProjectDoc } from '@/domain/project-doc';

export type Toast = Readonly<{ id: number; message: string }>;

/**
 * プレビュー(実行)時のアプリ状態。純粋なインタープリタとして実装し、
 * M2 のコード生成は「これと同じ意味論を持つ TSX を出力する」関係になる。
 */
export type PreviewState = Readonly<{
  currentPageId: PageId;
  openDialogId: DialogId | null;
  toasts: ReadonlyArray<Toast>;
  nextToastId: number;
}>;

export const PreviewState = {
  initial(doc: ProjectDoc): PreviewState {
    return {
      currentPageId: doc.pages[0]!.id,
      openDialogId: null,
      toasts: [],
      nextToastId: 1,
    };
  },

  apply(doc: ProjectDoc, state: PreviewState, action: Action): PreviewState {
    switch (action.kind) {
      case 'navigate':
        if (!ProjectDoc.findPage(doc, action.pageId)) return state;
        return { ...state, currentPageId: action.pageId, openDialogId: null };
      case 'openDialog':
        if (!ProjectDoc.findDialog(doc, action.dialogId)) return state;
        return { ...state, openDialogId: action.dialogId };
      case 'closeDialog':
        return { ...state, openDialogId: null };
      case 'showToast':
        return {
          ...state,
          toasts: [...state.toasts, { id: state.nextToastId, message: action.message }],
          nextToastId: state.nextToastId + 1,
        };
      case 'openUrl':
        // 外部リンク(プレビューでも実際に開く)。状態は変えない
        if (typeof window !== 'undefined' && action.url) {
          window.open(action.url, '_blank', 'noopener,noreferrer');
        }
        return state;
      case 'runQuery':
        // プレビューはクエリを実行しない(実行モードでライブ取得)。状態は変えない
        return state;
    }
  },

  /** ノードのイベントバインディングのうち event に一致するものを順に適用する */
  run(
    doc: ProjectDoc,
    state: PreviewState,
    events: ReadonlyArray<EventBinding>,
    event: EventType,
  ): PreviewState {
    return events
      .filter((b) => b.event === event)
      .reduce((acc, b) => PreviewState.apply(doc, acc, b.action), state);
  },

  dismissToast(state: PreviewState, id: number): PreviewState {
    return { ...state, toasts: state.toasts.filter((t) => t.id !== id) };
  },
} as const;
