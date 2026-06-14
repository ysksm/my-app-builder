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
  /** UIライブラリ固有部品。設定時はその kit を選んでいる間だけパレットに出す(未設定=中立) */
  kit?: string;
}>;

// ---------- リアルタイムモニタリング部品の共有プロパティ ----------
// metric / gauge / lamp は同じデータチャネル(FR-RT-01)としきい値(FR-RT-04)を使う

const channelDefaults: Readonly<Record<string, PropValue>> = {
  // channelRef を設定すると登録簿のチャネルから source/min/max/interval/Modbus を継承する
  channelRef: '',
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
  // データチャネル登録簿への参照(PropertyPanel が登録済みチャネルで options を埋める)
  { key: 'channelRef', label: 'データチャネル', input: 'select', options: [] },
  {
    key: 'source',
    label: 'データ源(直接指定)',
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
  chart: {
    type: 'chart',
    label: 'チャート',
    icon: '📈',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    // 直近 capacity サンプルをスパークラインで時系列表示(FR-RT-03)
    defaultProps: { label: 'トレンド', unit: '%', decimals: 1, capacity: 40, ...channelDefaults },
    propFields: [
      { key: 'label', label: 'ラベル', input: 'text' },
      { key: 'unit', label: '単位', input: 'text' },
      ...channelFields,
      { key: 'decimals', label: '小数桁', input: 'number' },
      { key: 'capacity', label: '保持サンプル数', input: 'number' },
      ...thresholdFields,
    ],
  },
  setpoint: {
    type: 'setpoint',
    label: '設定値の書き込み',
    icon: '🎛️',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    // 設定ツール: フォーム値をチャネル経由で機器へ書き込む(確認ダイアログ付き、FR-RT-05)
    defaultProps: {
      label: '目標温度',
      unit: '℃',
      value: 25,
      writeLabel: '書き込み',
      confirmMessage: 'この値を機器へ書き込みます。よろしいですか?',
      ...channelDefaults,
      channel: 'setpoint',
    },
    propFields: [
      { key: 'label', label: 'ラベル', input: 'text' },
      { key: 'unit', label: '単位', input: 'text' },
      { key: 'value', label: '初期値', input: 'number' },
      ...channelFields,
      { key: 'writeLabel', label: 'ボタン文言', input: 'text' },
      { key: 'confirmMessage', label: '確認メッセージ', input: 'text' },
    ],
  },
  // ---------- 外部ライブラリ製コンポーネント(vanilla JS)----------
  uplot: {
    type: 'uplot',
    label: 'uPlot 時系列',
    icon: '📉',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    // 高速時系列ライブラリ uPlot。DataChannel の系列を直近 capacity 件で折れ線描画
    defaultProps: { label: 'uPlot トレンド', unit: '%', decimals: 1, capacity: 60, ...channelDefaults },
    propFields: [
      { key: 'label', label: 'ラベル', input: 'text' },
      { key: 'unit', label: '単位', input: 'text' },
      ...channelFields,
      { key: 'decimals', label: '小数桁', input: 'number' },
      { key: 'capacity', label: '保持サンプル数', input: 'number' },
      ...thresholdFields,
    ],
  },
  echarts: {
    type: 'echarts',
    label: 'ECharts チャート',
    icon: '📊',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    // Apache ECharts。chartType で gauge / line / bar を切替。DataChannel に接続
    defaultProps: {
      label: 'ECharts',
      unit: '%',
      decimals: 1,
      capacity: 40,
      chartType: 'gauge',
      ...channelDefaults,
    },
    propFields: [
      { key: 'label', label: 'ラベル', input: 'text' },
      { key: 'unit', label: '単位', input: 'text' },
      {
        key: 'chartType',
        label: '種類',
        input: 'select',
        options: [
          { value: 'gauge', label: 'ゲージ' },
          { value: 'line', label: '折れ線' },
          { value: 'bar', label: '棒' },
        ],
      },
      ...channelFields,
      { key: 'decimals', label: '小数桁', input: 'number' },
      { key: 'capacity', label: '保持サンプル数', input: 'number' },
      ...thresholdFields,
    ],
  },
  aggrid: {
    type: 'aggrid',
    label: 'AG Grid 表',
    icon: '🗂️',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    // AG Grid データグリッド。列はカンマ区切り、行数分のサンプル行を描画(ソート/フィルタ可)
    defaultProps: { columns: 'ID,名前,状態,数量', rows: 6 },
    propFields: [
      { key: 'columns', label: '列(カンマ区切り)', input: 'text' },
      { key: 'rows', label: 'サンプル行数', input: 'number' },
    ],
  },
  // ---------- 対話部品(UIライブラリ選択で kit の部品に切替)----------
  disclosure: {
    type: 'disclosure',
    label: 'アコーディオン',
    icon: '🔽',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    // plain は <details>(ステートレス)。Headless UI 等を選ぶと kit の Disclosure
    defaultProps: { title: '詳細を表示', content: 'ここに内容が入ります。' },
    propFields: [
      { key: 'title', label: '見出し', input: 'text' },
      { key: 'content', label: '内容', input: 'textarea' },
    ],
  },
  menu: {
    type: 'menu',
    label: 'ドロップダウン',
    icon: '🔻',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    // plain は <details>。Headless UI 等を選ぶと kit の Menu。項目はカンマ区切り
    defaultProps: { label: 'メニュー', items: '編集,複製,削除' },
    propFields: [
      { key: 'label', label: 'ボタン文言', input: 'text' },
      { key: 'items', label: '項目(カンマ区切り)', input: 'text' },
    ],
  },
  switch: {
    type: 'switch',
    label: 'トグル',
    icon: '🔘',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    // plain はチェックボックス。MUI/React Aria を選ぶと Switch
    defaultProps: { label: '通知を受け取る', checked: true },
    propFields: [
      { key: 'label', label: 'ラベル', input: 'text' },
      { key: 'checked', label: '初期 ON', input: 'checkbox' },
    ],
  },
  tabs: {
    type: 'tabs',
    label: 'タブ',
    icon: '📑',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    // plain は全タブを縦に並べる(ステートレス)。Headless UI/React Aria を選ぶと切替式タブ
    defaultProps: { tabs: 'タブ1,タブ2,タブ3' },
    propFields: [{ key: 'tabs', label: 'タブ(カンマ区切り)', input: 'text' }],
  },
  // ---------- UIライブラリ固有部品(MUI) ----------
  rating: {
    type: 'rating',
    label: 'レーティング',
    icon: '⭐',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    kit: 'mui',
    defaultProps: { label: '評価', value: 3, max: 5 },
    propFields: [
      { key: 'label', label: 'ラベル', input: 'text' },
      { key: 'value', label: '初期値', input: 'number' },
      { key: 'max', label: '最大', input: 'number' },
    ],
  },
  slider: {
    type: 'slider',
    label: 'スライダー',
    icon: '🎚️',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    kit: 'mui',
    defaultProps: { label: '音量', value: 40, min: 0, max: 100 },
    propFields: [
      { key: 'label', label: 'ラベル', input: 'text' },
      { key: 'value', label: '初期値', input: 'number' },
      { key: 'min', label: '最小', input: 'number' },
      { key: 'max', label: '最大', input: 'number' },
    ],
  },
  chip: {
    type: 'chip',
    label: 'チップ',
    icon: '🏷️',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    kit: 'mui',
    defaultProps: { label: 'タグ', color: 'primary' },
    propFields: [
      { key: 'label', label: 'ラベル', input: 'text' },
      {
        key: 'color',
        label: '色',
        input: 'select',
        options: [
          { value: 'primary', label: 'プライマリ' },
          { value: 'secondary', label: 'セカンダリ' },
          { value: 'default', label: '標準' },
        ],
      },
    ],
  },
  alert: {
    type: 'alert',
    label: 'アラート',
    icon: '🚨',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    kit: 'mui',
    defaultProps: { message: '情報メッセージです。', severity: 'info' },
    propFields: [
      { key: 'message', label: 'メッセージ', input: 'text' },
      {
        key: 'severity',
        label: '種類',
        input: 'select',
        options: [
          { value: 'info', label: '情報' },
          { value: 'success', label: '成功' },
          { value: 'warning', label: '警告' },
          { value: 'error', label: 'エラー' },
        ],
      },
    ],
  },
  badge: {
    type: 'badge',
    label: 'バッジ',
    icon: '🔔',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    kit: 'mui',
    defaultProps: { label: '通知', count: 4, color: 'primary' },
    propFields: [
      { key: 'label', label: 'ラベル', input: 'text' },
      { key: 'count', label: '数値', input: 'number' },
      {
        key: 'color',
        label: '色',
        input: 'select',
        options: [
          { value: 'primary', label: 'プライマリ' },
          { value: 'secondary', label: 'セカンダリ' },
          { value: 'error', label: 'エラー' },
        ],
      },
    ],
  },
  avatar: {
    type: 'avatar',
    label: 'アバター',
    icon: '🟣',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    kit: 'mui',
    defaultProps: { label: 'AB' },
    propFields: [{ key: 'label', label: 'イニシャル', input: 'text' }],
  },
  // ---------- UIライブラリ固有部品(Headless UI) ----------
  combobox: {
    type: 'combobox',
    label: 'コンボボックス',
    icon: '🔍',
    acceptsChildren: false,
    inPalette: true,
    supportsEvents: false,
    kit: 'headless',
    // Headless UI Combobox(入力フィルタ付き選択)。plain は <select>
    defaultProps: { options: 'りんご,ぶどう,みかん,もも', placeholder: '検索…' },
    propFields: [
      { key: 'options', label: '選択肢(カンマ区切り)', input: 'text' },
      { key: 'placeholder', label: 'プレースホルダ', input: 'text' },
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
