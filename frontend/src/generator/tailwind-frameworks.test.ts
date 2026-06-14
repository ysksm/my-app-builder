import { describe, expect, it } from 'vitest';
import { ProjectDoc } from '@/domain/project-doc';
import { applyCommand } from '@/application/commands';
import { generateProject } from './index';
import { generateVueProject } from './emit-vue-project';
import { generateSvelteProject } from './emit-svelte-project';
import { generateRemixProject } from './emit-remix-project';

const tailwindDoc = () => {
  const res = applyCommand(ProjectDoc.create(), { kind: 'setStyleEmitter', emitter: 'tailwind' });
  if (!res.ok) throw new Error('setup');
  return res.value.doc;
};

const get = (files: ReadonlyArray<{ path: string; content: string }>, path: string) =>
  files.find((f) => f.path.includes(path))?.content ?? '';

describe('Tailwind emitter を全フレームワークで選択可能(FR-DS-05 / FR-GEN-07)', () => {
  const doc = tailwindDoc();

  const cases: ReadonlyArray<{ fw: string; files: () => ReadonlyArray<{ path: string; content: string }>; tokens: string; pkg: string; vite: string }> = [
    { fw: 'React', files: () => generateProject(doc, 'x'), tokens: 'tokens.css', pkg: 'package.json', vite: 'vite.config.ts' },
    { fw: 'Vue', files: () => generateVueProject(doc, 'x'), tokens: 'tokens.css', pkg: 'package.json', vite: 'vite.config.ts' },
    { fw: 'Svelte', files: () => generateSvelteProject(doc, 'x'), tokens: 'tokens.css', pkg: 'package.json', vite: 'vite.config.ts' },
    { fw: 'Remix', files: () => generateRemixProject(doc, 'x'), tokens: 'tokens.css', pkg: 'package.json', vite: 'vite.config.ts' },
  ];

  for (const cse of cases) {
    it(`${cse.fw}: tokens.css に @theme、vite に tailwindcss()、package に @tailwindcss/vite`, () => {
      const files = cse.files();
      expect(get(files, cse.tokens)).toContain('@import "tailwindcss"');
      expect(get(files, cse.tokens)).toContain('@theme');
      expect(get(files, cse.vite)).toContain('tailwindcss()');
      expect(get(files, cse.pkg)).toContain('@tailwindcss/vite');
    });
  }

  it('css-variables(既定)では tailwind を配線しない', () => {
    const def = ProjectDoc.create();
    const vue = generateVueProject(def, 'x');
    expect(get(vue, 'tokens.css')).toContain(':root');
    expect(get(vue, 'tokens.css')).not.toContain('@import "tailwindcss"');
    expect(get(vue, 'vite.config.ts')).not.toContain('tailwindcss()');
    expect(get(vue, 'package.json')).not.toContain('@tailwindcss/vite');
  });
});
