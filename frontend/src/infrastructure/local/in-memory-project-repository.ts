import { err, ok } from '@/shared/result';
import { ProjectId } from '@/domain/ids';
import type { ProjectDoc } from '@/domain/project-doc';
import {
  RepositoryError,
  type ProjectRepository,
} from '@/domain/repositories/project-repository';

type Stored = { name: string; doc: ProjectDoc; updatedAt: number };

/** インメモリ実装。mock モード・テストで API 実装の代わりに注入する(DIP) */
export const createInMemoryProjectRepository = (): ProjectRepository => {
  const items = new Map<string, Stored>();

  return {
    async list() {
      return ok(
        [...items.entries()].map(([id, v]) => ({
          id: ProjectId.from(id),
          name: v.name,
          updatedAt: v.updatedAt,
        })),
      );
    },

    async get(id) {
      const item = items.get(id);
      if (!item) return err(RepositoryError.create('NOT_FOUND', 'project not found'));
      return ok({ id, ...item });
    },

    async create(name, doc) {
      const id = ProjectId.from(crypto.randomUUID());
      items.set(id, { name, doc, updatedAt: Date.now() });
      return ok({ id, name, doc, updatedAt: items.get(id)!.updatedAt });
    },

    async save(id, name, doc) {
      if (!items.has(id)) return err(RepositoryError.create('NOT_FOUND', 'project not found'));
      const stored = { name, doc, updatedAt: Date.now() };
      items.set(id, stored);
      return ok({ id, ...stored });
    },
  };
};
