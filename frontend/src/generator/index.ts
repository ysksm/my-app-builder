import type { ProjectDoc } from '@/domain/project-doc';
import { emitApiFiles } from './emit-api';
import { emitTokensCss, emitAppCss } from './emit-css';
import { emitCrudFiles } from './emit-crud';
import { emitDomainFiles } from './emit-domain';
import { emitComponentFile } from './emit-jsx';
import { emitProjectShell } from './emit-project';
import { emitTypeSpec } from './emit-typespec';
import { emitUsecaseFiles } from './emit-usecase';
import type { GeneratedFile } from './files';
import { buildNameTable } from './identifiers';
import { deriveInterfaceModel } from './interface-model';
import { paths } from './layout';

export type { GeneratedFile } from './files';

/**
 * ProjectDoc → ビルド可能な React アプリのソース一式(features × レイヤード構成)。
 * 純粋関数(I/O なし)。書き出し・ビルドは BE のビルドランナーが担う。
 */
export const generateProject = (doc: ProjectDoc, projectName: string): GeneratedFile[] => {
  const names = buildNameTable(doc);
  const ifModel = deriveInterfaceModel(doc.dataModel, `${projectName} API`);
  return [
    ...emitProjectShell(doc, projectName, names),
    ...emitDomainFiles(doc.dataModel),
    ...emitApiFiles(doc.dataModel),
    ...emitCrudFiles(doc.dataModel),
    ...emitUsecaseFiles(doc.dataModel),
    // TypeSpec アダプタによる I/F 定義の export(集約があるときのみ)。
    // interface/ は src 外なのでアプリのビルド対象にはならない設計ドキュメント兼コード生成元。
    ...(ifModel.operations.length > 0
      ? [{ path: 'interface/main.tsp', content: emitTypeSpec(ifModel) }]
      : []),
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
    { path: paths.tokensCss, content: emitTokensCss(doc.tokens, doc.styleEmitter) },
    { path: paths.appCss, content: emitAppCss() },
    // カスタムコード保護(FR-GEN-05)の第1消費者: ユーザー編集可・再生成で保持
    {
      path: paths.overridesCss,
      overwrite: false,
      content:
        '/* AppForge: カスタムスタイル。このファイルは再生成で上書きされません。 */\n' +
        '/* app.css の後に読み込まれるため、トークン変数を使った上書きをここに書けます。 */\n',
    },
  ];
};
