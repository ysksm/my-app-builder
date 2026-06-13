import { describe, expect, it } from 'vitest';
import { ComponentNode, type PropValue } from '@/domain/component-node';
import { collectComponents, toUiTree } from './ui-model';
import { emitVueElement, emitVuePage } from './emit-vue';

const node = (type: Parameters<typeof ComponentNode.create>[0], props: Record<string, PropValue> = {}, children: ComponentNode[] = []): ComponentNode => ({
  ...ComponentNode.create(type, props),
  children,
});

/** container > [heading, button, input, image, metric] */
const sampleTree = () =>
  node('container', { direction: 'column', gap: 12, padding: 16 }, [
    node('heading', { text: 'タイトル', level: 1 }),
    node('button', { label: '送信', variant: 'primary' }),
    node('input', { label: '名前', inputType: 'text', placeholder: 'お名前' }),
    node('image', { src: '/logo.png', width: 120 }),
    node('metric', { label: 'CPU', unit: '%', source: 'mock', channel: 'cpu', min: 0, max: 100, interval: 1000, decimals: 1 }),
  ]);

describe('toUiTree(中立 UI 要素モデル FR-GUI-08)', () => {
  const tree = toUiTree(sampleTree());

  it('container は div.c-container + flex スタイル', () => {
    expect(tree.tag).toBe('div');
    expect(tree.classes).toEqual(['c-container']);
    expect(tree.style).toMatchObject({ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' });
    expect(tree.children).toHaveLength(5);
  });

  it('heading の level がタグに反映される(level1 → h1)', () => {
    const heading = tree.children[0]!;
    expect(heading.tag).toBe('h1');
    expect(heading.text).toBe('タイトル');
  });

  it('button は variant クラス + テキスト', () => {
    const button = tree.children[1]!;
    expect(button.tag).toBe('button');
    expect(button.classes).toEqual(['c-button', 'v-primary']);
    expect(button.text).toBe('送信');
  });

  it('input は label > span + input のサブツリー', () => {
    const input = tree.children[2]!;
    expect(input.tag).toBe('label');
    expect(input.children.map((c) => c.tag)).toEqual(['span', 'input']);
    expect(input.children[1]!.attrs).toMatchObject({ type: 'text', placeholder: 'お名前' });
  });

  it('モニタリング部品は component=true のコンポーネント参照(props を attrs に持つ)', () => {
    const metric = tree.children[4]!;
    expect(metric.component).toBe(true);
    expect(metric.tag).toBe('Metric');
    expect(metric.attrs).toMatchObject({ label: 'CPU', unit: '%', source: 'mock', channel: 'cpu' });
  });

  it('collectComponents は登場する部品名を集める', () => {
    expect([...collectComponents(tree)]).toEqual(['Metric']);
  });
});

describe('emitVue(Vue 3 SFC アダプタ PoC FR-GEN-07)', () => {
  it('中立ツリー → Vue テンプレート(html 要素 / バインド / コンポーネント)', () => {
    const lines = emitVueElement(toUiTree(sampleTree())).join('\n');
    // html 要素: class と :style バインド
    expect(lines).toContain('<div class="c-container" :style="{ display: \'flex\', flexDirection: \'column\', gap: \'12px\', padding: \'16px\' }">');
    expect(lines).toContain('<h1 class="c-heading">タイトル</h1>');
    expect(lines).toContain('<button class="c-button v-primary" type="button">送信</button>');
    // img は void 要素として自己終了
    expect(lines).toContain('<img class="c-image" src="/logo.png" alt="" width="120" />');
    // コンポーネント参照: 文字列 props は静的、数値 props は :バインド、自己終了タグ
    expect(lines).toMatch(/<Metric [^>]* \/>/);
    expect(lines).toContain('label="CPU"'); // 文字列 prop は静的属性
    expect(lines).toContain(':min="0"'); // 数値 prop は :バインド
    expect(lines).toContain(':interval="1000"');
  });

  it('emitVuePage は <script setup> に使用部品の import を出す', () => {
    const sfc = emitVuePage(sampleTree(), 'Home');
    expect(sfc).toContain('<script setup lang="ts">');
    expect(sfc).toContain(`import Metric from './realtime/Metric.vue';`);
    expect(sfc).toContain('<template>');
    expect(sfc).toContain('<div class="c-container"');
  });

  it('部品を使わないページは import なしのコメントになる', () => {
    const sfc = emitVuePage(node('container', {}, [node('text', { text: 'hi' })]), 'Plain');
    expect(sfc).toContain('// (UI 部品の参照なし)');
    expect(sfc).toContain('<p class="c-text">hi</p>');
  });
});
