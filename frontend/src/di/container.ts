import type { ProjectRepository } from '@/domain/repositories/project-repository';
import { createApiProjectRepository } from '@/infrastructure/api/api-project-repository';
import { createInMemoryProjectRepository } from '@/infrastructure/local/in-memory-project-repository';

export type Container = Readonly<{
  projectRepository: ProjectRepository;
}>;

/**
 * Composition Root。VITE_APP_MODE=mock で全 repository がインメモリ実装に切り替わる
 * (生成アプリにも同じ仕組みを出力する予定 — requirements.md FR-GEN-02)
 */
const mode: string = import.meta.env.VITE_APP_MODE ?? 'api';

export const container: Container = {
  projectRepository:
    mode === 'mock' ? createInMemoryProjectRepository() : createApiProjectRepository(),
};
