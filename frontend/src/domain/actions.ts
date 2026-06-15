import type { DialogId, PageId } from './ids';

/** M1 で対応するイベント種別。M2 以降 onChange / onSubmit 等を追加する */
export type EventType = 'onClick';

export type Action =
  | Readonly<{ kind: 'navigate'; pageId: PageId }>
  | Readonly<{ kind: 'openDialog'; dialogId: DialogId }>
  | Readonly<{ kind: 'closeDialog' }>
  | Readonly<{ kind: 'showToast'; message: string }>
  | Readonly<{ kind: 'openUrl'; url: string }>;

export type EventBinding = Readonly<{
  event: EventType;
  action: Action;
}>;
