import { err, ok, type Result } from '@/shared/result';
import { ProjectId } from '@/domain/ids';
import { parseProjectDoc } from '@/domain/schema';
import {
  RepositoryError,
  type ProjectRepository,
  type StoredProject,
} from '@/domain/repositories/project-repository';

type ApiSummary = Readonly<{ id: string; name: string; updated_at: number }>;
type ApiProject = ApiSummary & Readonly<{ doc: unknown }>;

const toStored = (raw: ApiProject): Result<StoredProject, RepositoryError> => {
  const doc = parseProjectDoc(raw.doc);
  if (!doc.ok) return err(RepositoryError.create('INVALID_DOC', doc.error.message));
  return ok({
    id: ProjectId.from(raw.id),
    name: raw.name,
    doc: doc.value,
    updatedAt: raw.updated_at,
  });
};

/** Rust BE の REST API を叩く ProjectRepository 実装 */
export const createApiProjectRepository = (baseUrl = '/api'): ProjectRepository => {
  const request = async (
    path: string,
    init?: RequestInit,
  ): Promise<Result<unknown, RepositoryError>> => {
    try {
      const res = await fetch(`${baseUrl}${path}`, init);
      if (res.status === 404) return err(RepositoryError.create('NOT_FOUND', 'project not found'));
      if (!res.ok) return err(RepositoryError.create('NETWORK', `HTTP ${res.status}`));
      return ok(await res.json());
    } catch (e) {
      return err(
        RepositoryError.create('NETWORK', e instanceof Error ? e.message : 'network error'),
      );
    }
  };

  const jsonInit = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  return {
    async list() {
      const res = await request('/projects');
      if (!res.ok) return res;
      const items = res.value as ReadonlyArray<ApiSummary>;
      return ok(
        items.map((i) => ({ id: ProjectId.from(i.id), name: i.name, updatedAt: i.updated_at })),
      );
    },

    async get(id) {
      const res = await request(`/projects/${id}`);
      if (!res.ok) return res;
      return toStored(res.value as ApiProject);
    },

    async create(name, doc) {
      const res = await request('/projects', jsonInit('POST', { name, doc }));
      if (!res.ok) return res;
      return toStored(res.value as ApiProject);
    },

    async save(id, name, doc) {
      const res = await request(`/projects/${id}`, jsonInit('PUT', { name, doc }));
      if (!res.ok) return res;
      return toStored(res.value as ApiProject);
    },
  };
};
