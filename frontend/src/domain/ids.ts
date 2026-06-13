export type ProjectId = string & { readonly __brand: 'ProjectId' };
export type PageId = string & { readonly __brand: 'PageId' };
export type NodeId = string & { readonly __brand: 'NodeId' };
export type DialogId = string & { readonly __brand: 'DialogId' };

const newId = (): string => crypto.randomUUID();

export const ProjectId = {
  from: (value: string): ProjectId => value as ProjectId,
} as const;

export const PageId = {
  create: (): PageId => newId() as PageId,
  from: (value: string): PageId => value as PageId,
} as const;

export const NodeId = {
  create: (): NodeId => newId() as NodeId,
  from: (value: string): NodeId => value as NodeId,
} as const;

export const DialogId = {
  create: (): DialogId => newId() as DialogId,
  from: (value: string): DialogId => value as DialogId,
} as const;

export type ModelId = string & { readonly __brand: 'ModelId' };
export type FieldId = string & { readonly __brand: 'FieldId' };
export type RelationId = string & { readonly __brand: 'RelationId' };
export type RuleId = string & { readonly __brand: 'RuleId' };
export type ServiceId = string & { readonly __brand: 'ServiceId' };
export type UsecaseId = string & { readonly __brand: 'UsecaseId' };
export type CustomPartId = string & { readonly __brand: 'CustomPartId' };

export const ModelId = {
  create: (): ModelId => newId() as ModelId,
  from: (value: string): ModelId => value as ModelId,
} as const;

export const FieldId = {
  create: (): FieldId => newId() as FieldId,
  from: (value: string): FieldId => value as FieldId,
} as const;

export const RelationId = {
  create: (): RelationId => newId() as RelationId,
  from: (value: string): RelationId => value as RelationId,
} as const;

export const RuleId = {
  create: (): RuleId => newId() as RuleId,
  from: (value: string): RuleId => value as RuleId,
} as const;

export const ServiceId = {
  create: (): ServiceId => newId() as ServiceId,
  from: (value: string): ServiceId => value as ServiceId,
} as const;

export const UsecaseId = {
  create: (): UsecaseId => newId() as UsecaseId,
  from: (value: string): UsecaseId => value as UsecaseId,
} as const;

export const CustomPartId = {
  create: (): CustomPartId => newId() as CustomPartId,
  from: (value: string): CustomPartId => value as CustomPartId,
} as const;

export type ChannelId = string & { readonly __brand: 'ChannelId' };

export const ChannelId = {
  create: (): ChannelId => newId() as ChannelId,
  from: (value: string): ChannelId => value as ChannelId,
} as const;
