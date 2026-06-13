import type { ProjectDoc } from '@/domain/project-doc';
import { emitTokensCss, emitAppCss } from './emit-css';
import { emitDomainFiles } from './emit-domain';
import { emitComponentFile } from './emit-jsx';
import { emitProjectShell } from './emit-project';
import type { GeneratedFile } from './files';
import { buildNameTable } from './identifiers';

export type { GeneratedFile } from './files';

/**
 * ProjectDoc → ビルド可能な React アプリのソース一式。
 * 純粋関数(I/O なし)。書き出し・ビルドは BE のビルドランナーが担う。
 */
export const generateProject = (doc: ProjectDoc, projectName: string): GeneratedFile[] => {
  const names = buildNameTable(doc);
  return [
    ...emitProjectShell(doc, projectName, names),
    ...emitDomainFiles(doc.dataModel),
    ...doc.pages.map((page, i) => ({
      path: `src/pages/Page${i}.tsx`,
      content: emitComponentFile({
        componentName: `Page${i}`,
        originalName: page.name,
        root: page.root,
        names,
        importPrefix: '../',
      }),
    })),
    ...doc.dialogs.map((dialog, i) => ({
      path: `src/dialogs/Dialog${i}.tsx`,
      content: emitComponentFile({
        componentName: `Dialog${i}`,
        originalName: dialog.title,
        root: dialog.root,
        names,
        importPrefix: '../',
      }),
    })),
    { path: 'src/styles/tokens.css', content: emitTokensCss(doc.tokens) },
    { path: 'src/styles/app.css', content: emitAppCss() },
  ];
};
