import type { ProjectDoc } from '@/domain/project-doc';
import { crudProviders, crudRoutes } from './emit-crud';
import { emitContainerWithRepositories } from './emit-domain';
import { emitComponentFile } from './emit-jsx';
import type { GeneratedFile } from './files';
import { toPackageName, type NameTable } from './identifiers';
import { paths, relativeImport } from './layout';

/**
 * プロジェクト雛形 + app/ + shared/ + pages/ の生成。
 * フォルダ構成は features × レイヤード(requirements.md §6.2 / FR-GEN-08)。
 * import は layout の relativeImport で解決し、パスを直書きしない。
 */

/** 生成アプリの依存バージョン(ビルダー自身の検証済みバージョンに揃える) */
const VERSIONS = {
  react: '^19.2.7',
  reactDom: '^19.2.7',
  reactRedux: '^9.3.0',
  reduxToolkit: '^2.12.0',
  reactRouter: '^7.17.0',
  typescript: '^6.0.3',
  vite: '^8.0.16',
  pluginReact: '^6.0.2',
  rolldownBabel: '^0.2.3',
  reactCompiler: '^1.0.0',
  typesReact: '^19.2.17',
  typesReactDom: '^19.2.3',
  vitest: '^4.1.8',
  tailwind: '^4.3.1',
  tailwindVite: '^4.3.1',
} as const;

const file = (path: string, content: string): GeneratedFile => ({ path, content });

const packageJson = (projectName: string, tailwind: boolean): string =>
  `${JSON.stringify(
    {
      name: toPackageName(projectName),
      private: true,
      version: '0.1.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'tsc --noEmit && vite build',
        preview: 'vite preview',
        test: 'vitest run',
      },
      dependencies: {
        '@reduxjs/toolkit': VERSIONS.reduxToolkit,
        react: VERSIONS.react,
        'react-dom': VERSIONS.reactDom,
        'react-redux': VERSIONS.reactRedux,
        'react-router': VERSIONS.reactRouter,
      },
      devDependencies: {
        '@rolldown/plugin-babel': VERSIONS.rolldownBabel,
        '@types/react': VERSIONS.typesReact,
        '@types/react-dom': VERSIONS.typesReactDom,
        '@vitejs/plugin-react': VERSIONS.pluginReact,
        'babel-plugin-react-compiler': VERSIONS.reactCompiler,
        ...(tailwind
          ? { '@tailwindcss/vite': VERSIONS.tailwindVite, tailwindcss: VERSIONS.tailwind }
          : {}),
        typescript: VERSIONS.typescript,
        vite: VERSIONS.vite,
        vitest: VERSIONS.vitest,
      },
    },
    null,
    2,
  )}\n`;

const viteConfig = (tailwind: boolean): string => `// 自動生成 — AppForge
import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';${tailwind ? `\nimport tailwindcss from '@tailwindcss/vite';` : ''}

export default defineConfig({
  // /preview/{id}/ のようなサブパス配信でも動くよう相対パスにする
  base: './',
  plugins: [${tailwind ? '\n    tailwindcss(),' : ''}
    // React Compiler(自動メモ化)。手書きの useMemo/useCallback は出力しない方針
    babel({ presets: [reactCompilerPreset()] }),
    react(),
  ],
});
`;

const tsconfig = `${JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2023', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      strict: true,
      verbatimModuleSyntax: true,
      isolatedModules: true,
      skipLibCheck: true,
      noEmit: true,
      types: ['vite/client'],
    },
    include: ['src'],
  },
  null,
  2,
)}\n`;

const indexHtml = (title: string): string => `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title.replace(/[<>&]/g, '')}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${paths.mainTsx}"></script>
  </body>
</html>
`;

const mainTsx = (): string => {
  const appSpec = relativeImport(paths.mainTsx, paths.appTsx);
  const storeSpec = relativeImport(paths.mainTsx, paths.store);
  const tokensSpec = relativeImport(paths.mainTsx, paths.tokensCss);
  const appCssSpec = relativeImport(paths.mainTsx, paths.appCss);
  const overridesSpec = relativeImport(paths.mainTsx, paths.overridesCss);
  return `// 自動生成 — AppForge
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from '${appSpec}';
import { store } from '${storeSpec}';
import '${tokensSpec}';
import '${appCssSpec}';
// ユーザー編集可・再生成で保持されるカスタムスタイル(app.css の後に適用)
import '${overridesSpec}';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
`;
};

