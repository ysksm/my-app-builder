import { describe, expect, it } from 'vitest';
import { ComponentNode, type PropValue } from '@/domain/component-node';
import { EditTarget, ProjectDoc } from '@/domain/project-doc';
import { generateSvelteProject } from './emit-svelte-project';

const n = (
  type: Parameters<typeof ComponentNode.create>[0],
  props: Record<string, PropValue> = {},
  children: ComponentNode[] = [],
): ComponentNode => ({ ...ComponentNode.create(type, props), children });

const find = (files: ReturnType<typeof generateSvelteProject>, path: string) =>
  files.find((f) => f.path === path)?.content ?? '';

describe('generateSvelteProject(Svelte framework generator FR-GEN-07)', () => {
  it('scaffolding と App.svelte / ページ / svelte-spa-router ルートを出力する', () => {
    const doc = ProjectDoc.addPage(ProjectDoc.create(), '一覧', '/list').doc;
    const files = generateSvelteProject(doc, 'My Svelte App');
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'package.json',
        'vite.config.ts',
        'svelte.config.js',
        'tsconfig.json',
        'index.html',
        'src/main.ts',
        'src/App.svelte',
        'src/pages/Page0.svelte',
        'src/pages/Page1.svelte',
      ]),
    );
    const pkg = JSON.parse(find(files, 'package.json')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(pkg.dependencies).toHaveProperty('svelte-spa-router');
    expect(pkg.devDependencies).toHaveProperty('svelte');
    expect(pkg.scripts.build).toContain('svelte-check');
    // App.svelte は Router と各ページの import + routes
    const app = find(files, 'src/App.svelte');
    expect(app).toContain(`import Router from 'svelte-spa-router'`);
    expect(app).toContain('<Router {routes} />');
    expect(app).toContain('"/": Page0');
    expect(app).toContain('"/list": Page1');
  });

  it('ページは Svelte markup(class / 中括弧式 / コンポーネント import)を出す', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const root = {
      ...home.root,
      children: [n('heading', { text: 'タイトル', level: 1 }), n('metric', { label: 'CPU', min: 0, max: 100, interval: 800 })],
    };
    doc = ProjectDoc.setTree(doc, EditTarget.page(home.id), root);
    const page = find(generateSvelteProject(doc, 'x'), 'src/pages/Page0.svelte');
    expect(page).toContain('<h1 class="c-heading">タイトル</h1>');
    expect(page).toContain(`import Metric from '../shared/realtime/Metric.svelte'`);
    expect(page).toContain('<Metric ');
    expect(page).toContain(':min'.replace(':', '')); // Svelte は min={0}(コロンなし)
    expect(page).toContain('min={0}');
  });

  it('モニタリング部品を使うときだけ Svelte SFC + severity を出力する', () => {
    const plain = generateSvelteProject(ProjectDoc.create(), 'x').map((f) => f.path);
    expect(plain).not.toContain('src/shared/realtime/severity.ts');

    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    doc = ProjectDoc.setTree(doc, EditTarget.page(home.id), {
      ...home.root,
      children: [n('gauge', { label: '温度', min: 0, max: 200, interval: 800 })],
    });
    const paths = generateSvelteProject(doc, 'x').map((f) => f.path);
    expect(paths).toContain('src/shared/realtime/severity.ts');
    expect(paths).toContain('src/shared/realtime/Gauge.svelte');
    expect(paths).not.toContain('src/shared/realtime/Metric.svelte');
  });
});
