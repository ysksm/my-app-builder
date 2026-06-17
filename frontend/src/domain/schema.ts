import { z } from 'zod';
import { err, ok, type Result } from '@/shared/result';
import type { ComponentNode } from './component-node';
import { DesignTokens } from './design-tokens';
import { DomainError } from './errors';
import { Page } from './page';
import type {
  ChannelId,
  DataSourceId,
  QueryId,
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
} from './ids';
import type { ProjectDoc } from './project-doc';

const idSchema = <T extends string>() =>
  z.custom<T>((v) => typeof v === 'string' && v.length > 0);

const propValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const componentTypeSchema = z.enum([
  'container',
  'heading',
  'text',
  'button',
  'input',
  'image',
  'table',
  'header',
  'footer',
  'metric',
  'gauge',
  'lamp',
  'chart',
  'setpoint',
  'uplot',
  'echarts',
  'aggrid',
  'form',
  'disclosure',
  'menu',
  'switch',
  'tabs',
  'rating',
  'slider',
  'chip',
  'alert',
  'badge',
  'avatar',
  'combobox',
  'progress',
  'searchfield',
]);

const actionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('navigate'), pageId: idSchema<PageId>() }),
  z.object({ kind: z.literal('openDialog'), dialogId: idSchema<DialogId>() }),
  z.object({ kind: z.literal('closeDialog') }),
  z.object({ kind: z.literal('showToast'), message: z.string() }),
  z.object({ kind: z.literal('openUrl'), url: z.string() }),
  z.object({ kind: z.literal('runQuery'), queryId: idSchema<QueryId>() }),
]);

const eventBindingSchema = z.object({
  event: z.literal('onClick'),
  action: actionSchema,
});

const componentNodeSchema: z.ZodType<ComponentNode> = z.lazy(() =>
  z.object({
    id: idSchema<NodeId>(),
    type: componentTypeSchema,
    props: z.record(z.string(), propValueSchema),
    events: z.array(eventBindingSchema),
    children: z.array(componentNodeSchema),
    layout: z
      .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
      .optional(),
    style: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    className: z.string().optional(),
    name: z.string().optional(),
  }),
);

const sizeConstraintSchema = z.object({
  mode: z.enum(['auto', 'fixed', 'min', 'max']),
  value: z.number(),
});
const screenSizeSchema = z
  .object({ width: sizeConstraintSchema, height: sizeConstraintSchema })
  .default(() => Page.defaultScreen);

const pageSchema = z.object({
  id: idSchema<PageId>(),
  name: z.string(),
  path: z.string(),
  root: componentNodeSchema,
  useHeader: z.boolean(),
  useFooter: z.boolean(),
  // 後方互換: 旧プロジェクト(screen 無し)は既定サイズで補完
  screen: screenSizeSchema,
});

const dialogSchema = z.object({
  id: idSchema<DialogId>(),
  title: z.string(),
  root: componentNodeSchema,
});

const tokenValueSchema = z.object({
  $type: z.enum(['color', 'dimension', 'fontFamily']),
  $value: z.string(),
});

const tokenGroupSchema = z.record(z.string(), tokenValueSchema);

const designTokensSchema = z.object({
  color: tokenGroupSchema,
  spacing: tokenGroupSchema,
  radius: tokenGroupSchema,
  font: tokenGroupSchema,
});

const fieldDefSchema = z.object({
  id: idSchema<FieldId>(),
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'date']),
  required: z.boolean(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  pattern: z.string().nullable(),
});

const ruleOperandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('field'), fieldId: idSchema<FieldId>() }),
  z.object({ kind: z.literal('literal'), value: z.union([z.string(), z.number(), z.boolean()]) }),
]);

const validationRuleSchema = z.object({
  id: idSchema<RuleId>(),
  left: idSchema<FieldId>(),
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
  right: ruleOperandSchema,
  message: z.string(),
});

const serviceParamSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean']),
});

const domainServiceSchema = z.object({
  id: idSchema<ServiceId>(),
  name: z.string().min(1),
  params: z.array(serviceParamSchema),
  returns: z.enum(['string', 'number', 'boolean', 'void', 'self']),
});

