import { describe, expect, it } from 'vitest';
import { ComponentNode, type PropValue } from '@/domain/component-node';
import { EditTarget, ProjectDoc } from '@/domain/project-doc';
import { generateVueProject } from './emit-vue-project';

const n = (
  type: Parameters<typeof ComponentNode.create>[0],
  props: Record<string, PropValue> = {},
  children: ComponentNode[] = [],
): ComponentNode => ({ ...ComponentNode.create(type, props), children });

const find = (files: ReturnType<typeof generateVueProject>, path: string) =>
  files.find((f) => f.path === path)?.content ?? '';

describe('generateVueProject(Vue framework generator FR-GEN-07)', () => {
  it('scaffolding と router / App.vue / ページ SFC を出力する', () => {
    const doc = ProjectDoc.addPage(ProjectDoc.create(), '一覧', '/list').doc;
    const files = generateVueProject(doc, 'My Vue App');
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'package.json',
        'vite.config.ts',
        'tsconfig.json',
        'index.html',
        'src/main.ts',
        'src/App.vue',
        'src/router.ts',
        'src/styles/tokens.css',
        'src/styles/app.css',
        'src/pages/Page0.vue',
        'src/pages/Page1.vue',
      ]),
    );
    // package.json は Vue + vue-router 依存、build は vue-tsc + vite
    const pkg = JSON.parse(find(files, 'package.json')) as {
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(pkg.dependencies).toHaveProperty('vue');
    expect(pkg.dependencies).toHaveProperty('vue-router');
    expect(pkg.scripts.build).toContain('vue-tsc');
  });

  it('router は doc.pages のパスから lazy import ルートを作る', () => {
    const doc = ProjectDoc.addPage(ProjectDoc.create(), '一覧', '/list').doc;
    const router = find(generateVueProject(doc, 'x'), 'src/router.ts');
    expect(router).toContain('createWebHashHistory');
    expect(router).toContain(`{ path: "/", component: () => import('./pages/Page0.vue') }`);
    expect(router).toContain(`{ path: "/list", component: () => import('./pages/Page1.vue') }`);
  });

  it('App.vue は <router-view/> と共通ヘッダー/フッターを持つ', () => {
    const app = find(generateVueProject(ProjectDoc.create(), 'x'), 'src/App.vue');
    expect(app).toContain('<router-view />');
    expect(app).toContain('class="c-header"');
    expect(app).toContain('class="c-footer"');
  });

  it('モニタリング部品を使うときだけ Vue SFC + composable を出力する', () => {
    const plain = generateVueProject(ProjectDoc.create(), 'x').map((f) => f.path);
    expect(plain).not.toContain('src/shared/realtime/useChannel.ts');

    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const root = { ...home.root, children: [n('metric', { label: 'CPU', min: 0, max: 100, interval: 800 })] };
    doc = ProjectDoc.setTree(doc, EditTarget.page(home.id), root);
    const files = generateVueProject(doc, 'x');
    const paths = files.map((f) => f.path);
    expect(paths).toContain('src/shared/realtime/useChannel.ts');
    expect(paths).toContain('src/shared/realtime/Metric.vue');
    // 使っていない部品は出力しない
    expect(paths).not.toContain('src/shared/realtime/Gauge.vue');
    // ページは ../shared/realtime から import する
    expect(find(files, 'src/pages/Page0.vue')).toContain(`from '../shared/realtime/Metric.vue'`);
  });
});
