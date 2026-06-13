# M3 技術計画 — DDD モデルデザイナー & 中立 I/F モデル

- 作成日: 2026-06-13
- 対象: マイルストーン M3(requirements.md §10)
- フェーズ分割: **M3a = モデルデザイナー + ドメイン層コード生成**(本計画の主対象)、**M3b = 中立 I/F モデル + TypeSpec アダプタ + CRUD 画面導出**
- **ステータス: M3 完了**(2026-06-13)。M3a(T21–T26)/ M3b-1 CRUD(T28)/ features×レイヤード(T30)/ 中立 I/F モデル + TypeSpec export(T29)/ API repository + DI 切替(T31)/ MCP Phase 0(T27)。
  生成アプリの tsc strict + vite build、生成 TypeSpec の実コンパイラ検証、ブラウザ E2E まで確認済み。
  次マイルストーン: M3.5(ロジック定義 + コマンド層 + MCP Phase 1)。

---

## 1. 完了の定義(M3a)

### 機能

| # | 基準 | 対応 FR |
|---|---|---|
| DoD-01 | ER 図ライクなキャンバスで Aggregate / Entity / Value Object を配置・移動・編集できる | FR-MDL-01 |
| DoD-02 | フィールド定義(名前・型・必須・制約: min/max/pattern)を編集できる | FR-MDL-03 |
| DoD-03 | モデル間のリレーション(1:1 / 1:N)を線で表現・追加・削除できる | FR-MDL-02 |
| DoD-04 | モデル定義から **class を使わない TypeScript** を生成: brand 型 ID + companion object + `Result` 検証付き `create`/`update`、単一フィールド VO は branded primitive | FR-CODE-01〜04 |
| DoD-05 | 集約ごとに repository I/F(domain 層)+ インメモリ mock 実装(infrastructure 層)+ DI コンテナ配線を生成 | FR-GEN-01/02 |
| DoD-06 | 各モデルに Vitest テスト雛形を同時生成し、生成アプリで `tsc` が通る | FR-CODE-05 |
| DoD-07 | モデル操作も Undo/Redo・自動保存・スキーマ後方互換の対象 | NFR-04 |

### 品質ゲート

M2 と同じ(ビルダー全ゲート + 生成アプリの tsc/vite build + ブラウザ E2E)。

### M3b へ送るもの

- 中立 I/F モデル(operations/streams)+ アダプタ SPI、TypeSpec アダプタ(export → import の順)
- モデルから CRUD 画面の雛形導出(FR-MDL-06)— mock repository を使う一覧/フォーム生成
- Bounded Context ビュー・ユビキタス言語用語集(FR-MDL-04/05)
- API 実装 repository(I/F 定義から生成)と DI の本切替

## 2. 設計

### 2.1 ドメイン(ビルダー側)

```
DataModel = { models: ModelDef[], relations: RelationDef[] }
ModelDef  = { id, name(PascalCase), kind: aggregate|entity|valueObject, fields: FieldDef[], x, y }
FieldDef  = { id, name(camelCase), type: string|number|boolean|date, required, min, max, pattern }
RelationDef = { id, from, to, kind: hasOne|hasMany, name(camelCase) }
```

- ProjectDoc に `dataModel` を追加(zod `.default` で旧ドキュメント互換)
- 識別子はデザイナー側でサニタイズ(PascalCase / camelCase 強制、重複名は拒否)— 生成コードの安全性を入力時に担保

### 2.2 生成コードの対応

| モデル | 生成物 |
|---|---|
| Aggregate / Entity | brand 型 ID + companion(`create`/`from`)、`Readonly` データ型、`Input` 型、制約検証つき `create`/`update`(`Result<T, ValidationError[]>`) |
| Value Object(単一フィールド) | branded primitive + `create`/`equals`(例: `Email`) |
| Value Object(複数フィールド) | `Readonly` オブジェクト + `create`/`equals` |
| リレーション | Aggregate/Entity 参照 → **ID 参照**(`OrderId` / `ReadonlyArray<OrderId>`)、VO 参照 → 埋め込み型 |
| Aggregate ごと | `domain/repositories/*-repository.ts`(I/F)+ `infrastructure/mock/in-memory-*.ts` + `di/container.ts` 配線 |
| 共通 | `domain/validation.ts`(ValidationError)、`domain/repository-error.ts`、Vitest テスト雛形 |

### 2.3 モデルデザイナー UI

- 新しいビューモード「◆ モデル」。カードを絶対配置(ドラッグ移動、位置は doc に保存)
- カード内でフィールドをインライン編集(⚙ で制約展開)。リレーションは「+ 関連」→ 対象カードをクリックで作成、SVG 線 + 中点ラベルで表示・削除
- すべての操作は editorSlice の commit を通る(Undo/Redo・自動保存が効く)

## 3. タスク(T21〜)

| ID | タスク |
|---|---|
| T21 | ドメイン: DataModel + companion + スキーマ後方互換 + テスト |
| T22 | editorSlice: モデル操作 reducer 群 + テスト |
| T23 | モデルデザイナー UI(カード配置 / フィールド編集 / リレーション線) |
| T24 | ジェネレータ: ドメイン層生成(brand + companion + Result 検証 + テスト雛形) |
| T25 | ジェネレータ: repository I/F + インメモリ mock + DI 配線 |
| T26 | M3a 品質ゲート + E2E(モデル作成 → 実行モードでビルド成功) |
