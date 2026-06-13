import type { GeneratedFile } from '@/generator';

/** 既存 Rust BE の REST API クライアント。永続化・ビルドはすべて BE に委譲する */
const BASE = process.env['APPFORGE_API'] ?? 'http://localhost:8787';

export type ApiSummary = Readonly<{ id: string; name: string; updated_at: number }>;
export type ApiProject = ApiSummary & Readonly<{ doc: unknown }>;

const request = async (path: string, init?: RequestInit): Promise<unknown> => {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    throw new Error(`AppForge BE エラー: HTTP ${res.status}(${BASE}${path})— BE が起動しているか確認してください`);
  }
  return res.json();
};

export const api = {
  listProjects: (): Promise<ReadonlyArray<ApiSummary>> =>
    request('/api/projects') as Promise<ReadonlyArray<ApiSummary>>,

  getProject: (id: string): Promise<ApiProject> =>
    request(`/api/projects/${id}`) as Promise<ApiProject>,

  build: (id: string, files: ReadonlyArray<GeneratedFile>): Promise<{ ok: boolean; log: string }> =>
    request(`/api/projects/${id}/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files }),
    }) as Promise<{ ok: boolean; log: string }>,

  previewUrl: (id: string): string => `${BASE}/preview/${id}/`,
} as const;
