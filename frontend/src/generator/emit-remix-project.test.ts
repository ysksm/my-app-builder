import { describe, expect, it } from 'vitest';
import { ComponentNode, type PropValue } from '@/domain/component-node';
import { EditTarget, ProjectDoc } from '@/domain/project-doc';
import { generateRemixProject } from './emit-remix-project';

const n = (
  type: Parameters<typeof ComponentNode.create>[0],
  props: Record<string, PropValue> = {},
  children: ComponentNode[] = [],
): ComponentNode => ({ ...ComponentNode.create(type, props), children });

const find = (files: ReturnType<typeof generateRemixProject>, path: string) =>
  files.find((f) => f.path === path)?.content ?? '';

describe('generateRemixProject(Remix / RR7 framework generator FR-GEN-07)', () => {
  it('RR7 SPA の scaffolding(root / routes / config)を出力する', () => {
    const doc = ProjectDoc.addPage(ProjectDoc.create(), '一覧', '/list').doc;
    const files = generateRemixProject(doc, 'My Remix App');
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'package.json',
        'vite.config.ts',
        'react-router.config.ts',
        'tsconfig.json',
        'app/root.tsx',
        'app/routes.ts',
        'app/routes/page0.tsx',
        'app/routes/page1.tsx',
      ]),
    );
    // SPA モード設定 + basename(既定 '/')
    const rrConfig = find(files, 'react-router.config.ts');
    expect(rrConfig).toContain('ssr: false');
    expect(rrConfig).toContain('basename: "/"');
    // SPA ビルドは build/client → dist へ複製(BE 配信のため)
    const pkg = JSON.parse(find(files, 'package.json')) as { scripts: Record<string, string>; dependencies: Record<string, string> };
    expect(pkg.scripts.build).toContain('react-router build');
    expect(pkg.scripts.build).toContain('cp -r build/client dist');
    expect(pkg.dependencies).toHaveProperty('react-router');
  });

  it('routes.ts は index / route 設定を doc.pages から作る', () => {
    const doc = ProjectDoc.addPage(ProjectDoc.create(), '一覧', '/list').doc;
    const routes = find(generateRemixProject(doc, 'x'), 'app/routes.ts');
    expect(routes).toContain(`index('routes/page0.tsx')`);
    expect(routes).toContain(`route("list", 'routes/page1.tsx')`);
  });

  it('root.tsx は HTML シェル(Outlet / Links / Scripts)+ 共通ヘッダー/フッター', () => {
    const root = find(generateRemixProject(ProjectDoc.create(), 'x'), 'app/root.tsx');
    expect(root).toContain('<Outlet />');
    expect(root).toContain('<Scripts />');
    expect(root).toContain('className="c-header"');
    expect(root).toContain('className="c-footer"');
  });

  it('ルートは React JSX(className / コンポーネント import)を出す', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const r = {
      ...home.root,
      children: [n('heading', { text: 'タイトル', level: 1 }), n('metric', { label: 'CPU', min: 0, max: 100, interval: 800 })],
    };
    doc = ProjectDoc.setTree(doc, EditTarget.page(home.id), r);
    const page = find(generateRemixProject(doc, 'x'), 'app/routes/page0.tsx');
    expect(page).toContain('export default function Page0()');
    expect(page).toContain('<h1 className="c-heading">{"タイトル"}</h1>');
    expect(page).toContain(`import { Metric } from '../shared/realtime'`);
    expect(page).toContain('<Metric ');
    expect(page).toContain('min={0}');
  });

  it('basename を渡すと vite base / RR7 basename に焼き込む(サブパス配信用、末尾 / 正規化)', () => {
    const files = generateRemixProject(ProjectDoc.create(), 'x', '/preview/abc-remix');
    expect(find(files, 'react-router.config.ts')).toContain('basename: "/preview/abc-remix/"');
    expect(find(files, 'vite.config.ts')).toContain('base: "/preview/abc-remix/"');
  });

  it('モニタリング部品を使うときだけ realtime.tsx を出力する', () => {
    const plain = generateRemixProject(ProjectDoc.create(), 'x').map((f) => f.path);
    expect(plain).not.toContain('app/shared/realtime.tsx');
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    doc = ProjectDoc.setTree(doc, EditTarget.page(home.id), {
      ...home.root,
      children: [n('chart', { label: 'T', min: 0, max: 100, interval: 800 })],
    });
    expect(generateRemixProject(doc, 'x').map((f) => f.path)).toContain('app/shared/realtime.tsx');
  });
});
