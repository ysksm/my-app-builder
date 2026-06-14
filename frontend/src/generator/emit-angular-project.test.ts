import { describe, expect, it } from 'vitest';
import { ProjectDoc, EditTarget } from '@/domain/project-doc';
import { applyCommand } from '@/application/commands';
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

  it('Angular Material 選択で button→app-mat-button + 依存/テーマ/ラッパー', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const target = EditTarget.page(home.id);
    const b = applyCommand(doc, { kind: 'insertNode', target, parentId: home.root.id, index: 0, type: 'button' });
    if (!b.ok) throw new Error('insert');
    doc = b.value.doc;
    const r = applyCommand(doc, { kind: 'setUiKit', framework: 'angular', kit: 'material' });
    if (!r.ok) throw new Error('setUiKit');
    const mf = generateAngularProject(r.value.doc, 'My App');
    const page = get(mf, 'page0.component.ts');
    expect(page).toContain('<app-mat-button');
    expect(page).toContain('AppMatButtonComponent');
    expect(get(mf, 'app/ui/app-mat-button.component.ts')).toContain("from '@angular/material/button'");
    expect(get(mf, 'package.json')).toContain('@angular/material');
    expect(get(mf, 'angular.json')).toContain('prebuilt-themes/azure-blue.css');
    expect(get(mf, 'app.config.ts')).toContain('provideAnimations');
  });
});
