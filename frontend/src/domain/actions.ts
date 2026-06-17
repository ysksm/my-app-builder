import type { DialogId, PageId, QueryId } from './ids';

/** M1 で対応するイベント種別。M2 以降 onChange / onSubmit 等を追加する */
export type EventType = 'onClick';

export type Action =
  | Readonly<{ kind: 'navigate'; pageId: PageId }>
  | Readonly<{ kind: 'openDialog'; dialogId: DialogId }>
  | Readonly<{ kind: 'closeDialog' }>
  | Readonly<{ kind: 'showToast'; message: string }>
  | Readonly<{ kind: 'openUrl'; url: string }>
  // ライブデータ層: クリックでクエリを実行(結果は共有ストア経由で {{queries.x}} に反映)
  | Readonly<{ kind: 'runQuery'; queryId: QueryId }>;

export type EventBinding = Readonly<{
  event: EventType;
  action: Action;
}>;
