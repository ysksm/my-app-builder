# M2 技術計画 — React コード生成 + 実行モード

- 作成日: 2026-06-13
- 対象: マイルストーン M2(requirements.md §10)
- スコープ: React コード生成(レイヤード/DI/Result)、vite build 成功、実行モード、デザイントークン基盤(css-variables emitter)

---

## 1. 完了の定義(Definition of Done)

### 機能

| # | 基準 | 対応 FR |
|---|---|---|
| DoD-01 | ドキュメント(ページ / 共通ヘッダー・フッター / ダイアログ / イベント)から React アプリのソース一式を生成できる | FR-GEN-* |
| DoD-02 | 生成アプリで M1 プレビューと同じ意味論が動く: React Router によるページ遷移・ダイアログ開閉・トースト(= `preview-interpreter.ts` と同等) | FR-PAGE-02/04 |
| DoD-03 | 生成コードはレイヤード構成 + DI スキャフォールド(`shared/result.ts`, `di/container.ts`, `VITE_APP_MODE=mock` 切替)を含む | FR-GEN-01/02 |
| DoD-04 | デザイントークン: ProjectDoc に DTCG 互換トークンを保持し、**css-variables emitter** が `tokens.css` を生成。生成 UI はトークン(CSS 変数)を参照 | FR-DS-01/05 |
| DoD-05 | **実行モード**: ビルダーの「実行」で BE が生成ソースを書き出し→依存解決→`npm run build`(tsc + vite build)→ プレビュー URL を iframe 表示 | FR-RUN-01/02 |
| DoD-06 | 生成ソース一式を zip でダウンロードできる | — |
| DoD-07 | ビルド失敗時はログをビルダー上に表示する | — |

### 品質ゲート

| # | 基準 |
|---|---|
| DoD-Q1 | 生成アプリが `tsc --noEmit`(strict)+ `vite build` をエラーゼロで通過(BE ランナー上で実証) | 
| DoD-Q2 | ジェネレータのユニットテスト(イベント→コード変換、識別子サニタイズ、トークン emitter、ファイルセット) |
| DoD-Q3 | ビルダー自身の品質ゲート(tsc / eslint / vitest / build / cargo test / clippy)が引き続き全グリーン |
| DoD-Q4 | E2E: 実行モードで生成アプリが iframe 内で動作(遷移・ダイアログ)することをブラウザで確認 |

### M2 の割り切り(後続へ)

- 生成アプリのルーティングは **HashRouter**(`/preview/{id}/` 配下のサブパス配信で basename 問題を避ける)。M3 以降で BrowserRouter + basename に切替
- トークンエディタ UI は M4(M2 はデフォルトトークン固定)
- 再生成時のカスタムコード保護(FR-GEN-05)は M3 で本格化(M2 は全量上書き)
- データ取得系(repository 実装)は M3(TypeSpec/中立 I/F モデル)から。M2 は DI の器のみ

## 2. アーキテクチャ

```
FE(frontend/src/generator/)          BE(backend/src/build.rs)
┌──────────────────────────┐  files   ┌─────────────────────────────┐
│ generateProject(doc)      │ ───────→ │ POST /api/projects/{id}/build│
│  - emit-project(雛形)     │  JSON    │  workspaces/{id}/ に書き出し  │
│  - emit-jsx(ページ/部品)  │          │  npm install(初回/依存変更時)│
│  - emit-css(tokens/app)  │          │  npm run build(tsc+vite)    │
│  純粋関数・vitest で検証   │          │  → {ok, log}                │
└──────────────────────────┘          │ GET /preview/{id}/*          │
                                      │  dist/ を静的配信(SPA)       │
                                      └─────────────────────────────┘
```

- ジェネレータは **FE 側の純粋 TypeScript**(ドメイン型を共有できるため)。BE は書き出し・ビルド・配信に徹する
- イベント→コードの対応(インタープリタと同じ意味論):
  - `navigate(pageId)` → `useNavigate()(path)` + ダイアログを閉じる
  - `openDialog/closeDialog` → 生成 Redux `uiSlice` の dispatch
  - `showToast` → `uiSlice` の toast キュー(3 秒自動消滅)
- 識別子: ページ/ダイアログは `Page0`/`Dialog0` 等の安定した連番識別子 + 元の名前をコメントで残す
- セキュリティ: BE はファイルパスを検証(相対のみ・`..` 拒否・workspace 外書き込み不可)

## 3. 生成されるファイル構成

```
package.json / vite.config.ts / tsconfig.json / index.html
src/main.tsx                    HashRouter + Redux Provider
src/App.tsx                     Routes 定義 + PageLayout(ヘッダー/フッター適用)
src/styles/tokens.css           css-variables emitter の出力(DTCG → CSS変数)
src/styles/app.css              パーツ共通スタイル(CSS変数参照)
src/shared/result.ts            Result<T, E>
src/app/store.ts, ui-slice.ts   ダイアログ開閉・トースト状態
src/di/container.ts             Composition Root(VITE_APP_MODE=mock 切替の器)
src/components/AppHeader.tsx    共通ヘッダー(layout.header から生成)
src/components/AppFooter.tsx    共通フッター
src/components/DialogHost.tsx   開いているダイアログの表示
src/components/Toasts.tsx
src/pages/Page{N}.tsx           各ページ(イベントハンドラ含む)
src/dialogs/Dialog{N}.tsx       各ダイアログ
```

## 4. タスク分解(T13〜)

| ID | タスク | DoD 対応 |
|---|---|---|
| T13 | ドメイン: デザイントークン(DTCG 互換)を ProjectDoc に追加、スキーマ後方互換(default)、テスト | 04 |
| T14 | ジェネレータ基盤: GeneratedFile モデル・識別子サニタイズ・プロジェクト雛形(package.json / vite.config / tsconfig / main / store / di) | 01, 03 |
| T15 | JSX 生成: ノード→TSX、イベント→ハンドラ、ページ / ヘッダー / フッター / ダイアログ / App ルーティング | 01, 02 |
| T16 | css-variables emitter(tokens.css)+ app.css(トークン参照) | 04 |
| T17 | ジェネレータのユニットテスト | Q2 |
| T18 | BE: ワークスペース書き出し + ビルドランナー + /preview 静的配信 + パス検証テスト | 05, Q1 |
| T19 | FE: 実行モード UI(生成→ビルド→iframe、ログ表示)+ zip エクスポート | 05, 06, 07 |
| T20 | 品質ゲート一括 + 実行モード E2E(ブラウザ) | Q1–Q4 |
