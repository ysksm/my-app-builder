import { useEffect, useRef, useState } from 'react';
import {
  type FieldDef,
  type ModelDef,
  type ModelKind,
  type RelationDef,
  type RelationKind,
} from '@/domain/data-model';
import type { FieldId, ModelId } from '@/domain/ids';
import {
  dmFieldAdded,
  dmFieldRemoved,
  dmFieldUpdated,
  dmModelAdded,
  dmModelRemoved,
  dmModelUpdated,
  dmRelationAdded,
  dmRelationRemoved,
  modelSelected,
} from '../store/editor-slice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

const CARD_WIDTH = 280;
const ANCHOR_Y = 22;

const kindLabel: Record<ModelKind, string> = {
  aggregate: '集約',
  entity: 'エンティティ',
  valueObject: '値オブジェクト',
};

type PendingRelation = Readonly<{ from: ModelId; kind: RelationKind }>;
type DragPos = Readonly<{ id: ModelId; x: number; y: number }>;

/** DDD モデルを ER 図ライクに編集するキャンバス */
export function ModelDesigner() {
  const dispatch = useAppDispatch();
  const dataModel = useAppSelector((s) => s.editor.doc.dataModel);
  const selectedId = useAppSelector((s) => s.editor.selectedModelId);
  const [pending, setPending] = useState<PendingRelation | null>(null);
  const [dragPos, setDragPos] = useState<DragPos | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPending(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const posOf = (id: ModelId): { x: number; y: number } => {
    if (dragPos?.id === id) return { x: dragPos.x, y: dragPos.y };
    const m = dataModel.models.find((model) => model.id === id);
    return m ? { x: m.x, y: m.y } : { x: 0, y: 0 };
  };

  const addModel = (kind: ModelKind) => {
    const n = dataModel.models.length;
    dispatch(dmModelAdded({ kind, x: 60 + (n % 4) * 320, y: 60 + Math.floor(n / 4) * 280 }));
  };

  return (
    <div className="model-designer">
      <div className="model-toolbar">
        <button type="button" className="btn" onClick={() => addModel('aggregate')}>
          + 集約
        </button>
        <button type="button" className="btn" onClick={() => addModel('entity')}>
          + エンティティ
        </button>
        <button type="button" className="btn" onClick={() => addModel('valueObject')}>
          + 値オブジェクト
        </button>
        {pending && (
          <span className="pending-hint">
            関連({pending.kind === 'hasMany' ? '1:N' : '1:1'})の相手モデルをクリック — Esc で中止
          </span>
        )}
        {dataModel.models.length === 0 && (
          <span className="muted">モデルを追加して、フィールドと関連を定義してください</span>
        )}
      </div>
      <div
        className="model-canvas"
        onClick={() => {
          dispatch(modelSelected(null));
          setPending(null);
        }}
      >
        <svg className="relation-svg">
          {dataModel.relations.map((r) => {
            const from = posOf(r.from);
            const to = posOf(r.to);
            const x1 = from.x + CARD_WIDTH;
            const y1 = from.y + ANCHOR_Y;
            const x2 = to.x;
            const y2 = to.y + ANCHOR_Y;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={r.id}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                className="relation-path"
              />
            );
          })}
        </svg>
        {dataModel.relations.map((r) => (
          <RelationLabel key={r.id} relation={r} posOf={posOf} models={dataModel.models} />
        ))}
        {dataModel.models.map((m) => (
          <ModelCard
            key={m.id}
            model={m}
            selected={selectedId === m.id}
            pending={pending}
            dragPos={dragPos?.id === m.id ? dragPos : null}
            onPending={setPending}
            onDrag={setDragPos}
          />
        ))}
      </div>
    </div>
  );
}

function RelationLabel({
  relation,
  posOf,
  models,
}: {
  relation: RelationDef;
  posOf: (id: ModelId) => { x: number; y: number };
  models: ReadonlyArray<ModelDef>;
}) {
  const dispatch = useAppDispatch();
  const from = posOf(relation.from);
  const to = posOf(relation.to);
  const x = (from.x + CARD_WIDTH + to.x) / 2;
  const y = (from.y + ANCHOR_Y + to.y + ANCHOR_Y) / 2;
  const toName = models.find((m) => m.id === relation.to)?.name ?? '?';
  return (
    <div className="relation-label" style={{ left: x, top: y }}>
      {relation.name}: {toName}
      {relation.kind === 'hasMany' ? '[]' : ''}
      <button
        type="button"
        className="icon-btn"
        title="関連を削除"
        onClick={(e) => {
          e.stopPropagation();
          dispatch(dmRelationRemoved({ relationId: relation.id }));
        }}
      >
        ✕
      </button>
    </div>
  );
}

