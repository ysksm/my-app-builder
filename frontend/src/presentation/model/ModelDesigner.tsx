import { useEffect, useRef, useState } from 'react';
import {
  type FieldDef,
  type ModelDef,
  type ModelKind,
  type RelationDef,
  type RelationKind,
  type RuleOp,
  type ServiceReturn,
  type UsecaseDef,
  type UsecaseGuard,
} from '@/domain/data-model';
import type { FieldId, ModelId, RuleId, ServiceId, UsecaseId } from '@/domain/ids';
import {
  dmFieldAdded,
  dmFieldRemoved,
  dmFieldUpdated,
  dmModelAdded,
  dmModelRemoved,
  dmModelUpdated,
  dmRelationAdded,
  dmRelationRemoved,
  dmRuleAdded,
  dmRuleRemoved,
  dmRuleUpdated,
  dmServiceAdded,
  dmServiceRemoved,
  dmServiceUpdated,
  dmUsecaseAdded,
  dmUsecaseRemoved,
  dmUsecaseUpdated,
  modelSelected,
} from '../store/editor-slice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

const OP_LABEL: Record<RuleOp, string> = {
  eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤',
};

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

      {(model.kind === 'aggregate' || model.kind === 'entity') && model.fields.length >= 1 && (
        <RulesSection model={model} />
      )}

      {model.kind === 'aggregate' && <ServicesSection model={model} />}

      {model.kind === 'aggregate' && model.fields.length >= 1 && <UsecasesSection model={model} />}

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

