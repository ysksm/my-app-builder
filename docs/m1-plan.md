# M1 技術計画 — コア編集

- 作成日: 2026-06-13
- 対象: マイルストーン M1(requirements.md §10)
- スコープ: キャンバス D&D / ヘッダー・フッター / ページ遷移 / ダイアログ / 属性編集 / プロジェクト保存(Rust BE 最小)

---

## 1. 完了の定義(Definition of Done)

M1 は以下を**すべて**満たしたとき完了とする。

### 機能(受け入れ基準)

| # | 基準 | 対応 FR |
|---|---|---|
| DoD-01 | パレットからキャンバスへ D&D でパーツを配置できる(コンテナ・テキスト・ボタン・入力・テーブル・画像) | FR-GUI-01 |
| DoD-02 | 配置済みパーツの選択・兄弟間並べ替え(D&D)・別コンテナへの移動・削除ができる | FR-GUI-02 |
| DoD-03 | レイヤーパネルにツリーが表示され、ツリーからの選択・削除ができる | FR-GUI-04 |
| DoD-04 | すべての編集操作が Undo / Redo できる | FR-GUI-05 |
| DoD-05 | ヘッダー・フッターを共通レイアウトとして編集し、ページ単位で適用 ON/OFF できる | FR-GUI-06 |
| DoD-06 | ページの作成・名称/パス変更・削除・切替ができる | FR-PAGE-01 |
| DoD-07 | ダイアログの作成・編集ができる | FR-PAGE-04 |
| DoD-08 | ボタン等の onClick に「ページ遷移」「ダイアログを開く」「ダイアログを閉じる」を紐付けられる | FR-EVT-01/02 |
| DoD-09 | プロパティパネルで選択パーツの属性(パーツ種別ごとの定義に従う)を編集できる | FR-PROP-01 |
| DoD-10 | エディタ内プレビューでページ遷移・ダイアログ開閉が実際に動作する(M2 コード生成の前段となるインタープリタ) | — |
| DoD-11 | プロジェクトが Rust BE(SQLite)に保存され、リロード後に復元される。編集は自動保存(デバウンス) | NFR-04 |

### 品質ゲート

| # | 基準 |
|---|---|
| DoD-Q1 | FE: `tsc --noEmit` / ESLint / `vite build` がエラーゼロ |
| DoD-Q2 | FE: Vitest がグリーン(ドキュメントモデル・reducer・イベントインタープリタのユニットテスト) |
| DoD-Q3 | BE: `cargo test` / `cargo clippy` がグリーン |
| DoD-Q4 | FE↔BE 結合: 保存→リロード→復元の手動シナリオが通る |

### M1 のスコープ外(後続へ)

- React コード生成・`vite build` 実行(M2)
- 自由配置(absolute)レイアウト — M1 は Flex フローのみ(リスク対策)
- モデルデザイナー / TypeSpec(M3)、コメント・共有(M4)、リアルタイム(M5)
- 認証・マルチユーザー

---

## 2. リポジトリ構成(モノレポ)

```
my-app-builder/
├── frontend/                 # ビルダー FE(React + TS + Vite 8)
│   └── src/
│       ├── domain/           # プロジェクトドキュメントモデル(brand + companion object)
│       │   ├── ids.ts        #   PageId / NodeId / DialogId(brand 型)
│       │   ├── component-node.ts
│       │   ├── page.ts / dialog.ts / project-doc.ts
│       │   ├── actions.ts    #   EventBinding / Action(判別共用体)
│       │   └── repositories/ #   ProjectRepository I/F(DIP)
│       ├── application/      # ユースケース相当(store 操作の薄いラッパ)
│       ├── infrastructure/
│       │   ├── api/          #   fetch ベース ProjectRepository 実装
│       │   └── local/        #   インメモリ実装(テスト・オフライン用)
│       ├── presentation/
│       │   ├── store/        #   Redux Toolkit(editorSlice + undo/redo)
│       │   ├── editor/       #   Canvas / Palette / LayerTree / PropertyPanel / PagesPanel
│       │   ├── preview/      #   インタープリタプレビュー
│       │   └── renderer/     #   ComponentNode → React 描画(編集/プレビュー共用)
│       ├── di/container.ts   # Composition Root(repository 注入)
│       └── shared/result.ts  # Result<T, E>
├── backend/                  # Rust(axum + tokio + rusqlite)
│   └── src/
│       ├── main.rs           # ルーティング / 起動
│       ├── store.rs          # SQLite アクセス(projects テーブル)
│       └── handlers.rs       # CRUD ハンドラ
├── docs/
└── requirements.md
```

