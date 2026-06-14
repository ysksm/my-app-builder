import { z } from 'zod';
import { err, ok, type Result } from '@/shared/result';
import type { EventBinding } from '@/domain/actions';
import { componentDefs } from '@/domain/catalog/component-defs';
import { DomainError } from '@/domain/errors';
import { ComponentNode, type ComponentType, type PropValue } from '@/domain/component-node';
import { DesignTokens } from '@/domain/design-tokens';
import {
  DataModel,
  type DomainServiceDef,
  type FieldDef,
  type ModelDef,
  type ModelKind,
  type RelationKind,
  type RuleOp,
  type RuleOperand,
  type UsecaseDef,
  type ValidationRule,
} from '@/domain/data-model';
import type {
  ChannelId,
  CustomPartId,
  DialogId,
  FieldId,
  ModelId,
  NodeId,
  PageId,
  RelationId,
  RuleId,
  ServiceId,
  UsecaseId,
} from '@/domain/ids';
import type { DataChannelDef } from '@/domain/data-channel';
import type { Page } from '@/domain/page';
import { ProjectDoc, type EditTarget, type StyleEmitter } from '@/domain/project-doc';

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
type PagePatch = Partial<Pick<Page, 'name' | 'path' | 'useHeader' | 'useFooter' | 'screen'>>;
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
  | Readonly<{ kind: 'removeRelation'; relationId: RelationId }>
  // バリデーションルール(クロスフィールド制約)
  | Readonly<{ kind: 'addRule'; modelId: ModelId; left: FieldId; op: RuleOp; right: RuleOperand; message: string }>
  | Readonly<{ kind: 'updateRule'; modelId: ModelId; ruleId: RuleId; patch: Partial<Omit<ValidationRule, 'id'>> }>
  | Readonly<{ kind: 'removeRule'; modelId: ModelId; ruleId: RuleId }>
  // ドメインサービス契約
  | Readonly<{ kind: 'addService'; modelId: ModelId }>
  | Readonly<{ kind: 'updateService'; modelId: ModelId; serviceId: ServiceId; patch: Partial<Omit<DomainServiceDef, 'id'>> }>
  | Readonly<{ kind: 'removeService'; modelId: ModelId; serviceId: ServiceId }>
  // ユースケース(application 層フロー)
  | Readonly<{ kind: 'addUsecase'; modelId: ModelId }>
  | Readonly<{ kind: 'updateUsecase'; modelId: ModelId; usecaseId: UsecaseId; patch: Partial<Omit<UsecaseDef, 'id'>> }>
  | Readonly<{ kind: 'removeUsecase'; modelId: ModelId; usecaseId: UsecaseId }>
  // ユーザー定義パーツ(複合パーツ)
  | Readonly<{ kind: 'defineCustomPart'; target: EditTarget; nodeId: NodeId; name: string }>
  | Readonly<{ kind: 'removeCustomPart'; partId: CustomPartId }>
  | Readonly<{ kind: 'renameCustomPart'; partId: CustomPartId; name: string }>
  | Readonly<{ kind: 'insertCustomPart'; target: EditTarget; parentId: NodeId; index: number; partId: CustomPartId }>
  // デザイントークン
  | Readonly<{ kind: 'setToken'; group: keyof DesignTokens; key: string; value: string }>
  | Readonly<{ kind: 'setStyleEmitter'; emitter: StyleEmitter }>
  // データチャネル(FR-RT-01)
  | Readonly<{ kind: 'addChannel'; name?: string; patch?: Partial<Omit<DataChannelDef, 'id'>> }>
  | Readonly<{ kind: 'updateChannel'; channelId: ChannelId; patch: Partial<Omit<DataChannelDef, 'id'>> }>
  | Readonly<{ kind: 'removeChannel'; channelId: ChannelId }>
  // スクリーンボード配置(FR-PAGE-06)
  | Readonly<{ kind: 'setBoardPosition'; screenId: string; x: number; y: number }>
  // 名前付きデザインテーマ(FR-DS-08)
  | Readonly<{ kind: 'saveTheme'; name: string }>
  | Readonly<{ kind: 'applyTheme'; themeId: string }>
  | Readonly<{ kind: 'removeTheme'; themeId: string }>
  | Readonly<{ kind: 'applyPreset'; presetId: string }>;

export type CommandKind = Command['kind'];