const usecaseGuardSchema = z.object({
  left: idSchema<FieldId>(),
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
  right: ruleOperandSchema,
  message: z.string(),
});

const usecaseSchema = z.object({
  id: idSchema<UsecaseId>(),
  name: z.string().min(1),
  serviceIds: z.array(idSchema<ServiceId>()),
  save: z.boolean(),
  // 事前条件(状態遷移ガード)。導入以前のドキュメントは null で補完
  guard: usecaseGuardSchema.nullable().default(null),
});

const modelDefSchema = z.object({
  id: idSchema<ModelId>(),
  name: z.string().min(1),
  kind: z.enum(['aggregate', 'entity', 'valueObject']),
  fields: z.array(fieldDefSchema),
  // rules / services / usecases 導入以前のドキュメントは空配列で補完
  rules: z.array(validationRuleSchema).default(() => []),
  services: z.array(domainServiceSchema).default(() => []),
  usecases: z.array(usecaseSchema).default(() => []),
  x: z.number(),
  y: z.number(),
});

const relationDefSchema = z.object({
  id: idSchema<RelationId>(),
  from: idSchema<ModelId>(),
  to: idSchema<ModelId>(),
  kind: z.enum(['hasOne', 'hasMany']),
  name: z.string().min(1),
});

const dataChannelSchema = z.object({
  id: idSchema<ChannelId>(),
  name: z.string(),
  key: z.string(),
  source: z.enum(['mock', 'live', 'modbus']),
  min: z.number(),
  max: z.number(),
  interval: z.number(),
  host: z.string().optional(),
  unit: z.number().optional(),
  register: z.number().optional(),
  scale: z.number().optional(),
});

const dataModelSchema = z.object({
  models: z.array(modelDefSchema),
  relations: z.array(relationDefSchema),
});

export const projectDocSchema = z.object({
  schemaVersion: z.literal(1),
  pages: z.array(pageSchema).min(1),
  layout: z.object({
    header: componentNodeSchema.nullable(),
    footer: componentNodeSchema.nullable(),
  }),
  dialogs: z.array(dialogSchema),
  // tokens / dataModel / customParts 導入以前に保存されたドキュメントはデフォルト値で補完する
  tokens: designTokensSchema.default(() => DesignTokens.default()),
  dataModel: dataModelSchema.default(() => ({ models: [], relations: [] })),
  customParts: z
    .array(z.object({ id: idSchema<CustomPartId>(), name: z.string(), root: componentNodeSchema }))
    .default(() => []),
  styleEmitter: z.enum(['css-variables', 'tailwind']).default('css-variables'),
  channels: z.array(dataChannelSchema).default(() => []),
  dataSources: z
    .array(z.object({ id: idSchema<DataSourceId>(), name: z.string(), baseUrl: z.string() }))
    .default(() => []),
  queries: z
    .array(
      z.object({
        id: idSchema<QueryId>(),
        name: z.string(),
        dataSourceId: z.union([idSchema<DataSourceId>(), z.literal('')]),
        method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
        path: z.string(),
      }),
    )
    .default(() => []),
  boardPositions: z
    .record(z.string(), z.object({ x: z.number(), y: z.number() }))
    .default(() => ({})),
  themes: z
    .array(z.object({ id: z.string(), name: z.string(), tokens: designTokensSchema }))
    .default(() => []),
  // 後方互換: UIライブラリ選択(framework→kit)が無い旧プロジェクトは空(=全 plain)
  uiKits: z.record(z.string(), z.string()).default(() => ({})),
  // 後方互換: 対象フレームワーク未設定の旧プロジェクトは react
  targetFramework: z.string().default('react'),
});

/** 保存/読込境界での検証。永続化された JSON を信頼せず必ずここを通す */
export const parseProjectDoc = (input: unknown): Result<ProjectDoc, DomainError> => {
  const parsed = projectDocSchema.safeParse(input);
  if (!parsed.success) {
    return err(DomainError.create('INVALID', parsed.error.message));
  }
  return ok(parsed.data);
};
