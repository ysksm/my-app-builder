import type { EventBinding } from '@/domain/actions';
import type { ComponentNode } from '@/domain/component-node';
import { componentDefs, propValueOf, type ComponentDef } from '@/domain/catalog/component-defs';
import type { DataChannelDef } from '@/domain/data-channel';
import type { NameTable } from './identifiers';
import { paths, relativeImport } from './layout';
import { resolveReactKit, type ReactUiKit } from './react-ui-kits';

/**
 * ComponentNode 木 → React コンポーネントの TSX ソース。
 * 意味論は application/preview-interpreter.ts(エディタ内プレビュー)と同一に保つこと。
 */

type UiAction = 'dialogOpened' | 'dialogClosed' | 'toastShown';

type EmitCtx = {
  readonly names: NameTable;
  readonly handlers: string[];
  handlerCount: number;
  needsNavigate: boolean;
  needsDispatch: boolean;
  // リアルタイム部品の import 名(Metric / Gauge / Lamp / Chart)。すべて同一モジュールから
  readonly realtimeImports: Set<string>;
  // 外部ライブラリ製コンポーネント(Uplot / EChart / DataGrid)。各々別ファイルから import
  readonly libImports: Set<string>;
  // 選択中の UIライブラリ(kit)アダプタ + その import 文(重複排除)
  readonly uiKit: ReactUiKit;
  readonly kitImports: Set<string>;
  // データチャネル登録簿(channelRef の解決に使う)
  readonly channels: ReadonlyArray<DataChannelDef>;
  readonly usedActions: Set<UiAction>;
};

const s = (value: unknown): string => JSON.stringify(String(value));

const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value) || 0);

const propOf = (node: ComponentNode, def: ComponentDef, key: string) =>
  propValueOf(node.props, def, key);

/** onClick バインディング列 → ハンドラ関数を登録し、ハンドラ名を返す(無ければ null) */
const compileClickHandler = (events: ReadonlyArray<EventBinding>, ctx: EmitCtx): string | null => {
  const lines: string[] = [];
  for (const binding of events.filter((b) => b.event === 'onClick')) {
    const action = binding.action;
    switch (action.kind) {
      case 'navigate': {
        const path = ctx.names.pagePath(action.pageId);
        if (path === null) break; // 削除済みページへの参照は no-op(インタープリタと同じ)
        ctx.needsNavigate = true;
        ctx.needsDispatch = true;
        ctx.usedActions.add('dialogClosed');
        lines.push(`navigate(${s(path)});`);
        lines.push('dispatch(dialogClosed());');
        break;
      }
      case 'openDialog': {
        const key = ctx.names.dialogKey(action.dialogId);
        if (key === null) break;
        ctx.needsDispatch = true;
        ctx.usedActions.add('dialogOpened');
        lines.push(`dispatch(dialogOpened(${s(key)}));`);
        break;
      }
      case 'closeDialog':
        ctx.needsDispatch = true;
        ctx.usedActions.add('dialogClosed');
        lines.push('dispatch(dialogClosed());');
        break;
      case 'showToast':
        ctx.needsDispatch = true;
        ctx.usedActions.add('toastShown');
        lines.push(`dispatch(toastShown(${s(action.message)}));`);
        break;
    }
  }
  if (lines.length === 0) return null;
  const name = `handleClick${ctx.handlerCount}`;
  ctx.handlerCount += 1;
  ctx.handlers.push(
    `  const ${name} = () => {`,
    ...lines.map((l) => `    ${l}`),
    '  };',
  );
  return name;
};

const emitChildren = (node: ComponentNode, indent: number, ctx: EmitCtx): string[] =>
  node.children.flatMap((child) => emitNode(child, indent, ctx));

