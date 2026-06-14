import type { ProjectDoc } from '@/domain/project-doc';
import { emitAppCss, emitTokensCss } from './emit-css';
import { emitAngularTemplate } from './emit-angular';
import type { GeneratedFile } from './files';
import { screenStyleCss } from './screen-style';

/**
 * Angular(standalone components)framework generator(FR-GEN-07)。中立 UI モデルから
 * ビルド可能な Angular アプリ一式を生成する。ハッシュルーティングでサブパス配信に対応。
 * 対象は UI 層(画面 + ルーティング)。表現構造のみ(イベント配線・モニタリング部品は将来)。
 */

const V = {
  angular: '^18.2.0',
  cli: '^18.2.0',
  buildAngular: '^18.2.0',
  rxjs: '~7.8.0',
  tslib: '^2.3.0',
  zone: '~0.14.10',
  typescript: '~5.5.0',
} as const;

const file = (path: string, content: string): GeneratedFile => ({ path, content });

const toPackageName = (name: string): string =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'angular-app';

/** TS テンプレートリテラルに安全に埋め込む(バッククォート/バックスラッシュ/${ をエスケープ) */
const tsTemplate = (s: string): string => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const packageJson = (projectName: string): string =>
  `${JSON.stringify(
    {
      name: toPackageName(projectName),
      private: true,
      version: '0.1.0',
      scripts: { build: 'ng build', start: 'ng serve' },
      dependencies: {
        '@angular/common': V.angular,
        '@angular/compiler': V.angular,
        '@angular/core': V.angular,
        '@angular/platform-browser': V.angular,
        '@angular/router': V.angular,
        rxjs: V.rxjs,
        tslib: V.tslib,
        'zone.js': V.zone,
      },
      devDependencies: {
        '@angular-devkit/build-angular': V.buildAngular,
        '@angular/cli': V.cli,
        '@angular/compiler-cli': V.angular,
        typescript: V.typescript,
      },
    },
    null,
    2,
  )}\n`;

const angularJson = (projectName: string, baseHref: string): string =>
  `${JSON.stringify(
    {
      $schema: './node_modules/@angular/cli/lib/config/schema.json',
      version: 1,
      newProjectRoot: 'projects',
      projects: {
        [toPackageName(projectName)]: {
          projectType: 'application',
          root: '',
          sourceRoot: 'src',
          prefix: 'app',
          architect: {
            build: {
              builder: '@angular-devkit/build-angular:application',
              options: {
                // dist 直下へ出力(BE が dist/ を配信するため browser サブディレクトリを無くす)
                outputPath: { base: 'dist', browser: '' },
                index: 'src/index.html',
                browser: 'src/main.ts',
                polyfills: ['zone.js'],
                tsConfig: 'tsconfig.app.json',
                baseHref,
                styles: ['src/styles.css'],
                assets: [],
              },
              configurations: {
                production: { optimization: true, outputHashing: 'all' },
              },
              defaultConfiguration: 'production',
            },
          },
        },
      },
    },
    null,
    2,
  )}\n`;

const tsconfig = `${JSON.stringify(
  {
    compileOnSave: false,
    compilerOptions: {
      outDir: './dist/out-tsc',
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      experimentalDecorators: true,
      moduleResolution: 'bundler',
      importHelpers: true,
      target: 'ES2022',
      module: 'ES2022',
      lib: ['ES2022', 'dom'],
    },
    angularCompilerOptions: {
      strictInjectionParameters: true,
      strictInputAccessModifiers: true,
      strictTemplates: true,
    },
  },
  null,
  2,
)}\n`;

const tsconfigApp = `${JSON.stringify(
  {
    extends: './tsconfig.json',
    compilerOptions: { outDir: './out-tsc/app', types: [] },
    include: ['src/**/*.ts'],
  },
  null,
  2,
)}\n`;

const indexHtml = (title: string): string => `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>${title.replace(/[<>&]/g, '')}</title>
  <base href="/" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <app-root></app-root>
</body>
</html>
`;

const mainTs = `// 自動生成 — AppForge(Angular)
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
`;

const appConfigTs = `// 自動生成 — AppForge(Angular)
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes, withHashLocation())],
};
`;

const pageClass = (i: number): string => `Page${i}Component`;
const pageSelector = (i: number): string => `app-page${i}`;

const routesTs = (doc: ProjectDoc): string => {
  const imports = doc.pages.map((_, i) => `import { ${pageClass(i)} } from './pages/page${i}.component';`).join('\n');
  const routes = doc.pages.map((p, i) => {
    const path = p.path.replace(/^\//, '');
    return `  { path: ${JSON.stringify(path)}, component: ${pageClass(i)} },`;
  });
  return `// 自動生成 — AppForge(Angular ルート、ハッシュ履歴)
import { Routes } from '@angular/router';
${imports}

export const routes: Routes = [
${routes.join('\n')}
  { path: '**', redirectTo: ${JSON.stringify(doc.pages[0]!.path.replace(/^\//, ''))} },
];
`;
};

const appComponentTs = (doc: ProjectDoc): string => {
  const header = doc.layout.header ? emitAngularTemplate(doc.layout.header, 3) : '';
  const footer = doc.layout.footer ? emitAngularTemplate(doc.layout.footer, 3) : '';
  const body = [
    `    <div class="app-root">`,
    header ? tsTemplate(header) : '',
    `      <main class="page-main"><router-outlet></router-outlet></main>`,
    footer ? tsTemplate(footer) : '',
    `    </div>`,
  ]
    .filter((l) => l !== '')
    .join('\n');
  return `// 自動生成 — AppForge(Angular)
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: \`
${body}
  \`,
})
export class AppComponent {}
`;
};

const pageComponentTs = (doc: ProjectDoc, i: number): string => {
  const page = doc.pages[i]!;
  const inner = emitAngularTemplate(page.root, 3);
  const template = `      <div class="page-screen" style="${screenStyleCss(page.screen)}">\n${inner}\n      </div>`;
  return `// 自動生成 — AppForge(Angular ページ: ${page.name})
import { Component } from '@angular/core';

@Component({
  selector: '${pageSelector(i)}',
  standalone: true,
  template: \`
${tsTemplate(template)}
  \`,
})
export class ${pageClass(i)} {}
`;
};

/** ProjectDoc → ビルド可能な Angular アプリ一式。basename はサブパス配信時の base-href */
export const generateAngularProject = (
  doc: ProjectDoc,
  projectName: string,
  baseHref = '/',
): GeneratedFile[] => {
  const base = baseHref.endsWith('/') ? baseHref : `${baseHref}/`;
  return [
    file('package.json', packageJson(projectName)),
    file('angular.json', angularJson(projectName, base)),
    file('tsconfig.json', tsconfig),
    file('tsconfig.app.json', tsconfigApp),
    file('src/index.html', indexHtml(projectName)),
    file('src/main.ts', mainTs),
    // Angular は tailwind 未配線のため css-variables 固定
    file('src/styles.css', `${emitTokensCss(doc.tokens, 'css-variables')}\n${emitAppCss()}`),
    file('src/app/app.config.ts', appConfigTs),
    file('src/app/app.routes.ts', routesTs(doc)),
    file('src/app/app.component.ts', appComponentTs(doc)),
    ...doc.pages.map((_, i) => file(`src/app/pages/page${i}.component.ts`, pageComponentTs(doc, i))),
  ];
};
