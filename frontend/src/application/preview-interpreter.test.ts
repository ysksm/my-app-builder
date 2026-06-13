import { describe, expect, it } from 'vitest';
import { DialogId, PageId } from '@/domain/ids';
import { ProjectDoc } from '@/domain/project-doc';
import { PreviewState } from './preview-interpreter';

const setup = () => {
  let doc = ProjectDoc.create();
  const { doc: doc2, page } = ProjectDoc.addPage(doc, '詳細', '/detail');
  const { doc: doc3, dialog } = ProjectDoc.addDialog(doc2, '確認');
  doc = doc3;
  return { doc, home: doc.pages[0]!, detail: page, dialog };
};

describe('PreviewState.apply', () => {
  it('navigate でページが切り替わり、開いていたダイアログは閉じる', () => {
    const { doc, detail, dialog } = setup();
    let state = PreviewState.initial(doc);
    state = PreviewState.apply(doc, state, { kind: 'openDialog', dialogId: dialog.id });
    expect(state.openDialogId).toBe(dialog.id);

    state = PreviewState.apply(doc, state, { kind: 'navigate', pageId: detail.id });
    expect(state.currentPageId).toBe(detail.id);
    expect(state.openDialogId).toBeNull();
  });

  it('存在しないページ / ダイアログへのアクションは no-op', () => {
    const { doc } = setup();
    const state = PreviewState.initial(doc);
    expect(PreviewState.apply(doc, state, { kind: 'navigate', pageId: PageId.from('x') })).toBe(
      state,
    );
    expect(
      PreviewState.apply(doc, state, { kind: 'openDialog', dialogId: DialogId.from('x') }),
    ).toBe(state);
  });

  it('showToast は連番 id で積まれ、dismiss で消える', () => {
    const { doc } = setup();
    let state = PreviewState.initial(doc);
    state = PreviewState.apply(doc, state, { kind: 'showToast', message: 'a' });
    state = PreviewState.apply(doc, state, { kind: 'showToast', message: 'b' });
    expect(state.toasts.map((t) => t.id)).toEqual([1, 2]);

    state = PreviewState.dismissToast(state, 1);
    expect(state.toasts.map((t) => t.message)).toEqual(['b']);
  });
});

describe('PreviewState.run', () => {
  it('onClick のバインディングだけを順に適用する', () => {
    const { doc, detail } = setup();
    const state = PreviewState.run(
      doc,
      PreviewState.initial(doc),
      [
        { event: 'onClick', action: { kind: 'showToast', message: 'hi' } },
        { event: 'onClick', action: { kind: 'navigate', pageId: detail.id } },
      ],
      'onClick',
    );
    expect(state.toasts).toHaveLength(1);
    expect(state.currentPageId).toBe(detail.id);
  });
});
