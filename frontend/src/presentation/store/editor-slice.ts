import { createSlice, current, type Draft, type PayloadAction } from '@reduxjs/toolkit';
import { applyCommand, type Command, type CreatedEntities } from '@/application/commands';
import type { EventBinding } from '@/domain/actions';
import { ComponentNode, type ComponentType, type PropValue } from '@/domain/component-node';
import type {
  DomainServiceDef,
  FieldDef,
  ModelDef,
  ModelKind,
  RelationKind,
  RuleOp,
  RuleOperand,
  ValidationRule,
} from '@/domain/data-model';
import type {
  DialogId,
  FieldId,
  ModelId,
  NodeId,
  PageId,
  ProjectId,
  RelationId,
  RuleId,
  ServiceId,
} from '@/domain/ids';
import { EditTarget, ProjectDoc } from '@/domain/project-doc';
import type { Page } from '@/domain/page';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type ViewMode = 'edit' | 'model' | 'preview' | 'run';

export type EditorState = {
  projectId: ProjectId | null;
  projectName: string;
  doc: ProjectDoc;
  editTarget: EditTarget;
  selectedNodeId: NodeId | null;
  selectedModelId: ModelId | null;
  viewMode: ViewMode;
  past: ProjectDoc[];
  future: ProjectDoc[];
  /** commit ごとに増えるドキュメント世代。自動保存の競合判定に使う */
  revision: number;
  dirty: boolean;
  saveState: SaveState;
};

const HISTORY_LIMIT = 100;

const createInitialState = (): EditorState => {
  const doc = ProjectDoc.create();
  return {
    projectId: null,
    projectName: 'マイアプリ',
    doc,
    editTarget: EditTarget.page(doc.pages[0]!.id),
    selectedNodeId: null,
    selectedModelId: null,
    viewMode: 'edit',
    past: [],
    future: [],
    revision: 0,
    dirty: false,
    saveState: 'idle',
  };
};

type DraftState = Draft<EditorState>;

/** ドメイン層の Readonly な値を immer の Draft プロパティへ代入するためのキャスト */
const asDraft = <T,>(value: T): Draft<T> => value as Draft<T>;

/** doc を新しい値に置き換え、履歴に積む。すべての編集操作はここを通る */
const commit = (state: DraftState, next: ProjectDoc): void => {
  state.past.push(asDraft(current(state).doc));
  if (state.past.length > HISTORY_LIMIT) state.past.shift();
  state.future = [];
  state.doc = asDraft(next);
  state.revision += 1;
  state.dirty = true;
};

/** undo/redo やページ削除後に editTarget / 選択が doc 上に存在することを保証する */
const ensureValidTarget = (state: DraftState): void => {
  const snap = current(state);
  const tree = ProjectDoc.getTree(snap.doc, snap.editTarget);
  if (!tree) {
    state.editTarget = asDraft(EditTarget.page(snap.doc.pages[0]!.id));
    state.selectedNodeId = null;
    return;
  }
  if (snap.selectedNodeId && !ComponentNode.contains(tree, snap.selectedNodeId)) {
    state.selectedNodeId = null;
  }
};

/**
 * すべてのドキュメント変更はコマンド層(applyCommand)を経由する。
 * GUI と MCP が同一実行点を通り、機能パリティを構造的に担保する(FR-MCP-00/01)。
 * 成功時のみ履歴へ commit し、生成エンティティ ID を返す(選択更新は各 reducer の責務)。
 */
const run = (state: DraftState, cmd: Command): CreatedEntities | null => {
  const result = applyCommand(current(state).doc, cmd);
  if (!result.ok) return null;
  commit(state, result.value.doc);
  return result.value.created;
};

const currentTarget = (state: DraftState): EditTarget => current(state).editTarget;

