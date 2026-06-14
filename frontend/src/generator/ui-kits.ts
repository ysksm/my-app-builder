/**
 * UIライブラリ(kit)レジストリ(FR-GUI-11)。フレームワークごとに選べる UIライブラリの一覧。
 * ビルダーの選択 UI と generator の双方が参照する。中立コンポーネントを各 kit の部品へ
 * アダプタで変換し、kit が持たない部品は plain(c-*)へフォールバックする。
 */
export type UiKitInfo = Readonly<{ id: string; label: string }>;

/** デザイン対象に選べるフレームワーク(デザイン前に選ぶ。Angular は将来) */
export const TARGET_FRAMEWORKS: ReadonlyArray<UiKitInfo> = [
  { id: 'react', label: 'React' },
  { id: 'svelte', label: 'Svelte' },
  { id: 'angular', label: 'Angular' },
];

export const UI_KITS: Readonly<Record<string, ReadonlyArray<UiKitInfo>>> = {
  react: [
    { id: 'plain', label: '標準スタイル(c-*)' },
    { id: 'mui', label: 'MUI(Material UI)' },
    { id: 'react-aria', label: 'React Aria(ヘッドレス)' },
    { id: 'headless', label: 'Headless UI(対話部品)' },
  ],
  svelte: [
    { id: 'plain', label: '標準スタイル(c-*)' },
    { id: 'bits', label: 'Bits UI(ヘッドレス)' },
  ],
};

/** doc.uiKits からフレームワークの kit id を解決(未設定なら plain) */
export const kitIdOf = (uiKits: Readonly<Record<string, string>>, framework: string): string =>
  uiKits[framework] ?? 'plain';
