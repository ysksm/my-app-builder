# AppForge(仮称)

GUI で Web アプリを設計し、ビルド可能な React ソースコードを生成する開発プラットフォーム。

- 要件定義: [requirements.md](requirements.md)
- プレゼン資料: [docs/presentation.html](docs/presentation.html)(ブラウザで開く)
- M1 技術計画 / 完了定義: [docs/m1-plan.md](docs/m1-plan.md)
- M2 技術計画 / 完了定義: [docs/m2-plan.md](docs/m2-plan.md)

## 構成

```
frontend/   ビルダー FE — React 19 + TypeScript + Vite 8(Rolldown)+ Redux Toolkit + React Compiler
backend/    ビルダー BE — Rust + axum + SQLite(rusqlite)
docs/       ドキュメント・プレゼン・スクリーンショット
```

## 起動方法

```bash
# バックエンド(port 8787)
cd backend
cargo run

# フロントエンド(port 5173、/api は 8787 へプロキシ)
cd frontend
npm install
npm run dev
```

http://localhost:5173 を開く。初回起動時にプロジェクトが自動作成され、編集は1秒デバウンスで自動保存される。

## 開発コマンド

| 対象 | コマンド | 内容 |
|---|---|---|
| FE | `npm run typecheck` | tsc --noEmit |
| FE | `npm run lint` | ESLint |
| FE | `npm test` | Vitest(ドメイン / reducer / インタープリタ) |
| FE | `npm run build` | 型チェック + vite build |
| BE | `cargo test` | ハンドラ統合テスト(インメモリ SQLite) |
| BE | `cargo clippy` | リント |

## 実装済みの機能

**M1: コア編集**
- パレットからの D&D 配置、選択・移動・並べ替え・削除、Undo/Redo(⌘Z / ⇧⌘Z)
- ページの追加・削除・名前/パス編集、共通ヘッダー/フッターの編集とページ単位の適用切替
- ダイアログの作成・編集
- プロパティパネル(パーツ定義スキーマ駆動)とイベントバインディング(ページ遷移 / ダイアログ開閉 / トースト)
- プレビューモード(インタープリタ実行 — ページ遷移・ダイアログ・トーストが実際に動作)
- Rust BE への自動保存・リロード復元

**M2: コード生成 + 実行モード**
- ドキュメント → **ビルド可能な React アプリのソース一式を生成**(Vite 8 + React Compiler + Redux + React Router / レイヤード + DI スキャフォールド)
- デザイントークン(DTCG 互換)を ProjectDoc に保持、**css-variables emitter** が `tokens.css` を生成(生成 UI は CSS 変数参照)
- **⚡ 実行モード**: BE ビルドランナーが生成ソースを書き出し → `npm install` → `tsc --noEmit && vite build` → `/preview/{id}/` で配信し iframe 表示
- 生成ソースの **ZIP ダウンロード**
- 生成コードの意味論はエディタ内プレビューのインタープリタ(`preview-interpreter.ts`)と同一

アーキテクチャ規約(ビルダー自身も生成物と同じ思想で実装):
class 不使用 / brand 型 + companion object pattern / `Result<T, E>` / レイヤード + DI(repository は
`VITE_APP_MODE=mock` でインメモリ実装に切替可能)。