const emitNode = (node: ComponentNode, indent: number, ctx: EmitCtx): string[] => {
  const def = componentDefs[node.type];
  const p = (key: string) => propOf(node, def, key);
  const pad = ' '.repeat(indent);

  switch (node.type) {
    case 'form': {
      // 送信で preventDefault + 「送信しました」トースト
      ctx.needsDispatch = true;
      ctx.usedActions.add('toastShown');
      const onSubmit = `onSubmit={(e) => { e.preventDefault(); dispatch(toastShown(${s('送信しました')})); }}`;
      const submit = `${pad}  <button type="submit" className="c-button v-primary">{${s(p('submitLabel'))}}</button>`;
      return [
        `${pad}<form className="c-form" ${onSubmit}>`,
        ...emitChildren(node, indent + 2, ctx),
        submit,
        `${pad}</form>`,
      ];
    }
    case 'container': {
      const direction = String(p('direction')) === 'row' ? 'row' : 'column';
      const style = [
        `display: 'flex'`,
        `flexDirection: '${direction}'`,
        `gap: ${num(p('gap'))}`,
        `padding: ${num(p('padding'))}`,
      ];
      const background = String(p('background'));
      if (background) style.push(`background: ${s(background)}`);
      const open = `${pad}<div className="c-container" style={{ ${style.join(', ')} }}>`;
      if (node.children.length === 0) return [`${open}</div>`];
      return [open, ...emitChildren(node, indent + 2, ctx), `${pad}</div>`];
    }
    case 'heading': {
      const level = num(p('level'));
      const tag = level === 1 ? 'h1' : level === 3 ? 'h3' : 'h2';
      return [`${pad}<${tag} className="c-heading">{${s(p('text'))}}</${tag}>`];
    }
    case 'text':
      return [`${pad}<p className="c-text">{${s(p('text'))}}</p>`];
    case 'button': {
      const handler = compileClickHandler(node.events, ctx);
      const onClick = handler ? ` onClick={${handler}}` : '';
      const variant = String(p('variant'));
      // UIライブラリ(kit)が button を提供すればそれを使う。なければ plain(c-*)
      if (ctx.uiKit.button) {
        const e = ctx.uiKit.button({ pad, labelExpr: s(p('label')), variant, onClick });
        e.imports.forEach((i) => ctx.kitImports.add(i));
        return e.jsx;
      }
      return [
        `${pad}<button type="button" className="c-button v-${variant}"${onClick}>{${s(p('label'))}}</button>`,
      ];
    }
    case 'input': {
      const placeholder = String(p('placeholder'));
      if (ctx.uiKit.input) {
        const e = ctx.uiKit.input({
          pad,
          labelExpr: s(p('label')),
          placeholderExpr: placeholder ? s(placeholder) : null,
          inputType: String(p('inputType')),
        });
        e.imports.forEach((i) => ctx.kitImports.add(i));
        return e.jsx;
      }
      const placeholderAttr = placeholder ? ` placeholder={${s(placeholder)}}` : '';
      return [
        `${pad}<label className="c-input">`,
        `${pad}  <span>{${s(p('label'))}}</span>`,
        `${pad}  <input type="${String(p('inputType'))}"${placeholderAttr} />`,
        `${pad}</label>`,
      ];
    }
    case 'image': {
      const width = num(p('width'));
      const widthAttr = width > 0 ? ` width={${width}}` : '';
      return [`${pad}<img className="c-image" src={${s(p('src'))}}${widthAttr} alt="" />`];
    }
    case 'table': {
      const columns = String(p('columns'))
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      const rows = Math.max(0, Math.min(20, num(p('rows'))));
      const lines = [
        `${pad}<table className="c-table">`,
        `${pad}  <thead>`,
        `${pad}    <tr>`,
        ...columns.map((c) => `${pad}      <th>{${s(c)}}</th>`),
        `${pad}    </tr>`,
        `${pad}  </thead>`,
        `${pad}  <tbody>`,
      ];
      for (let r = 0; r < rows; r += 1) {
        lines.push(`${pad}    <tr>`);
        for (let c = 0; c < columns.length; c += 1) {
          lines.push(`${pad}      <td>—</td>`);
        }
        lines.push(`${pad}    </tr>`);
      }
      lines.push(`${pad}  </tbody>`, `${pad}</table>`);
      return lines;
    }
    case 'header': {
      const lines = [
        `${pad}<header className="c-header">`,
        `${pad}  <strong className="c-header-title">{${s(p('title'))}}</strong>`,
        `${pad}  <div className="c-header-actions">`,
        ...emitChildren(node, indent + 4, ctx),
        `${pad}  </div>`,
        `${pad}</header>`,
      ];
      return lines;
    }
    case 'footer':
      return [`${pad}<footer className="c-footer">{${s(p('text'))}}</footer>`];
    case 'metric':
    case 'gauge':
    case 'lamp':
    case 'chart':
    case 'uplot':
    case 'echarts': {
      // metric / gauge / lamp / chart / uplot / echarts は同じデータチャネル属性を共有
      const tag =
        node.type === 'gauge'
          ? 'Gauge'
          : node.type === 'lamp'
            ? 'Lamp'
            : node.type === 'chart'
              ? 'Chart'
              : node.type === 'uplot'
                ? 'Uplot'
                : node.type === 'echarts'
                  ? 'EChart'
                  : 'Metric';
      // 外部ライブラリ製は別ファイルから import(uPlot / ECharts)
      if (node.type === 'uplot' || node.type === 'echarts') ctx.libImports.add(tag);
      else ctx.realtimeImports.add(tag);
      const seriesLike = node.type === 'chart' || node.type === 'uplot' || node.type === 'echarts';
      const rc = resolveChannelAttrs(node, ctx);
      // しきい値: 有限数のときだけ属性を出力(空欄=無効)
      const finite = (v: unknown): number | null => {
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string' && v.trim() !== '') {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        }
        return null;
      };
      const threshold = (key: string): string[] => {
        const v = finite(p(key));
        return v === null ? [] : [`${key}={${v}}`];
      };
      // lamp は単位/小数桁を表示に使わないので渡さない(props 上は任意)
      const showsValue = node.type !== 'lamp';
      const attrs = [
        `label={${s(p('label'))}}`,
        ...(showsValue ? [`unit={${s(p('unit'))}}`] : []),
        `source={${s(rc.source)}}`,
        `channel={${s(rc.channelKey)}}`,
        ...modbusAttrs(rc),
        `min={${rc.min}}`,
        `max={${rc.max}}`,
        `interval={${rc.interval}}`,
        ...(showsValue ? [`decimals={${num(p('decimals'))}}`] : []),
        // ECharts のみ: チャート種類(gauge / line / bar)
        ...(node.type === 'echarts' ? [`chartType={${s(p('chartType'))}}`] : []),
        // 時系列系(chart / uplot / echarts): 保持サンプル数
        ...(seriesLike ? [`capacity={${num(p('capacity'))}}`] : []),
        // しきい値アラート(設定時のみ)
        ...threshold('warnAbove'),
        ...threshold('critAbove'),
        ...threshold('warnBelow'),
        ...threshold('critBelow'),
      ].join(' ');
      return [`${pad}<${tag} ${attrs} />`];
    }
    case 'setpoint': {
      // 設定値の書き込み(FR-RT-05)。チャネルを書き込み先として解決する
      ctx.realtimeImports.add('Setpoint');
      const rc = resolveChannelAttrs(node, ctx);
      const attrs = [
        `label={${s(p('label'))}}`,
        `unit={${s(p('unit'))}}`,
        `value={${num(p('value'))}}`,
        `source={${s(rc.source)}}`,
        `channel={${s(rc.channelKey)}}`,
        ...modbusAttrs(rc),
        `writeLabel={${s(p('writeLabel'))}}`,
        `confirmMessage={${s(p('confirmMessage'))}}`,
      ].join(' ');
      return [`${pad}<Setpoint ${attrs} />`];
    }
    case 'aggrid': {
      // AG Grid データグリッド(外部ライブラリ、別ファイルから import)
      ctx.libImports.add('DataGrid');
      const attrs = [`columns={${s(p('columns'))}}`, `rows={${num(p('rows'))}}`].join(' ');
      return [`${pad}<DataGrid ${attrs} />`];
    }
    case 'disclosure': {
      if (ctx.uiKit.disclosure) {
        const e = ctx.uiKit.disclosure({ pad, titleExpr: s(p('title')), contentExpr: s(p('content')) });
        e.imports.forEach((i) => ctx.kitImports.add(i));
        return e.jsx;
      }
      return [
        `${pad}<details className="c-disclosure">`,
        `${pad}  <summary className="c-disclosure-summary">{${s(p('title'))}}</summary>`,
        `${pad}  <div className="c-disclosure-content">{${s(p('content'))}}</div>`,
        `${pad}</details>`,
      ];
    }
    case 'menu': {
      const items = String(p('items'))
        .split(',')
        .map((i) => i.trim())
        .filter(Boolean);
      if (ctx.uiKit.menu) {
        const e = ctx.uiKit.menu({ pad, labelExpr: s(p('label')), items });
        e.imports.forEach((i) => ctx.kitImports.add(i));
        return e.jsx;
      }
      return [
        `${pad}<details className="c-menu">`,
        `${pad}  <summary className="c-menu-button">{${s(p('label'))}}</summary>`,
        `${pad}  <ul className="c-menu-list">`,
        ...items.map((i) => `${pad}    <li className="c-menu-item">{${s(i)}}</li>`),
        `${pad}  </ul>`,
        `${pad}</details>`,
      ];
    }
    case 'switch': {
      const checked = p('checked') === true;
      if (ctx.uiKit.switch) {
        const e = ctx.uiKit.switch({ pad, labelExpr: s(p('label')), checked });
        e.imports.forEach((i) => ctx.kitImports.add(i));
        return e.jsx;
      }
      return [
        `${pad}<label className="c-switch">`,
        `${pad}  <input className="c-switch-input" type="checkbox" defaultChecked={${checked}} />`,
        `${pad}  <span className="c-switch-track" />`,
        `${pad}  <span className="c-switch-label">{${s(p('label'))}}</span>`,
        `${pad}</label>`,
      ];
    }
    case 'rating': {
      const max = num(p('max'));
      const v = Math.max(0, Math.min(max, num(p('value'))));
      if (ctx.uiKit.rating) {
        const e = ctx.uiKit.rating({ pad, labelExpr: s(p('label')), value: v, max });
        e.imports.forEach((i) => ctx.kitImports.add(i));
        return e.jsx;
      }
      const stars = '★'.repeat(v) + '☆'.repeat(Math.max(0, max - v));
      return [
        `${pad}<div className="c-rating"><span className="c-rating-label">{${s(p('label'))}}</span><span className="c-rating-stars">{${s(stars)}}</span></div>`,
      ];
    }
    case 'slider': {
      if (ctx.uiKit.slider) {
        const e = ctx.uiKit.slider({ pad, labelExpr: s(p('label')), value: num(p('value')), min: num(p('min')), max: num(p('max')) });
        e.imports.forEach((i) => ctx.kitImports.add(i));
        return e.jsx;
      }
      return [
        `${pad}<label className="c-slider"><span className="c-slider-label">{${s(p('label'))}}</span><input className="c-slider-input" type="range" min={${num(p('min'))}} max={${num(p('max'))}} defaultValue={${num(p('value'))}} /></label>`,
      ];
    }
    case 'chip': {
      if (ctx.uiKit.chip) {
        const e = ctx.uiKit.chip({ pad, labelExpr: s(p('label')), color: String(p('color')) });
        e.imports.forEach((i) => ctx.kitImports.add(i));
        return e.jsx;
      }
      return [`${pad}<span className="c-chip c-chip-${String(p('color'))}">{${s(p('label'))}}</span>`];
    }
    case 'tabs': {
      const tabs = String(p('tabs'))
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (ctx.uiKit.tabs) {
        const e = ctx.uiKit.tabs({ pad, tabs });
        e.imports.forEach((i) => ctx.kitImports.add(i));
        return e.jsx;
      }
      return [
        `${pad}<div className="c-tabs">`,
        ...tabs.flatMap((t) => [
          `${pad}  <div className="c-tab-section">`,
          `${pad}    <div className="c-tab-label">{${s(t)}}</div>`,
          `${pad}    <div className="c-tab-panel">{${s(`${t} の内容`)}}</div>`,
          `${pad}  </div>`,
        ]),
        `${pad}</div>`,
      ];
    }
    case 'alert': {
      if (ctx.uiKit.alert) {
        const e = ctx.uiKit.alert({ pad, messageExpr: s(p('message')), severity: String(p('severity')) });
        e.imports.forEach((i) => ctx.kitImports.add(i));
        return e.jsx;
      }
      return [`${pad}<div className="c-alert c-alert-${String(p('severity'))}">{${s(p('message'))}}</div>`];
    }
    case 'badge': {
      if (ctx.uiKit.badge) {
        const e = ctx.uiKit.badge({ pad, labelExpr: s(p('label')), count: num(p('count')), color: String(p('color')) });
        e.imports.forEach((i) => ctx.kitImports.add(i));
        return e.jsx;
      }
      return [
        `${pad}<span className="c-badge-wrap"><span className="c-badge-label">{${s(p('label'))}}</span><span className="c-badge c-badge-${String(p('color'))}">{${num(p('count'))}}</span></span>`,
      ];
    }
    case 'avatar': {
      if (ctx.uiKit.avatar) {
        const e = ctx.uiKit.avatar({ pad, labelExpr: s(p('label')) });
        e.imports.forEach((i) => ctx.kitImports.add(i));
        return e.jsx;
      }
      return [`${pad}<span className="c-avatar">{${s(p('label'))}}</span>`];
    }
    case 'combobox': {
      const options = String(p('options'))
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      // Headless UI は状態が要るので専用ラッパー(別ファイル)を参照
      if (ctx.uiKit.id === 'headless') {
        ctx.libImports.add('AppCombobox');
        return [`${pad}<AppCombobox options={${JSON.stringify(options)}} placeholder={${s(p('placeholder'))}} />`];
      }
      return [
        `${pad}<select className="c-combobox-input" defaultValue="">`,
        ...options.map((o) => `${pad}  <option value={${s(o)}}>{${s(o)}}</option>`),
        `${pad}</select>`,
      ];
    }
    case 'progress': {
      const v = Math.max(0, Math.min(100, num(p('value'))));
      if (ctx.uiKit.progress) {
        const e = ctx.uiKit.progress({ pad, labelExpr: s(p('label')), value: v });
        e.imports.forEach((i) => ctx.kitImports.add(i));
        return e.jsx;
      }
      return [
        `${pad}<div className="c-progress"><span className="c-progress-label">{${s(p('label'))}}({${v}}%)</span><div className="c-progress-track"><div className="c-progress-fill" style={{ width: ${JSON.stringify(`${v}%`)} }} /></div></div>`,
      ];
    }
    case 'searchfield': {
      const placeholder = String(p('placeholder'));
      if (ctx.uiKit.searchfield) {
        const e = ctx.uiKit.searchfield({ pad, labelExpr: s(p('label')), placeholderExpr: placeholder ? s(placeholder) : null });
        e.imports.forEach((i) => ctx.kitImports.add(i));
        return e.jsx;
      }
      return [
        `${pad}<label className="c-input">`,
        `${pad}  <span>{${s(p('label'))}}</span>`,
        `${pad}  <input type="search"${placeholder ? ` placeholder={${s(placeholder)}}` : ''} />`,
        `${pad}</label>`,
      ];
    }
  }
};

