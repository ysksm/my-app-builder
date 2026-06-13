/** コード生成の出力単位。path はプロジェクトルートからの相対パス */
export type GeneratedFile = Readonly<{
  path: string;
  content: string;
}>;
