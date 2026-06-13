import type { ComponentType, PropValue } from '@/domain/component-node';

export type PropFieldDef = Readonly<{
  key: string;
  label: string;
  input: 'text' | 'number' | 'select' | 'checkbox' | 'textarea';
  options?: ReadonlyArray<Readonly<{ value: string; label: string }>>;
}>;

export type ComponentDef = Readonly<{
  type: ComponentType;
  label: string;
  icon: string;
  acceptsChildren: boolean;
  inPalette: boolean;
  supportsEvents: boolean;
  defaultProps: Readonly<Record<string, PropValue>>;
  propFields: ReadonlyArray<PropFieldDef>;
}>;

/** パーツ定義カタログ。パレット・プロパティパネル・レンダラを駆動するメタデータ */
export const componentDefs: Readonly<Record<ComponentType, ComponentDef>> = {
  container: {
    type: 'container',
    label: 'コンテナ',
    icon: '▦',
    acceptsChildren: true,
    inPalette: true,
    supportsEvents: false,
    defaultProps: { direction: 'column', gap: 12, padding: 16, background: '' },
    propFields: [
      {
        key: 'direction',
        label: '方向',
        input: 'select',
        options: [
          { value: 'column', label: '縦' },
          { value: 'row', label: '横' },
        ],
      },
      { key: 'gap', label: '間隔(px)', input: 'number' },
      { key: 'padding', label: '余白(px)', input: 'number' },
      { key: 'background', label: '背景色', input: 'text' },
    ],
  },
  heading: {
    type: 'heading',
    label: '見出し',
    icon: 'H',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    defaultProps: { text: '見出し', level: 2 },
    propFields: [
      { key: 'text', label: 'テキスト', input: 'text' },
      {
        key: 'level',
        label: 'レベル',
        input: 'select',
        options: [
          { value: '1', label: 'H1' },
          { value: '2', label: 'H2' },
          { value: '3', label: 'H3' },
        ],
      },
    ],
  },
  text: {
    type: 'text',
    label: 'テキスト',
    icon: 'T',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    defaultProps: { text: 'テキスト' },
    propFields: [{ key: 'text', label: '本文', input: 'textarea' }],
  },
  button: {
    type: 'button',
    label: 'ボタン',
    icon: '⏺',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: true,
    defaultProps: { label: 'ボタン', variant: 'primary' },
    propFields: [
      { key: 'label', label: 'ラベル', input: 'text' },
      {
        key: 'variant',
        label: 'スタイル',
        input: 'select',
        options: [
          { value: 'primary', label: 'プライマリ' },
          { value: 'secondary', label: 'セカンダリ' },
          { value: 'danger', label: '警告' },
        ],
      },
    ],
  },
  input: {
    type: 'input',
    label: '入力',
    icon: '✎',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    defaultProps: { label: 'ラベル', placeholder: '', inputType: 'text' },
    propFields: [
      { key: 'label', label: 'ラベル', input: 'text' },
      { key: 'placeholder', label: 'プレースホルダ', input: 'text' },
      {
        key: 'inputType',
        label: '種別',
        input: 'select',
        options: [
          { value: 'text', label: 'テキスト' },
          { value: 'number', label: '数値' },
          { value: 'date', label: '日付' },
          { value: 'password', label: 'パスワード' },
        ],
      },
    ],
  },
  image: {
    type: 'image',
    label: '画像',
    icon: '🖼',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    defaultProps: { src: 'https://placehold.co/320x180', width: 320 },
    propFields: [
      { key: 'src', label: 'URL', input: 'text' },
      { key: 'width', label: '幅(px)', input: 'number' },
    ],
  },
  table: {
    type: 'table',
    label: 'テーブル',
    icon: '▤',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    defaultProps: { columns: 'ID,名前,状態', rows: 3 },
    propFields: [
      { key: 'columns', label: '列(カンマ区切り)', input: 'text' },
      { key: 'rows', label: '行数', input: 'number' },
    ],
  },
  header: {
    type: 'header',
    label: 'ヘッダー',
    icon: '▔',
    acceptsChildren: true,
    inPalette: false,
    supportsEvents: false,
    defaultProps: { title: 'My App' },
    propFields: [{ key: 'title', label: 'タイトル', input: 'text' }],
  },
  footer: {
    type: 'footer',
    label: 'フッター',
    icon: '▁',
    acceptsChildren: false,
    inPalette: false,
    supportsEvents: false,
    defaultProps: { text: '© 2026 My App' },
    propFields: [{ key: 'text', label: 'テキスト', input: 'text' }],
  },
};

export const paletteDefs: ReadonlyArray<ComponentDef> = Object.values(componentDefs).filter(
  (d) => d.inPalette,
);

export const propValueOf = (
  props: Readonly<Record<string, PropValue>>,
  def: ComponentDef,
  key: string,
): PropValue => props[key] ?? def.defaultProps[key] ?? '';
