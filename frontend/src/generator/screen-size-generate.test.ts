import { describe, expect, it } from 'vitest';
import { ProjectDoc } from '@/domain/project-doc';
import { applyCommand } from '@/application/commands';
import { generateProject } from './index';
import { generateVueProject } from './emit-vue-project';
import { generateSvelteProject } from './emit-svelte-project';
import { generateRemixProject } from './emit-remix-project';
import { screenStyleJs, screenStyleCss } from './screen-style';
import { Page } from '@/domain/page';

const findContent = (files: ReadonlyArray<{ path: string; content: string }>, needle: string) =>
  files.find((f) => f.path.includes(needle))?.content ?? '';

describe('画面サイズの生成(全フレームワーク)', () => {
  const doc = ProjectDoc.create(); // 既定ページ = 最大幅960 / 最小高さ540

  it('React: ページが page-screen でラップされ inline style を持つ', () => {
    const page = findContent(generateProject(doc, 'x'), 'pages/Page0.tsx');
    expect(page).toContain('className="page-screen"');
    expect(page).toContain('maxWidth: "960px"');
    expect(page).toContain('minHeight: "540px"');
  });

  it('Vue: ページ SFC が page-screen ラッパー + kebab style を持つ', () => {
    const page = findContent(generateVueProject(doc, 'x'), 'pages/Page0.vue');
    expect(page).toContain('class="page-screen"');
    expect(page).toContain('max-width: 960px');
  });

  it('Svelte: ページが page-screen ラッパーを持つ', () => {
    const page = findContent(generateSvelteProject(doc, 'x'), 'pages/Page0.svelte');
    expect(page).toContain('class="page-screen"');
    expect(page).toContain('max-width: 960px');
  });

  it('Remix: ルートが page-screen ラッパー + JSX style を持つ', () => {
    const page = findContent(generateRemixProject(doc, 'x'), 'routes/page0.tsx');
    expect(page).toContain('className="page-screen"');
    expect(page).toContain('maxWidth: "960px"');
  });
});

describe('screen-style シリアライザ', () => {
  const fixed = { width: { mode: 'fixed', value: 480 } as const, height: { mode: 'auto', value: 0 } as const };
  it('JS は camelCase、flex を含む(自動高さ=伸ばす)', () => {
    const js = screenStyleJs(fixed);
    expect(js).toContain('width: "480px"');
    expect(js).toContain('flex: "1 1 auto"');
  });
  it('CSS は kebab-case', () => {
    expect(screenStyleCss(fixed)).toContain('width: 480px');
    expect(screenStyleCss(fixed)).toContain('flex: 1 1 auto');
  });
  it('固定高さは伸ばさない(flex 0 0 auto)', () => {
    expect(screenStyleJs({ width: { mode: 'auto', value: 0 }, height: { mode: 'fixed', value: 700 } })).toContain(
      'flex: "0 0 auto"',
    );
  });
});

describe('updatePage(screen)コマンド', () => {
  it('画面サイズ patch がドキュメントに反映される(GUI/MCP 共通経路)', () => {
    const doc = ProjectDoc.create();
    const pageId = doc.pages[0]!.id;
    const next = {
      width: { mode: 'fixed', value: 375 } as const,
      height: { mode: 'max', value: 812 } as const,
    };
    const res = applyCommand(doc, { kind: 'updatePage', pageId, patch: { screen: next } });
    if (!res.ok) throw new Error('apply failed');
    expect(res.value.doc.pages[0]!.screen).toEqual(next);
    // 既定から変わっていること
    expect(res.value.doc.pages[0]!.screen).not.toEqual(Page.defaultScreen);
  });
});
