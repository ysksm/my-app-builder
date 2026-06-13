import { createSlice, current, type Draft, type PayloadAction } from '@reduxjs/toolkit';
import type { EventBinding } from '@/domain/actions';
import { ComponentNode, type ComponentType, type PropValue } from '@/domain/component-node';
import { DataModel, type FieldDef, type ModelDef, type ModelKind, type RelationKind } from '@/domain/data-model';
import type { DialogId, FieldId, ModelId, NodeId, PageId, ProjectId, RelationId } from '@/domain/ids';
import { EditTarget, ProjectDoc } from '@/domain/project-doc';
import type { Page } from '@/domain/page';
import { componentDefs } from '../catalog/component-defs';

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

const currentTreeOf = (state: DraftState): ComponentNode | null => {
  const snap = current(state);
  return ProjectDoc.getTree(snap.doc, snap.editTarget);
};

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
      const tree = currentTreeOf(state);
      if (!tree) return;
      const def = componentDefs[action.payload.type];
      const node = ComponentNode.create(action.payload.type, { ...def.defaultProps });
      const result = ComponentNode.insert(tree, action.payload.parentId, action.payload.index, node);
      if (!result.ok) return;
      commit(state, ProjectDoc.setTree(current(state).doc, current(state).editTarget, result.value));
      state.selectedNodeId = node.id;
    },

    nodeMoved(
      state,
      action: PayloadAction<{ nodeId: NodeId; parentId: NodeId; index: number }>,
    ) {
      const tree = currentTreeOf(state);
      if (!tree) return;
      const result = ComponentNode.move(
        tree,
        action.payload.nodeId,
        action.payload.parentId,
        action.payload.index,
      );
      if (!result.ok) return;
      commit(state, ProjectDoc.setTree(current(state).doc, current(state).editTarget, result.value));
      state.selectedNodeId = action.payload.nodeId;
    },

    nodeRemoved(state, action: PayloadAction<{ nodeId: NodeId }>) {
      const tree = currentTreeOf(state);
      if (!tree) return;
      const result = ComponentNode.remove(tree, action.payload.nodeId);
      if (!result.ok) return;
      commit(state, ProjectDoc.setTree(current(state).doc, current(state).editTarget, result.value));
      // 削除ノード自身だけでなくその子孫が選択中のケースもあるため存在確認で解決する
      ensureValidTarget(state);
    },

    nodePropsUpdated(
      state,
      action: PayloadAction<{ nodeId: NodeId; patch: Record<string, PropValue> }>,
    ) {
      const tree = currentTreeOf(state);
      if (!tree) return;
      const result = ComponentNode.updateProps(tree, action.payload.nodeId, action.payload.patch);
      if (!result.ok) return;
      commit(state, ProjectDoc.setTree(current(state).doc, current(state).editTarget, result.value));
    },

    nodeEventsSet(
      state,
      action: PayloadAction<{ nodeId: NodeId; events: ReadonlyArray<EventBinding> }>,
    ) {
      const tree = currentTreeOf(state);
      if (!tree) return;
      const result = ComponentNode.setEvents(tree, action.payload.nodeId, action.payload.events);
      if (!result.ok) return;
      commit(state, ProjectDoc.setTree(current(state).doc, current(state).editTarget, result.value));
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
      const { doc, page } = ProjectDoc.addPage(
        current(state).doc,
        action.payload.name,
        action.payload.path,
      );
      commit(state, doc);
      state.editTarget = asDraft(EditTarget.page(page.id));
      state.selectedNodeId = null;
    },

    pageRemoved(state, action: PayloadAction<{ pageId: PageId }>) {
      const result = ProjectDoc.removePage(current(state).doc, action.payload.pageId);
      if (!result.ok) return;
      commit(state, result.value);
      ensureValidTarget(state);
    },

    pageUpdated(
      state,
      action: PayloadAction<{
        pageId: PageId;
        patch: Partial<Pick<Page, 'name' | 'path' | 'useHeader' | 'useFooter'>>;
      }>,
    ) {
      const result = ProjectDoc.updatePage(
        current(state).doc,
        action.payload.pageId,
        action.payload.patch,
      );
      if (!result.ok) return;
      commit(state, result.value);
    },

    dialogAdded(state, action: PayloadAction<{ title: string }>) {
      const { doc, dialog } = ProjectDoc.addDialog(current(state).doc, action.payload.title);
      commit(state, doc);
      state.editTarget = asDraft(EditTarget.dialog(dialog.id));
      state.selectedNodeId = null;
    },

    dialogRemoved(state, action: PayloadAction<{ dialogId: DialogId }>) {
      const result = ProjectDoc.removeDialog(current(state).doc, action.payload.dialogId);
      if (!result.ok) return;
      commit(state, result.value);
      ensureValidTarget(state);
    },

    dialogRenamed(state, action: PayloadAction<{ dialogId: DialogId; title: string }>) {
      const result = ProjectDoc.renameDialog(
        current(state).doc,
        action.payload.dialogId,
        action.payload.title,
      );
      if (!result.ok) return;
      commit(state, result.value);
    },

    // ---------- データモデル(DDD)操作 ----------

    dmModelAdded(state, action: PayloadAction<{ kind: ModelKind; x: number; y: number }>) {
      const { dataModel, model } = DataModel.addModel(
        current(state).doc.dataModel,
        action.payload.kind,
        action.payload.x,
        action.payload.y,
      );
      commit(state, { ...current(state).doc, dataModel });
      state.selectedModelId = model.id;
    },

    dmModelUpdated(
      state,
      action: PayloadAction<{ modelId: ModelId; patch: Partial<Pick<ModelDef, 'name' | 'kind' | 'x' | 'y'>> }>,
    ) {
      const result = DataModel.updateModel(
        current(state).doc.dataModel,
        action.payload.modelId,
        action.payload.patch,
      );
      if (!result.ok) return;
      commit(state, { ...current(state).doc, dataModel: result.value });
    },

    dmModelRemoved(state, action: PayloadAction<{ modelId: ModelId }>) {
      const result = DataModel.removeModel(current(state).doc.dataModel, action.payload.modelId);
      if (!result.ok) return;
      commit(state, { ...current(state).doc, dataModel: result.value });
      if (state.selectedModelId === action.payload.modelId) state.selectedModelId = null;
    },

    dmFieldAdded(state, action: PayloadAction<{ modelId: ModelId }>) {
      const result = DataModel.addField(current(state).doc.dataModel, action.payload.modelId);
      if (!result.ok) return;
      commit(state, { ...current(state).doc, dataModel: result.value.dataModel });
    },

    dmFieldUpdated(
      state,
      action: PayloadAction<{
        modelId: ModelId;
        fieldId: FieldId;
        patch: Partial<Omit<FieldDef, 'id'>>;
      }>,
    ) {
      const result = DataModel.updateField(
        current(state).doc.dataModel,
        action.payload.modelId,
        action.payload.fieldId,
        action.payload.patch,
      );
      if (!result.ok) return;
      commit(state, { ...current(state).doc, dataModel: result.value });
    },

    dmFieldRemoved(state, action: PayloadAction<{ modelId: ModelId; fieldId: FieldId }>) {
      const result = DataModel.removeField(
        current(state).doc.dataModel,
        action.payload.modelId,
        action.payload.fieldId,
      );
      if (!result.ok) return;
      commit(state, { ...current(state).doc, dataModel: result.value });
    },

    dmRelationAdded(
      state,
      action: PayloadAction<{ from: ModelId; to: ModelId; kind: RelationKind }>,
    ) {
      const result = DataModel.addRelation(
        current(state).doc.dataModel,
        action.payload.from,
        action.payload.to,
        action.payload.kind,
      );
      if (!result.ok) return;
      commit(state, { ...current(state).doc, dataModel: result.value.dataModel });
    },

    dmRelationRemoved(state, action: PayloadAction<{ relationId: RelationId }>) {
      const result = DataModel.removeRelation(
        current(state).doc.dataModel,
        action.payload.relationId,
      );
      if (!result.ok) return;
      commit(state, { ...current(state).doc, dataModel: result.value });
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
  modelSelected,
  undone,
  redone,
  viewModeChanged,
  saveStarted,
  saveSucceeded,
  saveFailed,
} = editorSlice.actions;

export const editorReducer = editorSlice.reducer;