export const editorSlice = createSlice({
  name: 'editor',
  initialState: createInitialState,
  reducers: {
    docLoaded(
      state,
      action: PayloadAction<{ projectId: ProjectId; name: string; doc: ProjectDoc }>,
    ) {
      state.projectId = action.payload.projectId;
      state.projectName = action.payload.name;
      state.doc = asDraft(action.payload.doc);
      state.editTarget = asDraft(EditTarget.page(action.payload.doc.pages[0]!.id));
      state.selectedNodeId = null;
      state.past = [];
      state.future = [];
      state.revision = 0;
      state.dirty = false;
      state.saveState = 'idle';
    },

    projectRenamed(state, action: PayloadAction<string>) {
      state.projectName = action.payload;
      state.revision += 1;
      state.dirty = true;
    },

    nodeInserted(
      state,
      action: PayloadAction<{ parentId: NodeId; index: number; type: ComponentType }>,
    ) {
      const created = run(state, { kind: 'insertNode', target: currentTarget(state), ...action.payload });
      if (created?.nodeId) state.selectedNodeId = asDraft(created.nodeId);
    },

    nodeMoved(
      state,
      action: PayloadAction<{ nodeId: NodeId; parentId: NodeId; index: number }>,
    ) {
      const created = run(state, { kind: 'moveNode', target: currentTarget(state), ...action.payload });
      if (created?.nodeId) state.selectedNodeId = asDraft(created.nodeId);
    },

    nodeRemoved(state, action: PayloadAction<{ nodeId: NodeId }>) {
      if (run(state, { kind: 'removeNode', target: currentTarget(state), ...action.payload })) {
        // 削除ノード自身だけでなくその子孫が選択中のケースもあるため存在確認で解決する
        ensureValidTarget(state);
      }
    },

    nodePropsUpdated(
      state,
      action: PayloadAction<{ nodeId: NodeId; patch: Record<string, PropValue> }>,
    ) {
      run(state, { kind: 'updateNodeProps', target: currentTarget(state), ...action.payload });
    },

    nodeEventsSet(
      state,
      action: PayloadAction<{ nodeId: NodeId; events: ReadonlyArray<EventBinding> }>,
    ) {
      run(state, { kind: 'setNodeEvents', target: currentTarget(state), ...action.payload });
    },

    nodeSelected(state, action: PayloadAction<NodeId | null>) {
      state.selectedNodeId = action.payload;
    },

    editTargetChanged(state, action: PayloadAction<EditTarget>) {
      state.editTarget = asDraft(action.payload);
      state.selectedNodeId = null;
      ensureValidTarget(state);
    },

    pageAdded(state, action: PayloadAction<{ name: string; path: string }>) {
      const created = run(state, { kind: 'addPage', ...action.payload });
      if (created?.pageId) {
        state.editTarget = asDraft(EditTarget.page(created.pageId));
        state.selectedNodeId = null;
      }
    },

    pageRemoved(state, action: PayloadAction<{ pageId: PageId }>) {
      if (run(state, { kind: 'removePage', ...action.payload })) ensureValidTarget(state);
    },

    pageUpdated(
      state,
      action: PayloadAction<{
        pageId: PageId;
        patch: Partial<Pick<Page, 'name' | 'path' | 'useHeader' | 'useFooter'>>;
      }>,
    ) {
      run(state, { kind: 'updatePage', ...action.payload });
    },

    dialogAdded(state, action: PayloadAction<{ title: string }>) {
      const created = run(state, { kind: 'addDialog', ...action.payload });
      if (created?.dialogId) {
        state.editTarget = asDraft(EditTarget.dialog(created.dialogId));
        state.selectedNodeId = null;
      }
    },

    dialogRemoved(state, action: PayloadAction<{ dialogId: DialogId }>) {
      if (run(state, { kind: 'removeDialog', ...action.payload })) ensureValidTarget(state);
    },

    dialogRenamed(state, action: PayloadAction<{ dialogId: DialogId; title: string }>) {
      run(state, { kind: 'renameDialog', ...action.payload });
    },

    // ---------- データモデル(DDD)操作 ----------

    dmModelAdded(state, action: PayloadAction<{ kind: ModelKind; x: number; y: number }>) {
      const created = run(state, {
        kind: 'addModel',
        modelKind: action.payload.kind,
        x: action.payload.x,
        y: action.payload.y,
      });
      if (created?.modelId) state.selectedModelId = asDraft(created.modelId);
    },

    dmModelUpdated(
      state,
      action: PayloadAction<{ modelId: ModelId; patch: Partial<Pick<ModelDef, 'name' | 'kind' | 'x' | 'y'>> }>,
    ) {
      run(state, { kind: 'updateModel', ...action.payload });
    },

    dmModelRemoved(state, action: PayloadAction<{ modelId: ModelId }>) {
      if (run(state, { kind: 'removeModel', ...action.payload })) {
        if (state.selectedModelId === action.payload.modelId) state.selectedModelId = null;
      }
    },

    dmFieldAdded(state, action: PayloadAction<{ modelId: ModelId }>) {
      run(state, { kind: 'addField', ...action.payload });
    },

    dmFieldUpdated(
      state,
      action: PayloadAction<{
        modelId: ModelId;
        fieldId: FieldId;
        patch: Partial<Omit<FieldDef, 'id'>>;
      }>,
    ) {
      run(state, { kind: 'updateField', ...action.payload });
    },

    dmFieldRemoved(state, action: PayloadAction<{ modelId: ModelId; fieldId: FieldId }>) {
      run(state, { kind: 'removeField', ...action.payload });
    },

    dmRelationAdded(
      state,
      action: PayloadAction<{ from: ModelId; to: ModelId; kind: RelationKind }>,
    ) {
      run(state, {
        kind: 'addRelation',
        from: action.payload.from,
        to: action.payload.to,
        relationKind: action.payload.kind,
      });
    },

    dmRelationRemoved(state, action: PayloadAction<{ relationId: RelationId }>) {
      run(state, { kind: 'removeRelation', ...action.payload });
    },

    dmRuleAdded(
      state,
      action: PayloadAction<{
        modelId: ModelId;
        left: FieldId;
        op: RuleOp;
        right: RuleOperand;
        message: string;
      }>,
    ) {
      run(state, { kind: 'addRule', ...action.payload });
    },

    dmRuleUpdated(
      state,
      action: PayloadAction<{
        modelId: ModelId;
        ruleId: RuleId;
        patch: Partial<Omit<ValidationRule, 'id'>>;
      }>,
    ) {
      run(state, { kind: 'updateRule', ...action.payload });
    },

    dmRuleRemoved(state, action: PayloadAction<{ modelId: ModelId; ruleId: RuleId }>) {
      run(state, { kind: 'removeRule', ...action.payload });
    },

    dmServiceAdded(state, action: PayloadAction<{ modelId: ModelId }>) {
      run(state, { kind: 'addService', ...action.payload });
    },

    dmServiceUpdated(
      state,
      action: PayloadAction<{
        modelId: ModelId;
        serviceId: ServiceId;
        patch: Partial<Omit<DomainServiceDef, 'id'>>;
      }>,
    ) {
      run(state, { kind: 'updateService', ...action.payload });
    },

    dmServiceRemoved(state, action: PayloadAction<{ modelId: ModelId; serviceId: ServiceId }>) {
      run(state, { kind: 'removeService', ...action.payload });
    },

    modelSelected(state, action: PayloadAction<ModelId | null>) {
      state.selectedModelId = action.payload;
    },

    undone(state) {
      const prev = state.past.pop();
      if (!prev) return;
      state.future.unshift(asDraft(current(state).doc));
      state.doc = prev;
      state.revision += 1;
      state.dirty = true;
      ensureValidTarget(state);
    },

    redone(state) {
      const next = state.future.shift();
      if (!next) return;
      state.past.push(asDraft(current(state).doc));
      state.doc = next;
      state.revision += 1;
      state.dirty = true;
      ensureValidTarget(state);
    },

    viewModeChanged(state, action: PayloadAction<ViewMode>) {
      state.viewMode = action.payload;
    },

    saveStarted(state) {
      state.saveState = 'saving';
    },

    saveSucceeded(state, action: PayloadAction<{ revision: number }>) {
      state.saveState = 'saved';
      if (state.revision === action.payload.revision) state.dirty = false;
    },

    saveFailed(state) {
      state.saveState = 'error';
    },
  },
});

export const {
  docLoaded,
  projectRenamed,
  nodeInserted,
  nodeMoved,
  nodeRemoved,
  nodePropsUpdated,
  nodeEventsSet,
  nodeSelected,
  editTargetChanged,
  pageAdded,
  pageRemoved,
  pageUpdated,
  dialogAdded,
  dialogRemoved,
  dialogRenamed,
  dmModelAdded,
  dmModelUpdated,
  dmModelRemoved,
  dmFieldAdded,
  dmFieldUpdated,
  dmFieldRemoved,
  dmRelationAdded,
  dmRelationRemoved,
  dmRuleAdded,
  dmRuleUpdated,
  dmRuleRemoved,
  dmServiceAdded,
  dmServiceUpdated,
  dmServiceRemoved,
  modelSelected,
  undone,
  redone,
  viewModeChanged,
  saveStarted,
  saveSucceeded,
  saveFailed,
} = editorSlice.actions;

export const editorReducer = editorSlice.reducer;
