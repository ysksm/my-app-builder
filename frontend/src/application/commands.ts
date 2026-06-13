import { err, ok, type Result } from '@/shared/result';
import type { EventBinding } from '@/domain/actions';
import { componentDefs } from '@/domain/catalog/component-defs';
import { ComponentNode, type ComponentType, type PropValue } from '@/domain/component-node';
import { DataModel, type FieldDef, type ModelDef, type ModelKind, type RelationKind } from '@/domain/data-model';
import { DomainError } from '@/domain/errors';
import type { DialogId, FieldId, ModelId, NodeId, PageId, RelationId } from '@/domain/ids';
import type { Page } from '@/domain/page';
import { ProjectDoc, type EditTarget } from '@/domain/project-doc';

/**
 * コマンド層(requirements.md §9 FR-MCP-00 / §7.4 デモ再生の基盤)。
 *
 * すべてのドキュメント変更操作を直列化可能(JSON)な Command として表現し、
 * 純粋関数 applyCommand(doc, cmd) に集約する。
 * GUI(editorSlice)と MCP(apply_commands)は同一のこの層を通るため、
 * 機能パリティが構造的に担保され、ロジックが二重実装にならない。
 *
 * 選択・編集対象・履歴などの「揮発的な UI 状態」はここには含めない(editorSlice 側の責務)。
 * 新規生成エンティティの ID は outcome.created で呼び出し側へ返す。
 */

type NodePatch = Record<string, PropValue>;
type PagePatch = Partial<Pick<Page, 'name' | 'path' | 'useHeader' | 'useFooter'>>;
type ModelPatch = Partial<Pick<ModelDef, 'name' | 'kind' | 'x' | 'y'>>;
type FieldPatch = Partial<Omit<FieldDef, 'id'>>;

export type Command =
  // コンポーネント木(編集対象スコープ)
  | Readonly<{ kind: 'insertNode'; target: EditTarget; parentId: NodeId; index: number; type: ComponentType }>
  | Readonly<{ kind: 'moveNode'; target: EditTarget; nodeId: NodeId; parentId: NodeId; index: number }>
  | Readonly<{ kind: 'removeNode'; target: EditTarget; nodeId: NodeId }>
  | Readonly<{ kind: 'updateNodeProps'; target: EditTarget; nodeId: NodeId; patch: NodePatch }>
  | Readonly<{ kind: 'setNodeEvents'; target: EditTarget; nodeId: NodeId; events: ReadonlyArray<EventBinding> }>
  // ページ
  | Readonly<{ kind: 'addPage'; name: string; path: string }>
  | Readonly<{ kind: 'removePage'; pageId: PageId }>
  | Readonly<{ kind: 'updatePage'; pageId: PageId; patch: PagePatch }>
  // ダイアログ
  | Readonly<{ kind: 'addDialog'; title: string }>
  | Readonly<{ kind: 'removeDialog'; dialogId: DialogId }>
  | Readonly<{ kind: 'renameDialog'; dialogId: DialogId; title: string }>
  // データモデル(DDD)
  | Readonly<{ kind: 'addModel'; modelKind: ModelKind; x: number; y: number }>
  | Readonly<{ kind: 'updateModel'; modelId: ModelId; patch: ModelPatch }>
  | Readonly<{ kind: 'removeModel'; modelId: ModelId }>
  | Readonly<{ kind: 'addField'; modelId: ModelId }>
  | Readonly<{ kind: 'updateField'; modelId: ModelId; fieldId: FieldId; patch: FieldPatch }>
  | Readonly<{ kind: 'removeField'; modelId: ModelId; fieldId: FieldId }>
  | Readonly<{ kind: 'addRelation'; from: ModelId; to: ModelId; relationKind: RelationKind }>
  | Readonly<{ kind: 'removeRelation'; relationId: RelationId }>;

export type CommandKind = Command['kind'];

export type CreatedEntities = Readonly<{
  nodeId?: NodeId;
  pageId?: PageId;
  dialogId?: DialogId;
  modelId?: ModelId;
  fieldId?: FieldId;
  relationId?: RelationId;
}>;

export type CommandOutcome = Readonly<{
  doc: ProjectDoc;
  created: CreatedEntities;
}>;

/** コンポーネント木スコープのコマンドを処理する */
const applyTreeCommand = (
  doc: ProjectDoc,
  target: EditTarget,
  op: (tree: ComponentNode) => Result<ComponentNode, DomainError>,
): Result<ProjectDoc, DomainError> => {
  const tree = ProjectDoc.getTree(doc, target);
  if (!tree) return err(DomainError.notFound('edit target'));
  const next = op(tree);
  if (!next.ok) return next;
  return ok(ProjectDoc.setTree(doc, target, next.value));
};

const outcome = (doc: ProjectDoc, created: CreatedEntities = {}): CommandOutcome => ({ doc, created });