const resultTs = `// 自動生成 — AppForge
export type Ok<T> = Readonly<{ ok: true; value: T }>;
export type Err<E> = Readonly<{ ok: false; error: E }>;
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });
`;

const uiSliceTs = `// 自動生成 — AppForge: ダイアログ開閉・トーストのアプリ状態
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type Toast = { id: number; message: string };

export type UiState = {
  openDialogId: string | null;
  toasts: Toast[];
  nextToastId: number;
};

const initialState: UiState = { openDialogId: null, toasts: [], nextToastId: 1 };

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    dialogOpened(state, action: PayloadAction<string>) {
      state.openDialogId = action.payload;
    },
    dialogClosed(state) {
      state.openDialogId = null;
    },
    toastShown(state, action: PayloadAction<string>) {
      state.toasts.push({ id: state.nextToastId, message: action.payload });
      state.nextToastId += 1;
    },
    toastDismissed(state, action: PayloadAction<number>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
  },
});

export const { dialogOpened, dialogClosed, toastShown, toastDismissed } = uiSlice.actions;
export const uiReducer = uiSlice.reducer;
`;

const storeTs = `// 自動生成 — AppForge
import { configureStore } from '@reduxjs/toolkit';
import { uiReducer } from './ui-slice';

export const store = configureStore({
  reducer: { ui: uiReducer },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
`;

const emptyContainerTs = `// 自動生成 — AppForge: Composition Root
// モデル(集約)を定義すると、その repository 実装がここに注入される(DIP)。
// VITE_APP_MODE=mock のとき、全 repository をインメモリ mock に切り替える。
export type Container = Readonly<Record<string, never>>;

const mode: string = import.meta.env.VITE_APP_MODE ?? 'api';

export const isMockMode: boolean = mode === 'mock';

export const container: Container = {};
`;

const toastsTsx = (): string => {
  const storeSpec = relativeImport(paths.toasts, paths.store);
  const sliceSpec = relativeImport(paths.toasts, paths.uiSlice);
  return `// 自動生成 — AppForge(グローバルオーバーレイ)
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '${storeSpec}';
import { toastDismissed } from '${sliceSpec}';

export function Toasts() {
  const toasts = useSelector((state: RootState) => state.ui.toasts);
  const dispatch = useDispatch();
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <ToastView key={t.id} message={t.message} onDismiss={() => dispatch(toastDismissed(t.id))} />
      ))}
    </div>
  );
}

function ToastView({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);
  return <div className="toast">{message}</div>;
}
`;
};

const dialogHostTsx = (doc: ProjectDoc, names: NameTable): string => {
  if (doc.dialogs.length === 0) {
    return `// 自動生成 — AppForge(ダイアログ未定義)
export function DialogHost() {
  return null;
}
`;
  }
  const storeSpec = relativeImport(paths.dialogHost, paths.store);
  const sliceSpec = relativeImport(paths.dialogHost, paths.uiSlice);
  const imports = doc.dialogs
    .map((d, i) => {
      const spec = relativeImport(paths.dialogHost, paths.dialog(i));
      return `import { ${names.dialogComponent(d.id)} } from '${spec}';`;
    })
    .join('\n');
  const entries = doc.dialogs
    .map(
      (d) =>
        `  ${names.dialogKey(d.id)}: { title: ${JSON.stringify(d.title)}, Body: ${names.dialogComponent(d.id)} },`,
    )
    .join('\n');
  return `// 自動生成 — AppForge(グローバルオーバーレイ)
import type { ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '${storeSpec}';
import { dialogClosed } from '${sliceSpec}';
${imports}

const dialogs: Record<string, { title: string; Body: () => ReactNode }> = {
${entries}
};

export function DialogHost() {
  const openId = useSelector((state: RootState) => state.ui.openDialogId);
  const dispatch = useDispatch();
  if (!openId) return null;
  const entry = dialogs[openId];
  if (!entry) return null;
  const { title, Body } = entry;
  return (
    <div className="modal-backdrop" onClick={() => dispatch(dialogClosed())}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>{title}</strong>
          <button type="button" className="modal-close" onClick={() => dispatch(dialogClosed())}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <Body />
        </div>
      </div>
    </div>
  );
}
`;
};