/** channelRef を登録簿で解決した実効データチャネル設定(なければ inline props) */
type ResolvedChannel = {
  source: string;
  channelKey: string;
  min: number;
  max: number;
  interval: number;
  host: string;
  unitId: number;
  register: number;
  scale: number;
};

const resolveChannelAttrs = (node: ComponentNode, ctx: EmitCtx): ResolvedChannel => {
  const def = componentDefs[node.type];
  const p = (key: string) => propOf(node, def, key);
  const ref = String(p('channelRef') ?? '');
  const ch = ref ? ctx.channels.find((c) => c.id === ref) : undefined;
  const rawSource = ch ? ch.source : String(p('source'));
  const source = rawSource === 'live' || rawSource === 'modbus' ? rawSource : 'mock';
  return {
    source,
    channelKey: ch ? ch.key : String(p('channel')),
    min: ch ? ch.min : num(p('min')),
    max: ch ? ch.max : num(p('max')),
    interval: ch ? ch.interval : num(p('interval')),
    host: ch ? (ch.host ?? '') : String(p('host')),
    unitId: ch ? (ch.unit ?? 1) : num(p('unit_id')),
    register: ch ? (ch.register ?? 0) : num(p('register')),
    scale: ch ? (ch.scale ?? 1) : num(p('scale')),
  };
};