/** Command を ProjectDoc に適用する純粋関数。GUI / MCP / デモ再生の共通実行点 */
export const applyCommand = (
  doc: ProjectDoc,
  cmd: Command,
): Result<CommandOutcome, DomainError> => {
  switch (cmd.kind) {
    case 'insertNode': {
      const def = componentDefs[cmd.type];
      const node = ComponentNode.create(cmd.type, { ...def.defaultProps });
      const res = applyTreeCommand(doc, cmd.target, (tree) =>
        ComponentNode.insert(tree, cmd.parentId, cmd.index, node),
      );
      return res.ok ? ok(outcome(res.value, { nodeId: node.id })) : res;
    }
    case 'moveNode': {
      const res = applyTreeCommand(doc, cmd.target, (tree) =>
        ComponentNode.move(tree, cmd.nodeId, cmd.parentId, cmd.index),
      );
      return res.ok ? ok(outcome(res.value, { nodeId: cmd.nodeId })) : res;
    }
    case 'removeNode': {
      const res = applyTreeCommand(doc, cmd.target, (tree) => ComponentNode.remove(tree, cmd.nodeId));
      return res.ok ? ok(outcome(res.value)) : res;
    }
    case 'updateNodeProps': {
      const res = applyTreeCommand(doc, cmd.target, (tree) =>
        ComponentNode.updateProps(tree, cmd.nodeId, cmd.patch),
      );
      return res.ok ? ok(outcome(res.value)) : res;
    }
    case 'setNodeEvents': {
      const res = applyTreeCommand(doc, cmd.target, (tree) =>
        ComponentNode.setEvents(tree, cmd.nodeId, cmd.events),
      );
      return res.ok ? ok(outcome(res.value)) : res;
    }

    case 'addPage': {
      const { doc: next, page } = ProjectDoc.addPage(doc, cmd.name, cmd.path);
      return ok(outcome(next, { pageId: page.id }));
    }
    case 'removePage': {
      const res = ProjectDoc.removePage(doc, cmd.pageId);
      return res.ok ? ok(outcome(res.value)) : res;
    }
    case 'updatePage': {
      const res = ProjectDoc.updatePage(doc, cmd.pageId, cmd.patch);
      return res.ok ? ok(outcome(res.value)) : res;
    }

    case 'addDialog': {
      const { doc: next, dialog } = ProjectDoc.addDialog(doc, cmd.title);
      return ok(outcome(next, { dialogId: dialog.id }));
    }
    case 'removeDialog': {
      const res = ProjectDoc.removeDialog(doc, cmd.dialogId);
      return res.ok ? ok(outcome(res.value)) : res;
    }
    case 'renameDialog': {
      const res = ProjectDoc.renameDialog(doc, cmd.dialogId, cmd.title);
      return res.ok ? ok(outcome(res.value)) : res;
    }

    case 'addModel': {
      const { dataModel, model } = DataModel.addModel(doc.dataModel, cmd.modelKind, cmd.x, cmd.y);
      return ok(outcome({ ...doc, dataModel }, { modelId: model.id }));
    }
    case 'updateModel': {
      const res = DataModel.updateModel(doc.dataModel, cmd.modelId, cmd.patch);
      return res.ok ? ok(outcome({ ...doc, dataModel: res.value })) : res;
    }
    case 'removeModel': {
      const res = DataModel.removeModel(doc.dataModel, cmd.modelId);
      return res.ok ? ok(outcome({ ...doc, dataModel: res.value })) : res;
    }
    case 'addField': {
      const res = DataModel.addField(doc.dataModel, cmd.modelId);
      return res.ok
        ? ok(outcome({ ...doc, dataModel: res.value.dataModel }, { fieldId: res.value.field.id }))
        : res;
    }
    case 'updateField': {
      const res = DataModel.updateField(doc.dataModel, cmd.modelId, cmd.fieldId, cmd.patch);
      return res.ok ? ok(outcome({ ...doc, dataModel: res.value })) : res;
    }
    case 'removeField': {
      const res = DataModel.removeField(doc.dataModel, cmd.modelId, cmd.fieldId);
      return res.ok ? ok(outcome({ ...doc, dataModel: res.value })) : res;
    }
    case 'addRelation': {
      const res = DataModel.addRelation(doc.dataModel, cmd.from, cmd.to, cmd.relationKind);
      return res.ok
        ? ok(outcome({ ...doc, dataModel: res.value.dataModel }, { relationId: res.value.relation.id }))
        : res;
    }
    case 'removeRelation': {
      const res = DataModel.removeRelation(doc.dataModel, cmd.relationId);
      return res.ok ? ok(outcome({ ...doc, dataModel: res.value })) : res;
    }
  }
};

/** コマンド列を順に適用する。途中で失敗したらそのエラーを返す(原子的ではない点に注意) */
export const applyCommands = (
  doc: ProjectDoc,
  commands: ReadonlyArray<Command>,
): Result<CommandOutcome, DomainError> => {
  let current = doc;
  let created: CreatedEntities = {};
  for (const cmd of commands) {
    const res = applyCommand(current, cmd);
    if (!res.ok) return res;
    current = res.value.doc;
    created = { ...created, ...res.value.created };
  }
  return ok(outcome(current, created));
};
