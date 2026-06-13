import { z } from 'zod';
import { err, ok, type Result } from '@/shared/result';
import type { ComponentNode } from './component-node';
import { DesignTokens } from './design-tokens';
import { DomainError } from './errors';
import type { DialogId, NodeId, PageId } from './ids';
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

export const projectDocSchema = z.object({
  schemaVersion: z.literal(1),
  pages: z.array(pageSchema).min(1),
  layout: z.object({
    header: componentNodeSchema.nullable(),
    footer: componentNodeSchema.nullable(),
  }),
  dialogs: z.array(dialogSchema),
  // tokens 導入(M2)以前に保存されたドキュメントはデフォルトテーマで補完する
  tokens: designTokensSchema.default(() => DesignTokens.default()),
});

/** 保存/読込境界での検証。永続化された JSON を信頼せず必ずここを通す */
export const parseProjectDoc = (input: unknown): Result<ProjectDoc, DomainError> => {
  const parsed = projectDocSchema.safeParse(input);
  if (!parsed.success) {
    return err(DomainError.create('INVALID', parsed.error.message));
  }
  return ok(parsed.data);
};
