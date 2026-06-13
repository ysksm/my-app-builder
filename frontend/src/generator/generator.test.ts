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
      'src/app/main.tsx',
      'src/app/App.tsx',
      'src/app/store.ts',
      'src/app/ui-slice.ts',
      'src/app/di/container.ts',
      'src/app/DialogHost.tsx',
      'src/app/Toasts.tsx',
      'src/shared/result.ts',
      'src/shared/styles/tokens.css',
      'src/shared/styles/app.css',
      'src/pages/AppHeader.tsx',
      'src/pages/AppFooter.tsx',
      'src/pages/Page0.tsx',
      'src/pages/Page1.tsx',
      'src/pages/Dialog0.tsx',
    ]) {
      expect(paths).toContain(expected);
    }
  });

  it('index.html は app/main.tsx を読み込む', () => {
    const { doc } = buildFixture();
    const html = generateProject(doc, 'x').find((f) => f.path === 'index.html')!.content;
    expect(html).toContain('src="/src/app/main.tsx"');
  });

  it('main.tsx は styles を正しい相対パスで import する(拡張子の二重付与なし)', () => {
    const { doc } = buildFixture();
    const main = generateProject(doc, 'x').find((f) => f.path === 'src/app/main.tsx')!.content;
    expect(main).toContain(`import '../shared/styles/tokens.css';`);
    expect(main).toContain(`import '../shared/styles/app.css';`);
    expect(main).not.toContain('.css.css');
    expect(main).toContain(`import { App } from './App';`);
    expect(main).toContain(`import { store } from './store';`);
  });

  it('スタイル emitter: 既定は css-variables、tailwind 選択で @theme + Tailwind 配線になる', () => {
    const base = ProjectDoc.create();
    // css-variables(既定)
    const cssFiles = generateProject(base, 'x');
    const cssTokens = cssFiles.find((f) => f.path === 'src/shared/styles/tokens.css')!.content;
    expect(cssTokens).toContain(':root {');
    expect(cssTokens).not.toContain('@import "tailwindcss"');
    const cssPkg = cssFiles.find((f) => f.path === 'package.json')!.content;
    expect(cssPkg).not.toContain('tailwindcss');

    // tailwind
    const twFiles = generateProject({ ...base, styleEmitter: 'tailwind' }, 'x');
    const twTokens = twFiles.find((f) => f.path === 'src/shared/styles/tokens.css')!.content;
    expect(twTokens).toContain('@import "tailwindcss";');
    expect(twTokens).toContain('@theme {');
    expect(twTokens).toContain('--color-primary: #4263eb;');
    const twPkg = twFiles.find((f) => f.path === 'package.json')!.content;
    expect(twPkg).toContain('@tailwindcss/vite');
    expect(twPkg).toContain('"tailwindcss"');
    const twVite = twFiles.find((f) => f.path === 'vite.config.ts')!.content;
    expect(twVite).toContain(`import tailwindcss from '@tailwindcss/vite';`);
    expect(twVite).toContain('tailwindcss(),');
  });

  it('カスタムスタイルはユーザー所有(overwrite=false)で生成し main から読み込む', () => {
    const { doc } = buildFixture();
    const files = generateProject(doc, 'x');
    const overrides = files.find((f) => f.path === 'src/custom/overrides.css')!;
    expect(overrides.overwrite).toBe(false);
    const main = files.find((f) => f.path === 'src/app/main.tsx')!.content;
    // app.css の後に読み込まれる(上書き用)
    expect(main.indexOf(`'../shared/styles/app.css'`)).toBeLessThan(main.indexOf(`'../custom/overrides.css'`));
    // 他の生成ファイルは overwrite 未指定(=毎回上書き)
    expect(files.find((f) => f.path === 'src/app/App.tsx')!.overwrite).toBeUndefined();
  });

  it('App.tsx に全ページのルートが生成される', () => {
    const { doc } = buildFixture();
    const app = generateProject(doc, 'x').find((f) => f.path === 'src/app/App.tsx')!.content;
    expect(app).toContain('<Route path="/" element={<PageLayout useHeader={true} useFooter={true}><Page0 /></PageLayout>} />');
    expect(app).toContain('<Route path="/detail"');
    expect(app).toContain('HashRouter');
    expect(app).toContain(`import { Page0 } from '../pages/Page0';`);
  });

  it('DialogHost にダイアログが登録される', () => {
    const { doc } = buildFixture();
    const host = generateProject(doc, 'x').find((f) => f.path === 'src/app/DialogHost.tsx')!.content;
    expect(host).toContain(`dialog0: { title: "確認", Body: Dialog0 }`);
    expect(host).toContain(`import { Dialog0 } from '../pages/Dialog0';`);
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
      filePath: 'src/pages/Page0.tsx',
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
      filePath: 'src/pages/Page0.tsx',
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
      filePath: 'src/pages/Page0.tsx',
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