/** Modbus/TCP のときだけ接続パラメータ属性を返す */
const modbusAttrs = (rc: ResolvedChannel): string[] =>
  rc.source === 'modbus'
    ? [`host={${s(rc.host)}}`, `unitId={${rc.unitId}}`, `register={${rc.register}}`, `scale={${rc.scale}}`]
    : [];

export type ComponentFileOptions = Readonly<{
  componentName: string;
  originalName: string;
  root: ComponentNode;
  names: NameTable;
  /** このコンポーネントファイルの src 相対パス(ui-slice への import 解決に使う) */
  filePath: string;
  /** データチャネル登録簿(channelRef 解決用。未指定なら inline props にフォールバック) */
  channels?: ReadonlyArray<DataChannelDef>;
  /** ページの画面サイズ inline style(`style={{ ... }}` の中身)。指定時は page-screen でラップ */
  screenStyle?: string;
  /** 選択中の UIライブラリ(kit)アダプタ。未指定なら plain(c-*) */
  uiKit?: ReactUiKit;
}>;

export const emitComponentFile = (opts: ComponentFileOptions): string => {
  const ctx: EmitCtx = {
    names: opts.names,
    handlers: [],
    handlerCount: 0,
    needsNavigate: false,
    needsDispatch: false,
    realtimeImports: new Set(),
    libImports: new Set(),
    uiKit: opts.uiKit ?? resolveReactKit('plain'),
    kitImports: new Set(),
    channels: opts.channels ?? [],
    usedActions: new Set(),
  };
  const inner = emitNode(opts.root, opts.screenStyle ? 5 : 4, ctx);
  const body = opts.screenStyle
    ? [`    <div className="page-screen" style={{ ${opts.screenStyle} }}>`, ...inner, '    </div>']
    : inner;

  const imports: string[] = [];
  if (ctx.needsDispatch) imports.push(`import { useDispatch } from 'react-redux';`);
  if (ctx.needsNavigate) imports.push(`import { useNavigate } from 'react-router';`);
  if (ctx.realtimeImports.size > 0) {
    const parts = [...ctx.realtimeImports].sort().join(', ');
    imports.push(`import { ${parts} } from '${relativeImport(opts.filePath, paths.realtimeRuntime)}';`);
  }
  // 外部ライブラリ製コンポーネントは各々の専用ファイルから import
  for (const tag of [...ctx.libImports].sort()) {
    imports.push(`import { ${tag} } from '${relativeImport(opts.filePath, paths.realtimeLib(tag))}';`);
  }
  // UIライブラリ(kit)の import 文(MUI 等)
  for (const line of [...ctx.kitImports].sort()) imports.push(line);
  if (ctx.usedActions.size > 0) {
    const actions = [...ctx.usedActions].sort().join(', ');
    imports.push(`import { ${actions} } from '${relativeImport(opts.filePath, paths.uiSlice)}';`);
  }

  const hooks: string[] = [];
  if (ctx.needsNavigate) hooks.push('  const navigate = useNavigate();');
  if (ctx.needsDispatch) hooks.push('  const dispatch = useDispatch();');

  const sections = [
    `// 自動生成ファイル — AppForge(元の名前: ${opts.originalName})`,
    imports.length > 0 ? imports.join('\n') : null,
    `export function ${opts.componentName}() {`,
    hooks.length > 0 ? hooks.join('\n') : null,
    ctx.handlers.length > 0 ? ctx.handlers.join('\n') : null,
    `  return (\n${body.join('\n')}\n  );`,
    `}`,
  ].filter((x): x is string => x !== null);

  return `${sections.join('\n\n')}\n`;
};