export type CreatedEntities = Readonly<{
  nodeId?: NodeId;
  pageId?: PageId;
  dialogId?: DialogId;
  modelId?: ModelId;
  fieldId?: FieldId;
  relationId?: RelationId;
  ruleId?: RuleId;
  serviceId?: ServiceId;
  usecaseId?: UsecaseId;
  partId?: CustomPartId;
  channelId?: ChannelId;
  themeId?: string;
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

    case 'addRule': {
      const res = DataModel.addRule(doc.dataModel, cmd.modelId, cmd.left, cmd.op, cmd.right, cmd.message);
      return res.ok
        ? ok(outcome({ ...doc, dataModel: res.value.dataModel }, { ruleId: res.value.rule.id }))
        : res;
    }
    case 'updateRule': {
      const res = DataModel.updateRule(doc.dataModel, cmd.modelId, cmd.ruleId, cmd.patch);
      return res.ok ? ok(outcome({ ...doc, dataModel: res.value })) : res;
    }
    case 'removeRule': {
      const res = DataModel.removeRule(doc.dataModel, cmd.modelId, cmd.ruleId);
      return res.ok ? ok(outcome({ ...doc, dataModel: res.value })) : res;
    }

    case 'addService': {
      const res = DataModel.addService(doc.dataModel, cmd.modelId);
      return res.ok
        ? ok(outcome({ ...doc, dataModel: res.value.dataModel }, { serviceId: res.value.service.id }))
        : res;
    }
    case 'updateService': {
      const res = DataModel.updateService(doc.dataModel, cmd.modelId, cmd.serviceId, cmd.patch);
      return res.ok ? ok(outcome({ ...doc, dataModel: res.value })) : res;
    }
    case 'removeService': {
      const res = DataModel.removeService(doc.dataModel, cmd.modelId, cmd.serviceId);
      return res.ok ? ok(outcome({ ...doc, dataModel: res.value })) : res;
    }

    case 'addUsecase': {
      const res = DataModel.addUsecase(doc.dataModel, cmd.modelId);
      return res.ok
        ? ok(outcome({ ...doc, dataModel: res.value.dataModel }, { usecaseId: res.value.usecase.id }))
        : res;
    }
    case 'updateUsecase': {
      const res = DataModel.updateUsecase(doc.dataModel, cmd.modelId, cmd.usecaseId, cmd.patch);
      return res.ok ? ok(outcome({ ...doc, dataModel: res.value })) : res;
    }
    case 'removeUsecase': {
      const res = DataModel.removeUsecase(doc.dataModel, cmd.modelId, cmd.usecaseId);
      return res.ok ? ok(outcome({ ...doc, dataModel: res.value })) : res;
    }

    case 'defineCustomPart': {
      const tree = ProjectDoc.getTree(doc, cmd.target);
      if (!tree) return err(DomainError.notFound('edit target'));
      const node = ComponentNode.find(tree, cmd.nodeId);
      if (!node) return err(DomainError.notFound('node'));
      const { doc: next, part } = ProjectDoc.addCustomPart(doc, cmd.name, node);
      return ok(outcome(next, { partId: part.id }));
    }
    case 'removeCustomPart': {
      const res = ProjectDoc.removeCustomPart(doc, cmd.partId);
      return res.ok ? ok(outcome(res.value)) : res;
    }
    case 'renameCustomPart': {
      const res = ProjectDoc.renameCustomPart(doc, cmd.partId, cmd.name);
      return res.ok ? ok(outcome(res.value)) : res;
    }
    case 'insertCustomPart': {
      const part = ProjectDoc.findCustomPart(doc, cmd.partId);
      if (!part) return err(DomainError.notFound('custom part'));
      const clone = ComponentNode.clone(part.root);
      const res = applyTreeCommand(doc, cmd.target, (tree) =>
        ComponentNode.insert(tree, cmd.parentId, cmd.index, clone),
      );
      return res.ok ? ok(outcome(res.value, { nodeId: clone.id })) : res;
    }

    case 'setToken': {
      return ok(outcome({ ...doc, tokens: DesignTokens.setToken(doc.tokens, cmd.group, cmd.key, cmd.value) }));
    }
    case 'setStyleEmitter': {
      return ok(outcome({ ...doc, styleEmitter: cmd.emitter }));
    }
    case 'addChannel': {
      const { doc: next, channel } = ProjectDoc.addChannel(doc, cmd.name ?? '新規チャネル', cmd.patch ?? {});
      return ok(outcome(next, { channelId: channel.id }));
    }
    case 'updateChannel': {
      const res = ProjectDoc.updateChannel(doc, cmd.channelId, cmd.patch);
      return res.ok ? ok(outcome(res.value)) : res;
    }
    case 'removeChannel': {
      const res = ProjectDoc.removeChannel(doc, cmd.channelId);
      return res.ok ? ok(outcome(res.value)) : res;
    }
    case 'setBoardPosition': {
      return ok(outcome(ProjectDoc.setBoardPosition(doc, cmd.screenId, cmd.x, cmd.y)));
    }
    case 'saveTheme': {
      const { doc: next, theme } = ProjectDoc.saveTheme(doc, cmd.name);
      return ok(outcome(next, { themeId: theme.id }));
    }
    case 'applyTheme': {
      const res = ProjectDoc.applyTheme(doc, cmd.themeId);
      return res.ok ? ok(outcome(res.value)) : res;
    }
    case 'removeTheme': {
      const res = ProjectDoc.removeTheme(doc, cmd.themeId);
      return res.ok ? ok(outcome(res.value)) : res;
    }
    case 'applyPreset': {
      const res = ProjectDoc.applyPreset(doc, cmd.presetId);
      return res.ok ? ok(outcome(res.value)) : res;
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

// ---------- 直列化境界の検証(MCP など外部入力を信頼しない) ----------

const id = z.string().min(1);
const propValue = z.union([z.string(), z.number(), z.boolean()]);
const editTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('page'), pageId: id }),
  z.object({ kind: z.literal('header') }),
  z.object({ kind: z.literal('footer') }),
  z.object({ kind: z.literal('dialog'), dialogId: id }),
]);
const action = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('navigate'), pageId: id }),
  z.object({ kind: z.literal('openDialog'), dialogId: id }),
  z.object({ kind: z.literal('closeDialog') }),
  z.object({ kind: z.literal('showToast'), message: z.string() }),
]);
const eventBinding = z.object({ event: z.literal('onClick'), action });
const componentType = z.enum([
  'container', 'heading', 'text', 'button', 'input', 'image', 'table', 'header', 'footer', 'metric', 'gauge', 'lamp', 'chart', 'setpoint',
]);
const modelKind = z.enum(['aggregate', 'entity', 'valueObject']);
const relationKind = z.enum(['hasOne', 'hasMany']);
const fieldType = z.enum(['string', 'number', 'boolean', 'date']);
const ruleOp = z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);
const ruleOperand = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('field'), fieldId: id }),
  z.object({ kind: z.literal('literal'), value: propValue }),
]);
const rulePatch = z
  .object({ left: id, op: ruleOp, right: ruleOperand, message: z.string() })
  .partial();
