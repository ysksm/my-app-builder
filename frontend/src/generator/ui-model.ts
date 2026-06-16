import type { ComponentNode, PropValue } from '@/domain/component-node';
import { componentDefs, propValueOf } from '@/domain/catalog/component-defs';
import { alignCss, justifyCss, wrapCss } from '@/domain/flex-style';
import { hasNodeStyle, styleCssRecord } from '@/domain/node-style';

/**
 * 中立 UI 要素モデル(FR-GUI-08)。コンポーネント木をフレームワーク非依存の
 * 要素ツリーに変換する「ヘッドレス仕様」。React の emit-jsx / NodeRenderer は
 * この構造に対応する1実装で、別フレームワーク(Vue 等、FR-GEN-07)の generator は
 * 同じ中立ツリーから出力する。コネクタ(mock/modbus)や I/F(TypeSpec/OpenAPI)と
 * 同じ「中立表現 + アダプタ」を UI パーツ系統にも適用する。
 *
 * 注: 現状は表現構造(presentational)を対象とする。イベント配線などの振る舞いは
 * フレームワーク固有のため別途(本モデルは構造の単一ソース)。
 */
export type UiAttrValue = string | number | boolean;

export type UiElement = Readonly<{
  /** HTML タグ('div'/'h1'/'button'…)または UI 部品名('Metric'…) */
  tag: string;
  /** true なら framework のコンポーネント参照(props を渡す) */
  component: boolean;
  classes: ReadonlyArray<string>;
  /** HTML 属性 or コンポーネント props */
  attrs: Readonly<Record<string, UiAttrValue>>;
  /** インラインスタイル(CSS 文字列値。例 { gap: '12px' }) */
  style: Readonly<Record<string, string>>;
  /** リテラルテキスト(あれば children より優先) */
  text: string | null;
  children: ReadonlyArray<UiElement>;
}>;

const num = (v: PropValue): number => (typeof v === 'number' ? v : Number(v) || 0);

type Partial0 = {
  tag: string;
  component?: boolean;
  classes?: ReadonlyArray<string>;
  attrs?: Readonly<Record<string, UiAttrValue>>;
  style?: Readonly<Record<string, string>>;
  text?: string | null;
  children?: ReadonlyArray<UiElement>;
};

const make = (e: Partial0): UiElement => ({
  tag: e.tag,
  component: e.component ?? false,
  classes: e.classes ?? [],
  attrs: e.attrs ?? {},
  style: e.style ?? {},
  text: e.text ?? null,
  children: e.children ?? [],
});

const REALTIME_TAG: Partial<Record<ComponentNode['type'], string>> = {
  metric: 'Metric',
  gauge: 'Gauge',
  lamp: 'Lamp',
  chart: 'Chart',
  setpoint: 'Setpoint',
  // 外部ライブラリ製(vanilla JS)。props をそのまま渡し、各 framework がマウントする
  uplot: 'Uplot',
  echarts: 'EChart',
  aggrid: 'DataGrid',
};

/**
 * ComponentNode 木 → 中立 UI 要素ツリー。
 * tagMap を渡すと、その種別を「kit のコンポーネント参照(component:true)」に写像する
 * (Svelte の UIライブラリ選択で disclosure→Disclosure 等に差し替えるのに使う)。
 */
