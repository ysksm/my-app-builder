import type { Result } from '@/shared/result';
import { ProjectDoc } from '@/domain/project-doc';
import type {
  ProjectRepository,
  RepositoryError,
  StoredProject,
} from '@/domain/repositories/project-repository';

/** 既存プロジェクトの先頭を開く。なければ初期ドキュメントで新規作成する(M1 は単一プロジェクト運用) */
export const loadOrCreateProject = async (
  repository: ProjectRepository,
): Promise<Result<StoredProject, RepositoryError>> => {
  const listed = await repository.list();
  if (!listed.ok) return listed;
  const first = listed.value[0];
  if (first) return repository.get(first.id);
  return repository.create('マイアプリ', ProjectDoc.create());
};
