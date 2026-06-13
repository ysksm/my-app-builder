import type { EventBinding } from '@/domain/actions';
import type { ComponentNode } from '@/domain/component-node';
import { componentDefs, propValueOf, type ComponentDef } from '@/domain/catalog/component-defs';
import type { NameTable } from './identifiers';
import { paths, relativeImport } from './layout';

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
  // リアルタイム部品の import 名(Metric / Gauge / Lamp)。すべて同一モジュールから
  readonly realtimeImports: Set<string>;
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
      return [
        `${pad}<button type="button" className="c-button v-${variant}"${onClick}>{${s(p('label'))}}</button>`,
      ];
    }
    case 'input': {
      const placeholder = String(p('placeholder'));
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
    case 'chart': {
      // metric / gauge / lamp / chart は同じデータチャネル属性を共有(コンポーネント名のみ異なる)
      const tag =
        node.type === 'gauge'
          ? 'Gauge'
          : node.type === 'lamp'
            ? 'Lamp'
            : node.type === 'chart'
              ? 'Chart'
              : 'Metric';
      ctx.realtimeImports.add(tag);
      const raw = String(p('source'));
      const source = raw === 'live' || raw === 'modbus' ? raw : 'mock';
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
        `source={${s(source)}}`,
        `channel={${s(p('channel'))}}`,
        // Modbus/TCP のときだけ接続パラメータを渡す
        ...(source === 'modbus'
          ? [
              `host={${s(p('host'))}}`,
              `unitId={${num(p('unit_id'))}}`,
              `register={${num(p('register'))}}`,
              `scale={${num(p('scale'))}}`,
            ]
          : []),
        `min={${num(p('min'))}}`,
        `max={${num(p('max'))}}`,
        `interval={${num(p('interval'))}}`,
        ...(showsValue ? [`decimals={${num(p('decimals'))}}`] : []),
        // チャートのみ: 保持サンプル数
        ...(node.type === 'chart' ? [`capacity={${num(p('capacity'))}}`] : []),
        // しきい値アラート(設定時のみ)
        ...threshold('warnAbove'),
        ...threshold('critAbove'),
        ...threshold('warnBelow'),
        ...threshold('critBelow'),
      ].join(' ');
      return [`${pad}<${tag} ${attrs} />`];
    }
  }
};

export type ComponentFileOptions = Readonly<{
  componentName: string;
  originalName: string;
  root: ComponentNode;
  names: NameTable;
  /** このコンポーネントファイルの src 相対パス(ui-slice への import 解決に使う) */
  filePath: string;
}>;

export const emitComponentFile = (opts: ComponentFileOptions): string => {
  const ctx: EmitCtx = {
    names: opts.names,
    handlers: [],
    handlerCount: 0,
    needsNavigate: false,
    needsDispatch: false,
    realtimeImports: new Set(),
    usedActions: new Set(),
  };
  const body = emitNode(opts.root, 4, ctx);

  const imports: string[] = [];
  if (ctx.needsDispatch) imports.push(`import { useDispatch } from 'react-redux';`);
  if (ctx.needsNavigate) imports.push(`import { useNavigate } from 'react-router';`);
  if (ctx.realtimeImports.size > 0) {
    const parts = [...ctx.realtimeImports].sort().join(', ');
    imports.push(`import { ${parts} } from '${relativeImport(opts.filePath, paths.realtimeRuntime)}';`);
  }
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
