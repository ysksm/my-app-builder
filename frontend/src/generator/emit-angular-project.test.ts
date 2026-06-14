import { describe, expect, it } from 'vitest';
import { ProjectDoc } from '@/domain/project-doc';
import { generateAngularProject } from './emit-angular-project';

const get = (files: ReadonlyArray<{ path: string; content: string }>, path: string) =>
  files.find((f) => f.path.includes(path))?.content ?? '';

describe('generateAngularProject(FR-GEN-07)', () => {
  const files = generateAngularProject(ProjectDoc.create(), 'My App', '/preview/x-angular/');

  it('Angular scaffold 一式(package/angular.json/main/config/routes/app)', () => {
    const paths = files.map((f) => f.path);
    expect(paths).toContain('package.json');
    expect(paths).toContain('angular.json');
    expect(paths).toContain('src/main.ts');
    expect(paths).toContain('src/app/app.config.ts');
    expect(paths).toContain('src/app/app.routes.ts');
    expect(paths).toContain('src/app/app.component.ts');
    expect(paths).toContain('src/app/pages/page0.component.ts');
  });

  it('package.json は ng build スクリプト + @angular 依存', () => {
    const pkg = get(files, 'package.json');
    expect(pkg).toContain('"build": "ng build"');
    expect(pkg).toContain('@angular/core');
    expect(pkg).toContain('@angular/cli');
  });

  it('angular.json は dist 直下出力 + base-href を焼き込む', () => {
    const aj = get(files, 'angular.json');
    expect(aj).toContain('"base": "dist"');
    expect(aj).toContain('/preview/x-angular/');
  });

  it('standalone component + ハッシュルーティング + router-outlet', () => {
    expect(get(files, 'app.config.ts')).toContain('withHashLocation');
    expect(get(files, 'app.component.ts')).toContain('standalone: true');
    expect(get(files, 'app.component.ts')).toContain('<router-outlet>');
    expect(get(files, 'app.routes.ts')).toContain('Page0Component');
  });

  it('ページコンポーネントは page-screen ラッパー + テンプレート', () => {
    const page = get(files, 'page0.component.ts');
    expect(page).toContain('class="page-screen"');
    expect(page).toContain('export class Page0Component');
  });
});