export const toUiTree = (
  node: ComponentNode,
  tagMap: Readonly<Partial<Record<string, string>>> = {},
): UiElement => {
  const def = componentDefs[node.type];
  const p = (k: string) => propValueOf(node.props, def, k);
  const kids = () =>
    node.children.map((c) => {
      const ui = toUiTree(c, tagMap);
      // style を持つ子は flex アイテムとして style 付き div でラップ
      return hasNodeStyle(c) ? make({ tag: 'div', style: styleCssRecord(c.style!), children: [ui] }) : ui;
    });

  // kit がこの種別を差し替えるなら、props をそのまま渡すコンポーネント参照にする
  const kitTag = tagMap[node.type];
  if (kitTag) {
    const attrs: Record<string, UiAttrValue> = {};
    for (const [k, v] of Object.entries({ ...def.defaultProps, ...node.props })) attrs[k] = v;
    return make({ tag: kitTag, component: true, attrs });
  }

  switch (node.type) {
    case 'container': {
      const direction = String(p('direction')) === 'row' ? 'row' : 'column';
      const style: Record<string, string> = {
        display: 'flex',
        flexDirection: direction,
        justifyContent: justifyCss(String(p('justifyContent'))),
        alignItems: alignCss(String(p('alignItems'))),
        flexWrap: wrapCss(String(p('flexWrap'))),
        gap: `${num(p('gap'))}px`,
        padding: `${num(p('padding'))}px`,
      };
      const bg = String(p('background'));
      if (bg) style.background = bg;
      return make({ tag: 'div', classes: ['c-container'], style, children: kids() });
    }
    case 'heading': {
      const level = num(p('level'));
      const tag = level === 1 ? 'h1' : level === 3 ? 'h3' : 'h2';
      return make({ tag, classes: ['c-heading'], text: String(p('text')) });
    }
    case 'text':
      return make({ tag: 'p', classes: ['c-text'], text: String(p('text')) });
    case 'button':
      return make({
        tag: 'button',
        classes: ['c-button', `v-${String(p('variant'))}`],
        attrs: { type: 'button' },
        text: String(p('label')),
      });
    case 'input': {
      const placeholder = String(p('placeholder'));
      const inputAttrs: Record<string, UiAttrValue> = { type: String(p('inputType')) };
      if (placeholder) inputAttrs.placeholder = placeholder;
      if (p('required') === true) inputAttrs.required = true;
      return make({
        tag: 'label',
        classes: ['c-input'],
        children: [
          make({ tag: 'span', text: String(p('label')) + (p('required') === true ? ' *' : '') }),
          make({ tag: 'input', attrs: inputAttrs }),
        ],
      });
    }
    case 'image': {
      const width = num(p('width'));
      const attrs: Record<string, UiAttrValue> = { src: String(p('src')), alt: '' };
      if (width > 0) attrs.width = width;
      return make({ tag: 'img', classes: ['c-image'], attrs });
    }
    case 'table': {
      const columns = String(p('columns'))
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      const rows = Math.max(0, Math.min(20, num(p('rows'))));
      const headRow = make({ tag: 'tr', children: columns.map((c) => make({ tag: 'th', text: c })) });
      const bodyRows: UiElement[] = [];
      for (let r = 0; r < rows; r += 1) {
        bodyRows.push(make({ tag: 'tr', children: columns.map(() => make({ tag: 'td', text: '—' })) }));
      }
      return make({
        tag: 'table',
        classes: ['c-table'],
        children: [
          make({ tag: 'thead', children: [headRow] }),
          make({ tag: 'tbody', children: bodyRows }),
        ],
      });
    }
    case 'header':
      return make({
        tag: 'header',
        classes: ['c-header'],
        children: [
          make({ tag: 'strong', classes: ['c-header-title'], text: String(p('title')) }),
          make({ tag: 'div', classes: ['c-header-actions'], children: kids() }),
        ],
      });
    case 'footer':
      return make({ tag: 'footer', classes: ['c-footer'], text: String(p('text')) });
    case 'form':
      return make({
        tag: 'form',
        classes: ['c-form'],
        children: [
          ...kids(),
          make({
            tag: 'button',
            classes: ['c-button', 'v-primary'],
            attrs: { type: 'submit' },
            text: String(p('submitLabel')),
          }),
        ],
      });
    case 'disclosure': {
      // plain = <details>(ステートレス。全 framework で動く)
      return make({
        tag: 'details',
        classes: ['c-disclosure'],
        children: [
          make({ tag: 'summary', classes: ['c-disclosure-summary'], text: String(p('title')) }),
          make({ tag: 'div', classes: ['c-disclosure-content'], text: String(p('content')) }),
        ],
      });
    }
    case 'menu': {
      const items = String(p('items'))
        .split(',')
        .map((i) => i.trim())
        .filter(Boolean);
      return make({
        tag: 'details',
        classes: ['c-menu'],
        children: [
          make({ tag: 'summary', classes: ['c-menu-button'], text: String(p('label')) }),
          make({
            tag: 'ul',
            classes: ['c-menu-list'],
            children: items.map((i) => make({ tag: 'li', classes: ['c-menu-item'], text: i })),
          }),
        ],
      });
    }
    case 'switch': {
      const inputAttrs: Record<string, UiAttrValue> = { type: 'checkbox' };
      if (p('checked') === true) inputAttrs.checked = true;
      return make({
        tag: 'label',
        classes: ['c-switch'],
        children: [
          make({ tag: 'input', classes: ['c-switch-input'], attrs: inputAttrs }),
          make({ tag: 'span', classes: ['c-switch-track'] }),
          make({ tag: 'span', classes: ['c-switch-label'], text: String(p('label')) }),
        ],
      });
    }
    case 'rating': {
      const v = Math.max(0, Math.min(num(p('max')), num(p('value'))));
      const stars = '★'.repeat(v) + '☆'.repeat(Math.max(0, num(p('max')) - v));
      return make({
        tag: 'div',
        classes: ['c-rating'],
        children: [
          make({ tag: 'span', classes: ['c-rating-label'], text: String(p('label')) }),
          make({ tag: 'span', classes: ['c-rating-stars'], text: stars }),
        ],
      });
    }
    case 'slider':
      return make({
        tag: 'label',
        classes: ['c-slider'],
        children: [
          make({ tag: 'span', classes: ['c-slider-label'], text: String(p('label')) }),
          make({
            tag: 'input',
            classes: ['c-slider-input'],
            attrs: { type: 'range', min: num(p('min')), max: num(p('max')), value: num(p('value')) },
          }),
        ],
      });
    case 'chip':
      return make({ tag: 'span', classes: ['c-chip', `c-chip-${String(p('color'))}`], text: String(p('label')) });
    case 'alert':
      return make({ tag: 'div', classes: ['c-alert', `c-alert-${String(p('severity'))}`], text: String(p('message')) });
    case 'badge':
      return make({
        tag: 'span',
        classes: ['c-badge-wrap'],
        children: [
          make({ tag: 'span', classes: ['c-badge-label'], text: String(p('label')) }),
          make({ tag: 'span', classes: ['c-badge', `c-badge-${String(p('color'))}`], text: String(num(p('count'))) }),
        ],
      });
    case 'avatar':
      return make({ tag: 'span', classes: ['c-avatar'], text: String(p('label')) });
    case 'progress': {
      const v = Math.max(0, Math.min(100, num(p('value'))));
      return make({
        tag: 'div',
        classes: ['c-progress'],
        children: [
          make({ tag: 'span', classes: ['c-progress-label'], text: `${String(p('label'))}(${v}%)` }),
          make({
            tag: 'div',
            classes: ['c-progress-track'],
            children: [make({ tag: 'div', classes: ['c-progress-fill'], style: { width: `${v}%` } })],
          }),
        ],
      });
    }
    case 'searchfield': {
      const placeholder = String(p('placeholder'));
      const attrs: Record<string, UiAttrValue> = { type: 'search' };
      if (placeholder) attrs.placeholder = placeholder;
      return make({
        tag: 'label',
        classes: ['c-input'],
        children: [
          make({ tag: 'span', text: String(p('label')) }),
          make({ tag: 'input', attrs }),
        ],
      });
    }
    case 'combobox': {
      // plain = <select>(Headless UI 等を選ぶとフィルタ付きコンボボックス)
      const options = String(p('options'))
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      return make({
        tag: 'select',
        classes: ['c-combobox-input'],
        children: options.map((o) => make({ tag: 'option', text: o })),
      });
    }
    case 'tabs': {
      // plain = 全タブを縦に並べる(ステートレス。kit 選択時は切替式)
      const tabs = String(p('tabs'))
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      return make({
        tag: 'div',
        classes: ['c-tabs'],
        children: tabs.map((t) =>
          make({
            tag: 'div',
            classes: ['c-tab-section'],
            children: [
              make({ tag: 'div', classes: ['c-tab-label'], text: t }),
              make({ tag: 'div', classes: ['c-tab-panel'], text: `${t} の内容` }),
            ],
          }),
        ),
      });
    }
    case 'metric':
    case 'gauge':
    case 'lamp':
    case 'chart':
    case 'setpoint':
    case 'uplot':
    case 'echarts':
    case 'aggrid': {
      // モニタリング/設定/外部ライブラリ部品は framework のコンポーネント参照。有効 props をそのまま渡す
      const attrs: Record<string, UiAttrValue> = {};
      for (const [k, v] of Object.entries({ ...def.defaultProps, ...node.props })) attrs[k] = v;
      return make({ tag: REALTIME_TAG[node.type]!, component: true, attrs });
    }
  }
};

/** ツリー中に登場する UI 部品名(コンポーネント参照)を収集する */
export const collectComponents = (el: UiElement, into: Set<string> = new Set()): Set<string> => {
  if (el.component) into.add(el.tag);
  el.children.forEach((c) => collectComponents(c, into));
  return into;
};
