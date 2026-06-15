import type { Action, EventBinding } from '@/domain/actions';
import { ComponentNode, type PropValue } from '@/domain/component-node';
import { DialogId } from '@/domain/ids';
import { ProjectDoc } from '@/domain/project-doc';
import { componentDefs, propValueOf, type ComponentDef, type PropFieldDef } from '@/domain/catalog/component-defs';
import { customPartDefined, nodeEventsSet, nodePropsUpdated, nodeRemoved } from '../store/editor-slice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

export function PropertyPanel() {
  const doc = useAppSelector((s) => s.editor.doc);
  const target = useAppSelector((s) => s.editor.editTarget);
  const selectedId = useAppSelector((s) => s.editor.selectedNodeId);
  const tree = ProjectDoc.getTree(doc, target);
  const node = tree && selectedId ? ComponentNode.find(tree, selectedId) : null;

  if (!tree || !node) {
    return (
      <section className="panel-section prop-panel">
        <h3>プロパティ</h3>
        <p className="muted">キャンバスでパーツを選択してください</p>
      </section>
    );
  }
  return <SelectedNodePanel node={node} isRoot={node.id === tree.id} />;
}

function SelectedNodePanel({ node, isRoot }: { node: ComponentNode; isRoot: boolean }) {
  const dispatch = useAppDispatch();
  const def = componentDefs[node.type];
  return (
    <section className="panel-section prop-panel">
      <h3>プロパティ — {def.label}</h3>
      {def.propFields.map((field) => (
        <PropField key={field.key} node={node} def={def} field={field} />
      ))}
      {def.supportsEvents && <EventEditor node={node} />}
      {!isRoot && (
        <>
          <button
            type="button"
            className="btn"
            style={{ width: '100%', marginTop: 14 }}
            onClick={() => {
              const name = window.prompt('パーツ名を入力', def.label);
              if (name !== null) dispatch(customPartDefined({ nodeId: node.id, name }));
            }}
          >
            ＋ 選択をパーツ登録
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => dispatch(nodeRemoved({ nodeId: node.id }))}
          >
            このパーツを削除
          </button>
        </>
      )}
    </section>
  );
}

function PropField({
  node,
  def,
  field,
}: {
  node: ComponentNode;
  def: ComponentDef;
  field: PropFieldDef;
}) {
  const dispatch = useAppDispatch();
  const channels = useAppSelector((s) => s.editor.doc.channels);
  const value = propValueOf(node.props, def, field.key);
  const set = (v: PropValue) =>
    dispatch(nodePropsUpdated({ nodeId: node.id, patch: { [field.key]: v } }));

  // データチャネル参照: 登録簿のチャネルから選ぶ(空 = 部品の直接指定にフォールバック)
  if (field.key === 'channelRef') {
    return (
      <label className="field">
        <span>{field.label}</span>
        <select value={String(value)} onChange={(e) => set(e.target.value)}>
          <option value="">(直接指定)</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  switch (field.input) {
    case 'number':
      return (
        <label className="field">
          <span>{field.label}</span>
          <input type="number" value={Number(value)} onChange={(e) => set(Number(e.target.value))} />
        </label>
      );
    case 'select':
      return (
        <label className="field">
          <span>{field.label}</span>
          <select value={String(value)} onChange={(e) => set(e.target.value)}>
            {(field.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
    case 'checkbox':
      return (
        <label className="field row">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(e.target.checked)} />
          <span>{field.label}</span>
        </label>
      );
    case 'textarea':
      return (
        <label className="field">
          <span>{field.label}</span>
          <textarea value={String(value)} rows={3} onChange={(e) => set(e.target.value)} />
        </label>
      );
    default:
      return (
        <label className="field">
          <span>{field.label}</span>
          <input type="text" value={String(value)} onChange={(e) => set(e.target.value)} />
        </label>
      );
  }
}

const defaultActionOf = (kind: Action['kind'], doc: ProjectDoc): Action => {
  switch (kind) {
    case 'navigate':
      return { kind: 'navigate', pageId: doc.pages[0]!.id };
    case 'openDialog':
      return { kind: 'openDialog', dialogId: doc.dialogs[0]?.id ?? DialogId.from('') };
    case 'closeDialog':
      return { kind: 'closeDialog' };
    case 'showToast':
      return { kind: 'showToast', message: 'メッセージ' };
    case 'openUrl':
      return { kind: 'openUrl', url: 'https://example.com' };
  }
};

function EventEditor({ node }: { node: ComponentNode }) {
  const dispatch = useAppDispatch();
  const doc = useAppSelector((s) => s.editor.doc);
  const setEvents = (events: ReadonlyArray<EventBinding>) =>
    dispatch(nodeEventsSet({ nodeId: node.id, events }));
  const updateAction = (index: number, action: Action) =>
    setEvents(node.events.map((b, i) => (i === index ? { ...b, action } : b)));

  return (
    <div className="event-editor">
      <h4>イベント(クリック時)</h4>
      {node.events.length === 0 && <p className="muted">アクションがありません</p>}
      {node.events.map((binding, i) => (
        <div key={i} className="event-row">
          <select
            value={binding.action.kind}
            onChange={(e) => updateAction(i, defaultActionOf(e.target.value as Action['kind'], doc))}
          >
            <option value="navigate">ページ遷移</option>
            <option value="openDialog">ダイアログを開く</option>
            <option value="closeDialog">ダイアログを閉じる</option>
            <option value="showToast">トースト表示</option>
            <option value="openUrl">外部URLを開く</option>
          </select>
          <ActionParams action={binding.action} doc={doc} onChange={(a) => updateAction(i, a)} />
          <button
            type="button"
            className="icon-btn"
            onClick={() => setEvents(node.events.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() =>
          setEvents([...node.events, { event: 'onClick', action: defaultActionOf('navigate', doc) }])
        }
      >
        + アクション追加
      </button>
    </div>
  );
}

function ActionParams({
  action,
  doc,
  onChange,
}: {
  action: Action;
  doc: ProjectDoc;
  onChange: (action: Action) => void;
}) {
  switch (action.kind) {
    case 'navigate':
      return (
        <select
          value={action.pageId}
          onChange={(e) =>
            onChange({ kind: 'navigate', pageId: doc.pages.find((p) => p.id === e.target.value)!.id })
          }
        >
          {doc.pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      );
    case 'openDialog':
      if (doc.dialogs.length === 0) return <span className="muted">ダイアログ未作成</span>;
      return (
        <select
          value={action.dialogId}
          onChange={(e) => onChange({ kind: 'openDialog', dialogId: DialogId.from(e.target.value) })}
        >
          {doc.dialogs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
      );
    case 'showToast':
      return (
        <input
          type="text"
          value={action.message}
          onChange={(e) => onChange({ kind: 'showToast', message: e.target.value })}
        />
      );
    case 'openUrl':
      return (
        <input
          type="text"
          value={action.url}
          placeholder="https://…"
          onChange={(e) => onChange({ kind: 'openUrl', url: e.target.value })}
        />
      );
    case 'closeDialog':
      return null;
  }
}