const appTsx = (doc: ProjectDoc, names: NameTable): string => {
  const hasHeader = doc.layout.header !== null;
  const hasFooter = doc.layout.footer !== null;
  const crud = crudRoutes(doc.dataModel);
  const providers = crudProviders(doc.dataModel);
  const rel = (to: string) => relativeImport(paths.appTsx, to);

  const imports = [
    `import type { ReactNode } from 'react';`,
    `import { HashRouter, Route, Routes } from 'react-router';`,
    hasHeader ? `import { AppHeader } from '${rel(paths.appHeader)}';` : null,
    hasFooter ? `import { AppFooter } from '${rel(paths.appFooter)}';` : null,
    `import { DialogHost } from '${rel(paths.dialogHost)}';`,
    `import { Toasts } from '${rel(paths.toasts)}';`,
    providers.length > 0 ? `import { container } from '${rel(paths.container)}';` : null,
    ...providers.map((p) => `import { ${p.contextName} } from '${rel(p.file)}';`),
    ...doc.pages.map((p, i) => `import { ${names.pageComponent(p.id)} } from '${rel(paths.page(i))}';`),
    ...crud.map((r) => `import { ${r.componentName} } from '${rel(r.file)}';`),
  ].filter((x): x is string => x !== null);

  const routes = [
    ...doc.pages.map((p) => {
      const header = hasHeader && p.useHeader;
      const footer = hasFooter && p.useFooter;
      const element = `<PageLayout useHeader={${header}} useFooter={${footer}}><${names.pageComponent(p.id)} /></PageLayout>`;
      return `        <Route path=${JSON.stringify(p.path)} element={${element}} />`;
    }),
    // CRUD 管理画面(FR-MDL-06)— #/admin から辿れる
    ...crud.map(
      (r) =>
        `        <Route path=${JSON.stringify(r.path)} element={<PageLayout useHeader={${hasHeader}} useFooter={${hasFooter}}><${r.componentName} /></PageLayout>} />`,
    ),
  ].join('\n');

  // 機能ごとの repository コンテキストへ container を注入(presentation の DIP)
  const providerOpen = providers
    .map((p) => `    <${p.contextName}.Provider value={container.${p.repoField}}>`)
    .join('\n');
  const providerClose = providers
    .map((p) => `    </${p.contextName}.Provider>`)
    .reverse()
    .join('\n');

  const routesTree = `      <HashRouter>
        <Routes>
${routes}
          <Route path="*" element={<PageLayout useHeader={${hasHeader}} useFooter={${hasFooter}}><${names.pageComponent(doc.pages[0]!.id)} /></PageLayout>} />
        </Routes>
      </HashRouter>`;

  const appBody =
    providers.length > 0
      ? `  return (\n${providerOpen}\n${routesTree}\n${providerClose}\n  );`
      : `  return (\n${routesTree}\n  );`;

  return `// 自動生成 — AppForge
${imports.join('\n')}

type LayoutProps = { useHeader: boolean; useFooter: boolean; children: ReactNode };

function PageLayout({ useHeader, useFooter, children }: LayoutProps) {
  return (
    <div className="app-root">
${hasHeader ? '      {useHeader && <AppHeader />}\n' : ''}      <main className="page-main">{children}</main>
${hasFooter ? '      {useFooter && <AppFooter />}\n' : ''}      <DialogHost />
      <Toasts />
    </div>
  );
}

export function App() {
${appBody}
}
`;
};

export const emitProjectShell = (
  doc: ProjectDoc,
  projectName: string,
  names: NameTable,
): GeneratedFile[] => {
  const tailwind = doc.styleEmitter === 'tailwind';
  const files: GeneratedFile[] = [
    file('package.json', packageJson(projectName, tailwind)),
    file('vite.config.ts', viteConfig(tailwind)),
    file('tsconfig.json', tsconfig),
    file('index.html', indexHtml(projectName)),
    file(paths.mainTsx, mainTsx()),
    file(paths.appTsx, appTsx(doc, names)),
    file(paths.result, resultTs),
    file(paths.uiSlice, uiSliceTs),
    file(paths.store, storeTs),
    file(paths.container, emitContainerWithRepositories(doc.dataModel) ?? emptyContainerTs),
    file(paths.toasts, toastsTsx()),
    file(paths.dialogHost, dialogHostTsx(doc, names)),
  ];

  if (doc.layout.header) {
    files.push(
      file(
        paths.appHeader,
        emitComponentFile({
          componentName: 'AppHeader',
          originalName: '共通ヘッダー',
          root: doc.layout.header,
          names,
          filePath: paths.appHeader,
        }),
      ),
    );
  }
  if (doc.layout.footer) {
    files.push(
      file(
        paths.appFooter,
        emitComponentFile({
          componentName: 'AppFooter',
          originalName: '共通フッター',
          root: doc.layout.footer,
          names,
          filePath: paths.appFooter,
        }),
      ),
    );
  }
  return files;
};