function ModelCard({
  model,
  selected,
  pending,
  dragPos,
  onPending,
  onDrag,
}: {
  model: ModelDef;
  selected: boolean;
  pending: PendingRelation | null;
  dragPos: DragPos | null;
  onPending: (p: PendingRelation | null) => void;
  onDrag: (p: DragPos | null) => void;
}) {
  const dispatch = useAppDispatch();
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null,
  );

  const x = dragPos?.x ?? model.x;
  const y = dragPos?.y ?? model.y;

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pending && pending.from !== model.id) {
      dispatch(dmRelationAdded({ from: pending.from, to: model.id, kind: pending.kind }));
      onPending(null);
      return;
    }
    dispatch(modelSelected(model.id));
  };

  return (
    <div
      className={`model-card kind-${model.kind}${selected ? ' selected' : ''}${pending && pending.from !== model.id ? ' relation-target' : ''}`}
      style={{ left: x, top: y, width: CARD_WIDTH }}
      onClick={handleCardClick}
    >
      <div
        className="model-card-head"
        onPointerDown={(e) => {
          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          dragRef.current = { startX: e.clientX, startY: e.clientY, origX: model.x, origY: model.y };
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return;
          onDrag({
            id: model.id,
            x: Math.max(0, dragRef.current.origX + e.clientX - dragRef.current.startX),
            y: Math.max(0, dragRef.current.origY + e.clientY - dragRef.current.startY),
          });
        }}
        onPointerUp={(e) => {
          if (!dragRef.current) return;
          const finalX = Math.max(0, dragRef.current.origX + e.clientX - dragRef.current.startX);
          const finalY = Math.max(0, dragRef.current.origY + e.clientY - dragRef.current.startY);
          dragRef.current = null;
          onDrag(null);
          if (finalX !== model.x || finalY !== model.y) {
            dispatch(dmModelUpdated({ modelId: model.id, patch: { x: finalX, y: finalY } }));
          }
        }}
      >
        <span className={`kind-badge kind-${model.kind}`}>{kindLabel[model.kind]}</span>
        <input
          key={model.name}
          className="model-name"
          type="text"
          defaultValue={model.name}
          onBlur={(e) => {
            if (e.target.value !== model.name) {
              dispatch(dmModelUpdated({ modelId: model.id, patch: { name: e.target.value } }));
            }
          }}
        />
        <button
          type="button"
          className="icon-btn"
          title="モデルを削除"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`モデル「${model.name}」を削除しますか?`)) {
              dispatch(dmModelRemoved({ modelId: model.id }));
            }
          }}
        >
          ✕
        </button>
      </div>

      <div className="model-fields">
        {model.fields.map((f) => (
          <FieldRow key={f.id} modelId={model.id} field={f} />
        ))}
        {model.fields.length === 0 && <p className="muted small-note">フィールドがありません</p>}
      </div>

      <div className="model-card-actions">
        <button
          type="button"
          className="btn"
          onClick={(e) => {
            e.stopPropagation();
            dispatch(dmFieldAdded({ modelId: model.id }));
          }}
        >
          + フィールド
        </button>
        <button
          type="button"
          className="btn"
          title="このモデルから 1:1 の関連を引く"
          onClick={(e) => {
            e.stopPropagation();
            onPending({ from: model.id, kind: 'hasOne' });
          }}
        >
          関連 1:1
        </button>
        <button
          type="button"
          className="btn"
          title="このモデルから 1:N の関連を引く"
          onClick={(e) => {
            e.stopPropagation();
            onPending({ from: model.id, kind: 'hasMany' });
          }}
        >
          関連 1:N
        </button>
      </div>
    </div>
  );
}

function FieldRow({ modelId, field }: { modelId: ModelId; field: FieldDef }) {
  const dispatch = useAppDispatch();
  const [expanded, setExpanded] = useState(false);
  const update = (patch: Partial<Omit<FieldDef, 'id'>>) =>
    dispatch(dmFieldUpdated({ modelId, fieldId: field.id as FieldId, patch }));

  return (
    <div className="field-row-wrap">
      <div className="field-row">
        <input
          key={field.name}
          type="text"
          className="field-name"
          defaultValue={field.name}
          onBlur={(e) => {
            if (e.target.value !== field.name) update({ name: e.target.value });
          }}
        />
        <select
          value={field.type}
          onChange={(e) => update({ type: e.target.value as FieldDef['type'] })}
        >
          <option value="string">string</option>
          <option value="number">number</option>
          <option value="boolean">boolean</option>
          <option value="date">date</option>
        </select>
        <label className="req" title="必須">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => update({ required: e.target.checked })}
          />
          必須
        </label>
        <button
          type="button"
          className={`icon-btn${expanded ? ' on' : ''}`}
          title="制約を編集"
          onClick={() => setExpanded((v) => !v)}
        >
          ⚙
        </button>
        <button
          type="button"
          className="icon-btn"
          title="フィールドを削除"
          onClick={() => dispatch(dmFieldRemoved({ modelId, fieldId: field.id }))}
        >
          ✕
        </button>
      </div>
      {expanded && (field.type === 'string' || field.type === 'number') && (
        <div className="field-constraints">
          <label>
            {field.type === 'string' ? '最小長' : '最小'}
            <input
              type="number"
              value={field.min ?? ''}
              onChange={(e) =>
                update({ min: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </label>
          <label>
            {field.type === 'string' ? '最大長' : '最大'}
            <input
              type="number"
              value={field.max ?? ''}
              onChange={(e) =>
                update({ max: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </label>
          {field.type === 'string' && (
            <label>
              正規表現
              <input
                type="text"
                value={field.pattern ?? ''}
                onChange={(e) => update({ pattern: e.target.value === '' ? null : e.target.value })}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
