import type { Result } from '@/shared/result';
import type { ProjectId } from '../ids';
import type { ProjectDoc } from '../project-doc';

export type ProjectSummary = Readonly<{
  id: ProjectId;
  name: string;
  updatedAt: number;
}>;

export type StoredProject = Readonly<{
  id: ProjectId;
  name: string;
  doc: ProjectDoc;
  updatedAt: number;
}>;

export type RepositoryErrorCode = 'NOT_FOUND' | 'NETWORK' | 'INVALID_DOC';

export type RepositoryError = Readonly<{
  code: RepositoryErrorCode;
  message: string;
}>;

export const RepositoryError = {
  create: (code: RepositoryErrorCode, message: string): RepositoryError => ({ code, message }),
} as const;

/** domain 層の I/F。実装は infrastructure 層(api / local)が提供する(DIP) */
export type ProjectRepository = Readonly<{
  list(): Promise<Result<ReadonlyArray<ProjectSummary>, RepositoryError>>;
  get(id: ProjectId): Promise<Result<StoredProject, RepositoryError>>;
  create(name: string, doc: ProjectDoc): Promise<Result<StoredProject, RepositoryError>>;
  save(id: ProjectId, name: string, doc: ProjectDoc): Promise<Result<StoredProject, RepositoryError>>;
}>;
