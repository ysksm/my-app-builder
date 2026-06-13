import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { EventBinding, EventType } from '@/domain/actions';
import type { ComponentNode, PropValue } from '@/domain/component-node';
import type { NodeId } from '@/domain/ids';
import { componentDefs, propValueOf, type ComponentDef } from '@/domain/catalog/component-defs';
import { DragPayload, useEditInteraction } from '../editor/edit-interaction';

export type RenderMode = 'edit' | 'preview';

/** プレビュー時にイベントバインディングを解釈する実行系。編集時は未提供 */
export type ActionRunner = Readonly<{
  run: (events: ReadonlyArray<EventBinding>, event: EventType) => void;
}>;

export const ActionRunnerContext = createContext<ActionRunner | null>(null);

const str = (v: PropValue): string => String(v);
const num = (v: PropValue): number => (typeof v === 'number' ? v : Number(v) || 0);

const propOf = (node: ComponentNode, def: ComponentDef, key: string): PropValue =>
  propValueOf(node.props, def, key);

/** ComponentNode 1 ノードの見た目。編集キャンバスとプレビューで共用する */
export function NodeBody({ node, mode }: { node: ComponentNode; mode: RenderMode }) {
  const def = componentDefs[node.type];
  const p = (key: string) => propOf(node, def, key);

  switch (node.type) {
    case 'container': {
      const direction = str(p('direction')) === 'row' ? 'row' : 'column';
      const style: CSSProperties = {
        display: 'flex',
        flexDirection: direction,
        gap: num(p('gap')),
        padding: num(p('padding')),
        background: str(p('background')) || undefined,
      };
      return (
        <div className="c-container" data-direction={direction} style={style}>
          <Children node={node} mode={mode} />
        </div>
      );
    }
    case 'heading': {
      const text = str(p('text'));
      const level = num(p('level'));
      if (level === 1) return <h1 className="c-heading">{text}</h1>;
      if (level === 3) return <h3 className="c-heading">{text}</h3>;
      return <h2 className="c-heading">{text}</h2>;
    }
    case 'text':
      return <p className="c-text">{str(p('text'))}</p>;
    case 'button':
      return <ButtonView node={node} mode={mode} />;
    case 'input':
      return (
        <label className="c-input">
          <span>{str(p('label'))}</span>
          <input
            type={str(p('inputType'))}
            placeholder={str(p('placeholder'))}
            readOnly={mode === 'edit'}
          />
        </label>
      );
    case 'image':
      return (
        <img
          className="c-image"
          src={str(p('src'))}
          width={num(p('width')) || undefined}
          draggable={false}
          alt=""
        />
      );
    case 'table': {
      const cols = str(p('columns'))
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const rows = Math.max(0, Math.min(20, num(p('rows'))));
      return (
        <table className="c-table">
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                {cols.map((_, c) => (
                  <td key={c}>—</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case 'header':
      return (
        <header className="c-header">
          <strong className="c-header-title">{str(p('title'))}</strong>
          <div className="c-header-actions">
            <Children node={node} mode={mode} />
          </div>
        </header>
      );
    case 'footer':
      return <footer className="c-footer">{str(p('text'))}</footer>;
    case 'metric':
      return <MetricView node={node} mode={mode} />;
  }
}

/** リアルタイム数値カード。preview では模擬データでライブ更新、edit では静的表示 */
function MetricView({ node, mode }: { node: ComponentNode; mode: RenderMode }) {
  const def = componentDefs.metric;
  const p = (key: string) => propOf(node, def, key);
  const min = num(p('min'));
  const max = num(p('max'));
  const interval = num(p('interval'));
  const decimals = num(p('decimals'));
  const value = useMockMetric(min, max, interval, mode === 'preview');
  return (
    <div className="c-metric">
      <span className="c-metric-label">{str(p('label'))}</span>
      <span className="c-metric-value">
        {value === null ? '—' : value.toFixed(decimals)}
        <span className="c-metric-unit">{str(p('unit'))}</span>
      </span>
    </div>
  );
}

/** 模擬データジェネレータ(FR-RT-03)。active のとき [min,max] を interval ごとに生成 */
function useMockMetric(min: number, max: number, interval: number, active: boolean): number | null {
  const [value, setValue] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const tick = () => setValue(min + Math.random() * (max - min));
    tick();
    const id = setInterval(tick, Math.max(200, interval));
    return () => clearInterval(id);
  }, [min, max, interval, active]);
  return value;
}

function ButtonView({ node, mode }: { node: ComponentNode; mode: RenderMode }) {
  const def = componentDefs.button;
  const runner = useContext(ActionRunnerContext);
  const handleClick =
    mode === 'preview' && runner ? () => runner.run(node.events, 'onClick') : undefined;
  return (
    <button
      type="button"
      className={`c-button v-${str(propOf(node, def, 'variant'))}`}
      onClick={handleClick}
    >
      {str(propOf(node, def, 'label'))}
    </button>
  );
}

function Children({ node, mode }: { node: ComponentNode; mode: RenderMode }) {
  if (!componentDefs[node.type].acceptsChildren) return null;
  if (mode === 'preview') {
    return (
      <>
        {node.children.map((c) => (
          <NodeBody key={c.id} node={c} mode="preview" />
        ))}
      </>
    );
  }
  return <EditChildren node={node} />;
}

/** 編集モードの子要素描画: 各子をドラッグ可能にし、間にドロップゾーンを挟む */
function EditChildren({ node }: { node: ComponentNode }) {
  if (node.children.length === 0) {
    return <DropArea parentId={node.id} index={0} label="ここにドロップ" className="drop-empty" />;
  }
  return (
    <>
      <DropArea parentId={node.id} index={0} className="dropzone" />
      {node.children.map((c, i) => (
        <Fragment key={c.id}>
          <EditNodeView node={c} />
          <DropArea parentId={node.id} index={i + 1} className="dropzone" />
        </Fragment>
      ))}
    </>
  );
}

export function EditNodeView({ node }: { node: ComponentNode }) {
  const ctx = useEditInteraction();
  const def = componentDefs[node.type];
  const selected = ctx.selectedId === node.id;
  return (
    <div
      className={`enode${selected ? ' selected' : ''}`}
      draggable
      onClick={(e) => {
        e.stopPropagation();
        ctx.onSelect(node.id);
      }}
      onDragStart={(e) => {
        e.stopPropagation();
        DragPayload.write(e, { kind: 'move', nodeId: node.id });
        ctx.onDragStart();
      }}
      onDragEnd={ctx.onDragEnd}
    >
      <span className="enode-tag">{def.label}</span>
      <NodeBody node={node} mode="edit" />
    </div>
  );
}

function DropArea({
  parentId,
  index,
  className,
  label,
}: {
  parentId: NodeId;
  index: number;
  className: string;
  label?: string;
}) {
  const ctx = useEditInteraction();
  const [over, setOver] = useState(false);
  return (
    <div
      className={`${className}${ctx.dragging ? ' active' : ''}${over ? ' over' : ''}`}
      onDragOver={(e) => {
        if (!DragPayload.isPresent(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const payload = DragPayload.read(e);
        if (payload) ctx.onDrop(parentId, index, payload);
      }}
    >
      {label ?? null}
    </div>
  );
}

/** 編集対象の木のルート。ドラッグ不可・クリックで選択のみ */
export function EditRootView({ tree }: { tree: ComponentNode }) {
  const ctx = useEditInteraction();
  const selected = ctx.selectedId === tree.id;
  return (
    <div
      className={`enode-root${selected ? ' selected' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        ctx.onSelect(tree.id);
      }}
    >
      <NodeBody node={tree} mode="edit" />
    </div>
  );
}

export function nodeSummaryLabel(node: ComponentNode): ReactNode {
  const def = componentDefs[node.type];
  const text = node.props['text'] ?? node.props['label'] ?? node.props['title'] ?? '';
  const snippet = String(text).slice(0, 12);
  return snippet ? `${def.label}「${snippet}」` : def.label;
}