ビルダー自身も生成物と同じ規約(class なし / brand / companion object / Result / DIP)で実装し、規約の妥当性を自分で検証する(ドッグフーディング)。

## 3. 設計の要点

### 3.1 プロジェクトドキュメントモデル(中核)

```
ProjectDoc
├── pages: Page[]            … id / name / path / root(ComponentNode) / useHeader / useFooter
├── layout: { header, footer } … 共通レイアウト(ComponentNode | null)
└── dialogs: DialogDef[]     … id / title / root

ComponentNode = { id, type, props, events, children }
EventBinding  = { event: 'onClick' | …, action: Action }
Action        = navigate(pageId) | openDialog(dialogId) | closeDialog | showToast(message)
```

- すべて `Readonly` + 純粋関数による操作(`ComponentNode.insertChild` 等)。Zod でスキーマ検証(保存/読込境界)
- パーツ種別ごとの**プロパティスキーマ定義**(`component-defs.ts`)がパレット・プロパティパネル・レンダラを駆動するメタデータになる(ToolJet/Appsmith のウィジェット定義方式を参考)

### 3.2 状態管理と Undo/Redo

- Redux Toolkit `editorSlice`: `{ doc, selection, currentPageId, editTarget }` 
- Undo/Redo は doc のスナップショット履歴(immer の構造共有でコスト低、上限 100)。選択状態は履歴対象外
- `editTarget`: `page | header | footer | dialog` — どのツリーを編集中かを表し、Canvas/LayerTree が共通に参照

### 3.3 D&D

- M1 は HTML5 Drag and Drop API(パレット→キャンバス、ノード並べ替え共通)。ドロップ位置はコンテナ内インデックスで表現(Flex フロー)
- ドロップ可否はパーツ定義の `acceptsChildren` で判定

### 3.4 プレビュー(インタープリタ)

- レンダラを `mode: 'edit' | 'preview'` で共用。preview では `EventBinding` を解釈し、ページ切替・ダイアログ開閉・トーストを実行
- M2 のコード生成は「このインタープリタと同じ意味論を TSX として出力する」関係になる

### 3.5 BE(Rust 最小)

- axum + tokio + rusqlite(`Mutex<Connection>`、M1 の単一ユーザー想定では十分)
- API: `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/:id`(doc は JSON カラムに保存、`updated_at` 付き)
- CORS 許可(dev)。FE は 1 秒デバウンスで PUT 自動保存

## 4. タスク分解(WBS)

| ID | タスク | 依存 | DoD 対応 |
|---|---|---|---|
| T1 | モノレポ雛形: FE(Vite 8 + React + TS strict + RTK + ESLint + Vitest)/ BE(cargo + axum)双方のビルドが通る | — | Q1, Q3 |
| T2 | ドメイン層: ドキュメントモデル + companion object + Zod スキーマ + ユニットテスト | T1 | Q2 |
| T3 | store: editorSlice(ツリー編集 reducer 群)+ Undo/Redo + テスト | T2 | 04, Q2 |
| T4 | パーツ定義カタログ + レンダラ(編集モード描画) | T2 | 01 |
| T5 | エディタ UI: キャンバス D&D・選択・並べ替え・削除 + パレット | T3, T4 | 01, 02 |
| T6 | レイヤーパネル / プロパティパネル | T5 | 03, 09 |
| T7 | ページ管理パネル + 共通レイアウト(ヘッダー/フッター)編集切替 | T5 | 05, 06 |
| T8 | ダイアログ編集 + イベントバインディング UI | T6, T7 | 07, 08 |
| T9 | プレビューモード(インタープリタ: 遷移・ダイアログ・トースト)+ テスト | T8 | 10, Q2 |
| T10 | Rust BE: projects CRUD + SQLite + テスト | T1 | 11, Q3 |
| T11 | FE 永続化: repository I/F + API/インメモリ実装 + DI + 自動保存 + 起動時復元 | T3, T10 | 11, Q4 |
| T12 | 品質ゲート一括検証(tsc / eslint / vite build / vitest / cargo test / clippy)+ 結合シナリオ確認 | T1–T11 | Q1–Q4 |
