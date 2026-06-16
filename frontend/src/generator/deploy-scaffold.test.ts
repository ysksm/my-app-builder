import { describe, expect, it } from 'vitest';
import { ProjectDoc } from '@/domain/project-doc';
import { generateProject } from './index';

describe('デプロイ雛形の生成 (J1)', () => {
  const files = generateProject(ProjectDoc.create(), 'x');
  const find = (p: string) => files.find((f) => f.path === p);

  it('Dockerfile / nginx.conf / .dockerignore を出力する', () => {
    expect(find('Dockerfile')?.content).toContain('FROM nginx:alpine');
    expect(find('nginx.conf')?.content).toContain('try_files');
    expect(find('.dockerignore')?.content).toContain('node_modules');
  });

  it('雛形はユーザー所有(overwrite:false)で再生成時に保護される', () => {
    expect(find('Dockerfile')?.overwrite).toBe(false);
    expect(find('nginx.conf')?.overwrite).toBe(false);
  });
});
