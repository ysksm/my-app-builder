# デプロイガイド（生成アプリ / バックエンド）

AppForge が生成するアプリと、AppForge 自身のバックエンドを本番配備するための手順。

## 1. 生成アプリ（フロントエンド SPA）

生成される React アプリには配備の雛形（`overwrite:false` = 再生成で上書きされないユーザー所有ファイル）が含まれる:

| ファイル | 役割 |
|---|---|
| `Dockerfile` | マルチステージ（build → nginx 静的配信） |
| `nginx.conf` | SPA フォールバック（`try_files … /index.html`） |
| `.dockerignore` | `node_modules`/`dist`/`.git` を除外 |

### ローカルビルド
```bash
npm ci
npm run build      # tsc 型チェック + vite build → dist/
npm run preview    # ローカル確認
```

### Docker で配備
```bash
docker build -t my-app .
docker run -p 8080:80 my-app   # http://localhost:8080
```
任意の静的ホスティング（S3+CloudFront / Netlify / Vercel / Nginx）に `dist/` を置くだけでも動作する（ベンダーロックインなし）。

### フレームメモ
- React/Vue/Svelte/Angular は `dist/` を出力 → 上記 Dockerfile をそのまま流用可。
- Remix(React Router 7, SPA モード)は `build/client` を `dist/` に複製して出力するため同様。サブパス配備時は生成時の `basename`/`base` を配信パスに合わせる（既定 `/`）。
- ルーティングはハッシュ系（React/Vue/Svelte）またはパス系（Remix）。パス系をサブパス配信する場合のみ basename 調整が必要。

## 2. バックエンド（AppForge 本体 / Rust + axum）

開発時は SQLite（`/tmp/appforge-dev.db`）。本番は次のいずれか:

- **そのまま SQLite**: 単一インスタンス・低トラフィックなら可。永続ボリュームにDBファイルを置く。
- **Postgres へ移行（推奨・将来）**: `store.rs` のリポジトリ実装を Postgres ドライバ（例: `sqlx`/`tokio-postgres`）に差し替える。スキーマは `projects(id, name, doc TEXT/JSONB, created_at, updated_at)` 相当。`now()` はミリ秒精度を維持（外部更新検知 FR-MCP-02 の取りこぼし防止）。

### コンテナ化（参考方針）
```dockerfile
FROM rust:alpine AS build
WORKDIR /app
COPY . .
RUN cargo build --release
FROM alpine
COPY --from=build /app/target/release/<bin> /usr/local/bin/appforge
EXPOSE 8787
CMD ["appforge"]
```
（Rust 側 Dockerfile は未生成。必要に応じてリポジトリに追加する。）

## 3. 未対応・留意点
- 生成アプリの**認証/CSP スキャフォールドは未実装**（NFR-06）。保護が必要な用途では別途認証ゲートを実装する（評価ドキュメント 観点 J / J2 参照）。
- CI/CD テンプレート（GitHub Actions 等）は未生成。`npm ci && npm run build` をパイプラインに組むだけで足りる。