/** クロスフィールドルール編集(left op right + メッセージ)。生成コードの validate に展開される */
function RulesSection({ model }: { model: ModelDef }) {
  const dispatch = useAppDispatch();
  const fields = model.fields;
  const fieldName = (idValue: string) => fields.find((f) => f.id === idValue)?.name ?? '?';

  const addRule = () => {
    const left = fields[0]!.id;
    const right =
      fields.length >= 2
        ? ({ kind: 'field', fieldId: fields[1]!.id } as const)
        : ({ kind: 'literal', value: 0 } as const);
    dispatch(dmRuleAdded({ modelId: model.id, left, op: 'gte', right, message: '条件を満たしません' }));
  };

  return (
    <div className="rules-section">
      <div className="rules-head">ルール(検証)</div>
      {model.rules.map((rule) => (
        <div key={rule.id} className="rule-row">
          <select
            value={rule.left}
            onChange={(e) =>
              dispatch(dmRuleUpdated({ modelId: model.id, ruleId: rule.id as RuleId, patch: { left: e.target.value as FieldId } }))
            }
          >
            {fields.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <select
            value={rule.op}
            onChange={(e) =>
              dispatch(dmRuleUpdated({ modelId: model.id, ruleId: rule.id as RuleId, patch: { op: e.target.value as RuleOp } }))
            }
          >
            {(Object.keys(OP_LABEL) as RuleOp[]).map((op) => (
              <option key={op} value={op}>{OP_LABEL[op]}</option>
            ))}
          </select>
          {rule.right.kind === 'field' ? (
            <select
              value={rule.right.fieldId}
              onChange={(e) =>
                dispatch(dmRuleUpdated({ modelId: model.id, ruleId: rule.id as RuleId, patch: { right: { kind: 'field', fieldId: e.target.value as FieldId } } }))
              }
            >
              {fields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              className="rule-literal"
              defaultValue={String(rule.right.value)}
              title="リテラル値"
              onBlur={(e) => {
                const raw = e.target.value;
                const num = Number(raw);
                const value = raw !== '' && !Number.isNaN(num) ? num : raw;
                dispatch(dmRuleUpdated({ modelId: model.id, ruleId: rule.id as RuleId, patch: { right: { kind: 'literal', value } } }));
              }}
            />
          )}
          <button
            type="button"
            className="icon-btn"
            title={rule.right.kind === 'field' ? 'リテラルに切替' : 'フィールド参照に切替'}
            onClick={() =>
              dispatch(
                dmRuleUpdated({
                  modelId: model.id,
                  ruleId: rule.id as RuleId,
                  patch: {
                    right:
                      rule.right.kind === 'field'
                        ? { kind: 'literal', value: 0 }
                        : { kind: 'field', fieldId: fields[0]!.id },
                  },
                }),
              )
            }
          >
            ⇄
          </button>
          <input
            type="text"
            className="rule-message"
            defaultValue={rule.message}
            title="エラーメッセージ"
            onBlur={(e) =>
              dispatch(dmRuleUpdated({ modelId: model.id, ruleId: rule.id as RuleId, patch: { message: e.target.value } }))
            }
          />
          <button
            type="button"
            className="icon-btn"
            title="ルール削除"
            onClick={() => dispatch(dmRuleRemoved({ modelId: model.id, ruleId: rule.id as RuleId }))}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn rule-add" onClick={addRule}>
        + ルール
      </button>
      {model.rules.length > 0 && (
        <p className="rule-hint muted">
          {model.rules
            .map((r) => `${fieldName(r.left)} ${OP_LABEL[r.op]} ${r.right.kind === 'field' ? fieldName(r.right.fieldId) : r.right.value}`)
            .join(' / ')}
        </p>
      )}
    </div>
  );
}

/** ドメインサービス契約の編集(名前・戻り値)。契約は生成、実装は保護コードに手書き(FR-LOGIC-03) */
function ServicesSection({ model }: { model: ModelDef }) {
  const dispatch = useAppDispatch();
  return (
    <div className="rules-section">
      <div className="rules-head">ドメインサービス(契約)</div>
      {model.services.map((service) => (
        <div key={service.id} className="rule-row">
          <input
            key={service.name}
            type="text"
            className="rule-message"
            defaultValue={service.name}
            title="サービス名(camelCase)"
            onBlur={(e) => {
              if (e.target.value !== service.name) {
                dispatch(dmServiceUpdated({ modelId: model.id, serviceId: service.id as ServiceId, patch: { name: e.target.value } }));
              }
            }}
          />
          <span className="muted" style={{ fontSize: 11 }}>→</span>
          <select
            value={service.returns}
            title="戻り値の型"
            onChange={(e) =>
              dispatch(dmServiceUpdated({ modelId: model.id, serviceId: service.id as ServiceId, patch: { returns: e.target.value as ServiceReturn } }))
            }
          >
            <option value="self">自身</option>
            <option value="boolean">boolean</option>
            <option value="number">number</option>
            <option value="string">string</option>
            <option value="void">void</option>
          </select>
          <button
            type="button"
            className="icon-btn"
            title="サービス削除"
            onClick={() => dispatch(dmServiceRemoved({ modelId: model.id, serviceId: service.id as ServiceId }))}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn rule-add" onClick={() => dispatch(dmServiceAdded({ modelId: model.id }))}>
        + サービス
      </button>
      {model.services.length > 0 && (
        <p className="rule-hint muted">契約を生成し、実装は *.impl.ts(再生成で保持)に手書きします</p>
      )}
    </div>
  );
}

/** ユースケース編集(名前 + 適用サービス + save)。application 層の読める関数に生成される */
function UsecasesSection({ model }: { model: ModelDef }) {
  const dispatch = useAppDispatch();
  const eligible = model.services.filter((s) => s.returns === 'self' && s.params.length === 0);

  return (
    <div className="rules-section">
      <div className="rules-head">ユースケース(フロー)</div>
      {model.usecases.map((uc) => (
        <div key={uc.id} className="usecase-block">
          <div className="rule-row">
            <input
              key={uc.name}
              type="text"
              className="rule-message"
              defaultValue={uc.name}
              title="ユースケース名(camelCase)"
              onBlur={(e) => {
                if (e.target.value !== uc.name) {
                  dispatch(dmUsecaseUpdated({ modelId: model.id, usecaseId: uc.id as UsecaseId, patch: { name: e.target.value } }));
                }
              }}
            />
            <label className="req" title="repository に保存する">
              <input
                type="checkbox"
                checked={uc.save}
                onChange={(e) => dispatch(dmUsecaseUpdated({ modelId: model.id, usecaseId: uc.id as UsecaseId, patch: { save: e.target.checked } }))}
              />
              save
            </label>
            <button
              type="button"
              className="icon-btn"
              title="ユースケース削除"
              onClick={() => dispatch(dmUsecaseRemoved({ modelId: model.id, usecaseId: uc.id as UsecaseId }))}
            >
              ✕
            </button>
          </div>
          <p className="rule-hint muted">
            create → {uc.serviceIds.map((sid) => eligible.find((s) => s.id === sid)?.name ?? '?').join(' → ')}
            {uc.serviceIds.length > 0 ? ' → ' : ''}
            {uc.save ? 'save' : 'return'}
          </p>
          {eligible.length > 0 && (
            <div className="usecase-services">
              {eligible.map((s) => {
                const on = uc.serviceIds.includes(s.id);
                return (
                  <label key={s.id} className="req" title="self 返却・無引数サービスを適用">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...uc.serviceIds, s.id]
                          : uc.serviceIds.filter((x) => x !== s.id);
                        dispatch(dmUsecaseUpdated({ modelId: model.id, usecaseId: uc.id as UsecaseId, patch: { serviceIds: next } }));
                      }}
                    />
                    {s.name}
                  </label>
                );
              })}
            </div>
          )}
          <UsecaseGuardEditor model={model} uc={uc} />
        </div>
      ))}
      <button type="button" className="btn rule-add" onClick={() => dispatch(dmUsecaseAdded({ modelId: model.id }))}>
        + ユースケース
      </button>
    </div>
  );
}

const GUARD_OPS: ReadonlyArray<{ v: RuleOp; l: string }> = [
  { v: 'eq', l: '=' }, { v: 'neq', l: '≠' }, { v: 'gt', l: '>' }, { v: 'gte', l: '≥' }, { v: 'lt', l: '<' }, { v: 'lte', l: '≤' },
];

/** ユースケースの事前条件(状態遷移ガード)。リテラル比較で「条件を満たすときのみ実行」 */
function UsecaseGuardEditor({ model, uc }: { model: ModelDef; uc: UsecaseDef }) {
  const dispatch = useAppDispatch();
  const g = uc.guard;
  const setGuard = (guard: UsecaseGuard | null) =>
    dispatch(dmUsecaseUpdated({ modelId: model.id, usecaseId: uc.id as UsecaseId, patch: { guard } }));
  const litValue = g && g.right.kind === 'literal' ? String(g.right.value) : '';
  return (
    <div className="usecase-guard">
      <label className="req" title="事前条件(状態遷移ガード)。満たさないと ValidationError を返す">
        <input
          type="checkbox"
          checked={!!g}
          onChange={(e) =>
            setGuard(
              e.target.checked
                ? { left: model.fields[0]!.id, op: 'eq', right: { kind: 'literal', value: '' }, message: '実行できる状態ではありません' }
                : null,
            )
          }
        />
        ガード(事前条件)
      </label>
      {g && (
        <div className="guard-row">
          <select value={g.left} onChange={(e) => setGuard({ ...g, left: e.target.value as typeof g.left })}>
            {model.fields.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <select value={g.op} onChange={(e) => setGuard({ ...g, op: e.target.value as RuleOp })}>
            {GUARD_OPS.map((o) => (
              <option key={o.v} value={o.v}>{o.l}</option>
            ))}
          </select>
          <input
            className="guard-val"
            defaultValue={litValue}
            placeholder="値"
            title="比較する値(数値は数値として扱う)"
            onBlur={(e) => {
              const raw = e.target.value;
              const num = Number(raw);
              const value = raw.trim() !== '' && !Number.isNaN(num) ? num : raw;
              setGuard({ ...g, right: { kind: 'literal', value } });
            }}
          />
          <input
            className="rule-message"
            defaultValue={g.message}
            placeholder="エラーメッセージ"
            onBlur={(e) => setGuard({ ...g, message: e.target.value })}
          />
        </div>
      )}
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