const serviceType = z.enum(['string', 'number', 'boolean']);
const servicePatch = z
  .object({
    name: z.string(),
    params: z.array(z.object({ name: z.string(), type: serviceType })),
    returns: z.enum(['string', 'number', 'boolean', 'void', 'self']),
  })
  .partial();
const usecaseGuard = z.object({ left: id, op: ruleOp, right: ruleOperand, message: z.string() });
const usecasePatch = z
  .object({
    name: z.string(),
    serviceIds: z.array(id),
    save: z.boolean(),
    guard: usecaseGuard.nullable(),
  })
  .partial();
const sizeConstraint = z.object({ mode: z.enum(['auto', 'fixed', 'min', 'max']), value: z.number() });
const screenSize = z.object({ width: sizeConstraint, height: sizeConstraint });
const pagePatch = z
  .object({
    name: z.string(),
    path: z.string(),
    useHeader: z.boolean(),
    useFooter: z.boolean(),
    screen: screenSize,
  })
  .partial();
const modelPatch = z.object({ name: z.string(), kind: modelKind, x: z.number(), y: z.number() }).partial();
const channelPatch = z
  .object({
    name: z.string(),
    key: z.string(),
    source: z.enum(['mock', 'live', 'modbus']),
    min: z.number(),
    max: z.number(),
    interval: z.number(),
    host: z.string(),
    unit: z.number(),
    register: z.number(),
    scale: z.number(),
  })
  .partial();
const fieldPatch = z
  .object({
    name: z.string(),
    type: fieldType,
    required: z.boolean(),
    min: z.number().nullable(),
    max: z.number().nullable(),
    pattern: z.string().nullable(),
  })
  .partial();

const commandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('insertNode'), target: editTarget, parentId: id, index: z.number(), type: componentType }),
  z.object({ kind: z.literal('moveNode'), target: editTarget, nodeId: id, parentId: id, index: z.number() }),
  z.object({ kind: z.literal('removeNode'), target: editTarget, nodeId: id }),
  z.object({ kind: z.literal('updateNodeProps'), target: editTarget, nodeId: id, patch: z.record(z.string(), propValue) }),
  z.object({ kind: z.literal('setNodeEvents'), target: editTarget, nodeId: id, events: z.array(eventBinding) }),
  z.object({ kind: z.literal('addPage'), name: z.string(), path: z.string() }),
  z.object({ kind: z.literal('removePage'), pageId: id }),
  z.object({ kind: z.literal('updatePage'), pageId: id, patch: pagePatch }),
  z.object({ kind: z.literal('addDialog'), title: z.string() }),
  z.object({ kind: z.literal('removeDialog'), dialogId: id }),
  z.object({ kind: z.literal('renameDialog'), dialogId: id, title: z.string() }),
  z.object({ kind: z.literal('addModel'), modelKind, x: z.number(), y: z.number() }),
  z.object({ kind: z.literal('updateModel'), modelId: id, patch: modelPatch }),
  z.object({ kind: z.literal('removeModel'), modelId: id }),
  z.object({ kind: z.literal('addField'), modelId: id }),
  z.object({ kind: z.literal('updateField'), modelId: id, fieldId: id, patch: fieldPatch }),
  z.object({ kind: z.literal('removeField'), modelId: id, fieldId: id }),
  z.object({ kind: z.literal('addRelation'), from: id, to: id, relationKind }),
  z.object({ kind: z.literal('removeRelation'), relationId: id }),
  z.object({ kind: z.literal('addRule'), modelId: id, left: id, op: ruleOp, right: ruleOperand, message: z.string() }),
  z.object({ kind: z.literal('updateRule'), modelId: id, ruleId: id, patch: rulePatch }),
  z.object({ kind: z.literal('removeRule'), modelId: id, ruleId: id }),
  z.object({ kind: z.literal('addService'), modelId: id }),
  z.object({ kind: z.literal('updateService'), modelId: id, serviceId: id, patch: servicePatch }),
  z.object({ kind: z.literal('removeService'), modelId: id, serviceId: id }),
  z.object({ kind: z.literal('addUsecase'), modelId: id }),
  z.object({ kind: z.literal('updateUsecase'), modelId: id, usecaseId: id, patch: usecasePatch }),
  z.object({ kind: z.literal('removeUsecase'), modelId: id, usecaseId: id }),
  z.object({ kind: z.literal('defineCustomPart'), target: editTarget, nodeId: id, name: z.string() }),
  z.object({ kind: z.literal('removeCustomPart'), partId: id }),
  z.object({ kind: z.literal('renameCustomPart'), partId: id, name: z.string() }),
  z.object({ kind: z.literal('insertCustomPart'), target: editTarget, parentId: id, index: z.number(), partId: id }),
  z.object({ kind: z.literal('setToken'), group: z.enum(['color', 'spacing', 'radius', 'font']), key: z.string(), value: z.string() }),
  z.object({ kind: z.literal('setStyleEmitter'), emitter: z.enum(['css-variables', 'tailwind']) }),
  z.object({ kind: z.literal('addChannel'), name: z.string().optional(), patch: channelPatch.optional() }),
  z.object({ kind: z.literal('updateChannel'), channelId: id, patch: channelPatch }),
  z.object({ kind: z.literal('removeChannel'), channelId: id }),
  z.object({ kind: z.literal('setBoardPosition'), screenId: z.string(), x: z.number(), y: z.number() }),
  z.object({ kind: z.literal('saveTheme'), name: z.string() }),
  z.object({ kind: z.literal('applyTheme'), themeId: z.string() }),
  z.object({ kind: z.literal('removeTheme'), themeId: z.string() }),
  z.object({ kind: z.literal('applyPreset'), presetId: z.string() }),
]);

/** 外部入力(JSON)→ 検証済み Command 配列。MCP の apply_commands が信頼境界で使う */
export const parseCommands = (input: unknown): Result<Command[], DomainError> => {
  const parsed = z.array(commandSchema).safeParse(input);
  if (!parsed.success) return err(DomainError.create('INVALID', parsed.error.message));
  return ok(parsed.data as Command[]);
};
