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

// ---------- リアルタイムモニタリング部品の共有プロパティ ----------
// metric / gauge / lamp は同じデータチャネル(FR-RT-01)としきい値(FR-RT-04)を使う

const channelDefaults: Readonly<Record<string, PropValue>> = {
  source: 'mock',
  channel: 'cpu',
  min: 0,
  max: 100,
  interval: 1000,
  host: '127.0.0.1:5502',
  unit_id: 1,
  register: 0,
  scale: 1,
};

const channelFields: ReadonlyArray<PropFieldDef> = [
  {
    key: 'source',
    label: 'データ源',
    input: 'select',
    options: [
      { value: 'mock', label: '模擬データ' },
      { value: 'live', label: 'ライブ(WS)' },
      { value: 'modbus', label: 'Modbus/TCP' },
    ],
  },
  { key: 'channel', label: 'チャネル ID', input: 'text' },
  // Modbus/TCP(source=modbus のときのみ意味を持つ)
  { key: 'host', label: 'Modbus host:port', input: 'text' },
  { key: 'unit_id', label: 'Modbus ユニット ID', input: 'number' },
  { key: 'register', label: '保持レジスタ番号', input: 'number' },
  { key: 'scale', label: 'スケール係数', input: 'number' },
  { key: 'min', label: '最小値', input: 'number' },
  { key: 'max', label: '最大値', input: 'number' },
  { key: 'interval', label: '更新間隔(ms)', input: 'number' },
];

// しきい値アラート(FR-RT-04)。空欄=無効。上限/下限それぞれに警告・危険を設定可能
const thresholdFields: ReadonlyArray<PropFieldDef> = [
  { key: 'warnAbove', label: '警告(以上)', input: 'number' },
  { key: 'critAbove', label: '危険(以上)', input: 'number' },
  { key: 'warnBelow', label: '警告(以下)', input: 'number' },
  { key: 'critBelow', label: '危険(以下)', input: 'number' },
];

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
  metric: {
    type: 'metric',
    label: '数値カード',
    icon: '📊',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    // リアルタイムモニタリング: 模擬(mock)/ WS(live)/ Modbus でデータチャネルを購読
    defaultProps: { label: 'CPU 使用率', unit: '%', decimals: 0, ...channelDefaults },
    propFields: [
      { key: 'label', label: 'ラベル', input: 'text' },
      { key: 'unit', label: '単位', input: 'text' },
      ...channelFields,
      { key: 'decimals', label: '小数桁', input: 'number' },
      ...thresholdFields,
    ],
  },
  gauge: {
    type: 'gauge',
    label: 'ゲージ',
    icon: '🎚️',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    // [min,max] に対する現在値を横バーで表示。しきい値で色が変わる
    defaultProps: { label: '温度', unit: '℃', decimals: 1, ...channelDefaults, max: 200 },
    propFields: [
      { key: 'label', label: 'ラベル', input: 'text' },
      { key: 'unit', label: '単位', input: 'text' },
      ...channelFields,
      { key: 'decimals', label: '小数桁', input: 'number' },
      ...thresholdFields,
    ],
  },
  lamp: {
    type: 'lamp',
    label: 'ステータスランプ',
    icon: '🚦',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    // しきい値の重大度を色付きランプで表す(正常=緑 / 警告=黄 / 危険=赤)
    defaultProps: {
      label: '稼働状態',
      ...channelDefaults,
      channel: 'status',
      warnAbove: 70,
      critAbove: 90,
    },
    propFields: [
      { key: 'label', label: 'ラベル', input: 'text' },
      ...channelFields,
      ...thresholdFields,
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
