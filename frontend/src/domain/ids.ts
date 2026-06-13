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
