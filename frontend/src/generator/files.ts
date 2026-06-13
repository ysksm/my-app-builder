/** コード生成の出力単位。path はプロジェクトルートからの相対パス */
export type GeneratedFile = Readonly<{
  path: string;
  content: string;
  /**
   * false のときユーザー所有ファイル(カスタムコード保護 / FR-GEN-05)。
   * ビルドランナーは既に存在すれば上書きせず、ユーザーの手編集を保持する。
   * 省略時は true(生成ファイル = 毎回上書き)。
   */
  overwrite?: boolean;
}>;
