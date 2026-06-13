import type { ProjectDoc } from '@/domain/project-doc';
import { emitTokensCss, emitAppCss } from './emit-css';
import { emitCrudFiles } from './emit-crud';
import { emitDomainFiles } from './emit-domain';
import { emitComponentFile } from './emit-jsx';
import { emitProjectShell } from './emit-project';
import type { GeneratedFile } from './files';
import { buildNameTable } from './identifiers';
import { paths } from './layout';

export type { GeneratedFile } from './files';

/**
 * ProjectDoc → ビルド可能な React アプリのソース一式(features × レイヤード構成)。
 * 純粋関数(I/O なし)。書き出し・ビルドは BE のビルドランナーが担う。
 */
export const generateProject = (doc: ProjectDoc, projectName: string): GeneratedFile[] => {
  const names = buildNameTable(doc);
  return [
    ...emitProjectShell(doc, projectName, names),
    ...emitDomainFiles(doc.dataModel),
    ...emitCrudFiles(doc.dataModel),
    ...doc.pages.map((page, i) => ({
      path: paths.page(i),
      content: emitComponentFile({
        componentName: `Page${i}`,
        originalName: page.name,
        root: page.root,
        names,
        filePath: paths.page(i),
      }),
    })),
    ...doc.dialogs.map((dialog, i) => ({
      path: paths.dialog(i),
      content: emitComponentFile({
        componentName: `Dialog${i}`,
        originalName: dialog.title,
        root: dialog.root,
        names,
        filePath: paths.dialog(i),
      }),
    })),
    { path: paths.tokensCss, content: emitTokensCss(doc.tokens) },
    { path: paths.appCss, content: emitAppCss() },
  ];
};
