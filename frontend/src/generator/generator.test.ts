import { describe, expect, it } from 'vitest';
import { ComponentNode } from '@/domain/component-node';
import { PageId } from '@/domain/ids';
import { ProjectDoc, EditTarget } from '@/domain/project-doc';
import { generateProject } from './index';
import { buildNameTable, toPackageName } from './identifiers';
import { emitComponentFile } from './emit-jsx';
import { emitTokensCss } from './emit-css';
import { DesignTokens } from '@/domain/design-tokens';

/** ホーム + ページ2 + ダイアログ1、ボタンにイベントが付いたドキュメント */
const buildFixture = () => {
  let doc = ProjectDoc.create();
  const { doc: doc2, page } = ProjectDoc.addPage(doc, '詳細', '/detail');
  const { doc: doc3, dialog } = ProjectDoc.addDialog(doc2, '確認');
  doc = doc3;

  const home = doc.pages[0]!;
  const button = ComponentNode.create('button', { label: '開く', variant: 'primary' });
  const withButton = ComponentNode.insert(home.root, home.root.id, 0, button);
  if (!withButton.ok) throw new Error('fixture failed');
  let root = withButton.value;
  const events = ComponentNode.setEvents(root, button.id, [
    { event: 'onClick', action: { kind: 'openDialog', dialogId: dialog.id } },
    { event: 'onClick', action: { kind: 'navigate', pageId: page.id } },
    { event: 'onClick', action: { kind: 'showToast', message: 'こんにちは' } },
  ]);
  if (!events.ok) throw new Error('fixture failed');
  root = events.value;
  doc = ProjectDoc.setTree(doc, EditTarget.page(home.id), root);
  return { doc, home, page, dialog, button };
};

describe('generateProject', () => {
  it('ビルドに必要なファイル一式を生成する', () => {
    const { doc } = buildFixture();
    const files = generateProject(doc, 'マイアプリ');
    const paths = files.map((f) => f.path);
    for (const expected of [
      'package.json',
      'vite.config.ts',
      'tsconfig.json',
      'index.html',
      'src/main.tsx',
      'src/App.tsx',
      'src/app/store.ts',
      'src/app/ui-slice.ts',
      'src/di/container.ts',
      'src/shared/result.ts',
      'src/components/AppHeader.tsx',
      'src/components/AppFooter.tsx',
      'src/components/DialogHost.tsx',
      'src/components/Toasts.tsx',
      'src/pages/Page0.tsx',
      'src/pages/Page1.tsx',
      'src/dialogs/Dialog0.tsx',
      'src/styles/tokens.css',
      'src/styles/app.css',
    ]) {
      expect(paths).toContain(expected);
    }
  });

  it('App.tsx に全ページのルートが生成される', () => {
    const { doc } = buildFixture();
    const app = generateProject(doc, 'x').find((f) => f.path === 'src/App.tsx')!.content;
    expect(app).toContain('<Route path="/" element={<PageLayout useHeader={true} useFooter={true}><Page0 /></PageLayout>} />');
    expect(app).toContain('<Route path="/detail"');
    expect(app).toContain('HashRouter');
  });

  it('DialogHost にダイアログが登録される', () => {
    const { doc } = buildFixture();
    const host = generateProject(doc, 'x').find((f) => f.path === 'src/components/DialogHost.tsx')!.content;
    expect(host).toContain(`dialog0: { title: "確認", Body: Dialog0 }`);
  });
});

describe('emitComponentFile(イベント→コード変換)', () => {
  it('openDialog / navigate / showToast がインタープリタと同じ意味論のコードになる', () => {
    const { doc, home } = buildFixture();
    const names = buildNameTable(doc);
    const source = emitComponentFile({
      componentName: 'Page0',
      originalName: 'ホーム',
      root: home.id ? ProjectDoc.findPage(doc, home.id)!.root : home.root,
      names,
      importPrefix: '../',
    });
    expect(source).toContain(`dispatch(dialogOpened("dialog0"));`);
    expect(source).toContain(`navigate("/detail");`);
    expect(source).toContain('dispatch(dialogClosed());'); // navigate はダイアログを閉じる
    expect(source).toContain(`dispatch(toastShown("こんにちは"));`);
    expect(source).toContain(`onClick={handleClick0}`);
    expect(source).toContain(`import { useNavigate } from 'react-router';`);
    expect(source).toContain(`from '../app/ui-slice';`);
  });

  it('削除済みページへの navigate は出力されない(no-op)', () => {
    const doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const button = ComponentNode.create('button', { label: 'x' });
    const inserted = ComponentNode.insert(home.root, home.root.id, 0, button);
    if (!inserted.ok) throw new Error();
    const withEvents = ComponentNode.setEvents(inserted.value, button.id, [
      { event: 'onClick', action: { kind: 'navigate', pageId: PageId.from('missing') } },
    ]);
    if (!withEvents.ok) throw new Error();
    const source = emitComponentFile({
      componentName: 'Page0',
      originalName: 'ホーム',
      root: withEvents.value,
      names: buildNameTable(doc),
      importPrefix: '../',
    });
    expect(source).not.toContain('navigate(');
    expect(source).not.toContain('onClick=');
  });

  it('テキストは JSX 式としてエスケープされる', () => {
    const doc = ProjectDoc.create();
    const text = ComponentNode.create('text', { text: '<b>{危険}</b> & "quote"' });
    const inserted = ComponentNode.insert(doc.pages[0]!.root, doc.pages[0]!.root.id, 0, text);
    if (!inserted.ok) throw new Error();
    const source = emitComponentFile({
      componentName: 'Page0',
      originalName: 'ホーム',
      root: inserted.value,
      names: buildNameTable(doc),
      importPrefix: '../',
    });
    expect(source).toContain(`{${JSON.stringify('<b>{危険}</b> & "quote"')}}`);
  });
});

describe('emitTokensCss / toPackageName', () => {
  it('トークンが CSS 変数として出力される', () => {
    const css = emitTokensCss(DesignTokens.default());
    expect(css).toContain(':root {');
    expect(css).toContain('--color-primary: #4263eb;');
    expect(css).toContain('--spacing-md: 16px;');
    expect(css).toContain('--font-base:');
  });

  it('プロジェクト名を npm パッケージ名に変換できる', () => {
    expect(toPackageName('マイアプリ')).toBe('appforge-app');
    expect(toPackageName('My App 2')).toBe('my-app-2');
  });
});
