# AppForge デモ — TODO アプリ自動生成(Playwright)

GUI 操作だけで TODO アプリを組み立て、最後に React を実ビルドするまでを Playwright で
自動再生します。画面右上にシナリオのチェックリストを表示し、次に操作するパーツ/ボタンを
ハイライト(黄色いグロー)しながら進みます。何度でも繰り返し実行できます。

## シナリオ(全7ステップ)

1. 見出し「📝 マイ TODO リスト」を追加
2. 入力欄「新しいタスク」を追加
3. ボタン「＋ タスクを追加」を追加
4. テーブル(タスク / 状態 / 期限)を追加
5. デザインでアクセント色をティールに変更(全体へ即反映)
6. プレビューで動作確認
7. 実行モードで React を実ビルド → プレビュー

各ステップごとに `demo/screenshots/NN-*.png` を保存します。

## 前提(2つのサーバーを起動しておく)

```bash
# 端末1: バックエンド(http://localhost:8787)
cd backend && cargo run

# 端末2: ビルダーの dev サーバー(http://localhost:5173)
cd frontend && npm run dev
```

## 実行

```bash
cd demo
npm install        # 初回のみ(playwright + chromium を取得)
npm run demo       # ヘッド付き(ブラウザが見える)で再生
```

ウィンドウが開き、自動でビルダーを操作して TODO アプリが組み上がります。
完成後はウィンドウを開いたまま待機します(`Ctrl+C` で終了)。

## オプション(環境変数)

| 変数 | 既定 | 説明 |
|---|---|---|
| `HEADLESS=1` | off | ブラウザを表示せず実行(CI 向け。終了後にスクショだけ残る) |
| `SLOWMO=200` | `60` | 各操作の間隔(ms)。大きくするとゆっくり見える |
| `APPFORGE_API` | `http://localhost:8787` | バックエンドの URL |
| `APPFORGE_BUILDER` | `http://localhost:5173` | ビルダー dev サーバーの URL |

例:

```bash
SLOWMO=250 npm run demo     # ゆっくり再生(プレゼン向け)
HEADLESS=1 npm run demo     # 画面なしでスクショだけ生成
```

## しくみ(参考)

- 実行前に API で「TODO アプリ」プロジェクトを空ホームにリセット(なければ作成)。
  ビルダーは最新プロジェクトを開くので、これが対象になります。
- ビルダーへ移動後、`window.__todo` にデモ用ヘルパーとオーバーレイを注入。
- パーツ配置はビルダーと同じネイティブ DnD(`DataTransfer` + `DragEvent`)を合成して実行。
  プロパティ編集は React の制御入力に合わせて value を設定 + `input` イベント発火。
- これらはすべて公開 UI / API 経由で、ビルダー本体には手を加えていません。
