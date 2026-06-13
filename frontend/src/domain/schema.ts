import { z } from 'zod';
import { err, ok, type Result } from '@/shared/result';
import type { ComponentNode } from './component-node';
import { DesignTokens } from './design-tokens';
import { DomainError } from './errors';
import type {
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
]);

const actionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('navigate'), pageId: idSchema<PageId>() }),
  z.object({ kind: z.literal('openDialog'), dialogId: idSchema<DialogId>() }),
  z.object({ kind: z.literal('closeDialog') }),
  z.object({ kind: z.literal('showToast'), message: z.string() }),
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
  }),
);

const pageSchema = z.object({
  id: idSchema<PageId>(),
  name: z.string(),
  path: z.string(),
  root: componentNodeSchema,
  useHeader: z.boolean(),
  useFooter: z.boolean(),
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

const usecaseSchema = z.object({
  id: idSchema<UsecaseId>(),
  name: z.string().min(1),
  serviceIds: z.array(idSchema<ServiceId>()),
  save: z.boolean(),
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
});

/** 保存/読込境界での検証。永続化された JSON を信頼せず必ずここを通す */
export const parseProjectDoc = (input: unknown): Result<ProjectDoc, DomainError> => {
  const parsed = projectDocSchema.safeParse(input);
  if (!parsed.success) {
    return err(DomainError.create('INVALID', parsed.error.message));
  }
  return ok(parsed.data);
};
