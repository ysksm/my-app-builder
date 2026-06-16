# AppForge 評価ドキュメント

AppForge を多角的・継続的に評価するための生きたドキュメント。各リビジョンで観点ごとにスコア（商用プロダクト水準を 5 点満点とした相対評価）と根拠・改善案を記録する。

## 評価方法（再現性のため固定）
- **観点**: A〜J の 10 観点（下表）。観点を変える場合は改訂履歴に明記。
- **スコア**: 5 = 商用本番級 / 4 = 実用十分 / 3 = 動くが課題あり / 2 = PoC / 1 = 未着手。
- **根拠**: コード実地調査ベース（ソース・テスト・生成物・設定を確認し、件数/実例/ファイル参照で裏取り）。
- **数値の出典**: 会話中の実測を優先（例: FE テスト件数は `npx vitest run` の結果）。

## 改訂履歴
| Rev | 日付 | 総合 | 主な変更 |
|---|---|:--:|---|
| 1 | 2026-06-17 | 3.9 / 5 | 初版（10 観点・コード実地調査）。観点 I を React Compiler 適用を踏まえ 2.5→3.5 に補正 |
| 2 | 2026-06-17 | 4.1 / 5 | 4.0 未満の 4 観点を改善。D 3.5→4.0（D1 prompt 廃止/D2 a11y）、F 3.5→4.0（F1 参照整合性/F2 パス）、I 3.5→4.0（I1 選択局所購読/I3 ベンチ）、J 3.5→4.0（J1 デプロイ雛形/J3 ガイド） |

---

## スコアカード（Rev 2 / 2026-06-17）

| 観点 | スコア | Rev1→2 | 一言 |
|---|:--:|:--:|---|
| A. プロダクト価値・ポジショニング | 4.0 | — | 「コード生成型」の差別化は明確。ToolJet 的なライブデータ連携は未到達 |
| B. 機能網羅性 | 4.0 | — | UI/モデル/ロジック/RT/5FW/連携と広い。FW 間の深さに段差 |
| C. 生成コード品質 | 4.0 | — | React/Remix は DDD 本番品質。他 FW は薄い、整形/lint 未適用 |
| D. エディタ UX | 4.0 | ↑0.5 | prompt 廃止＋キーボード/aria 対応。残: タッチ・さらなる a11y |
| E. アーキテクチャ・拡張性 | 4.5 | — | 最大の強み。中立表現+アダプタ 6 系統、コマンド層パリティ |
| F. 堅牢性 | 4.0 | ↑0.5 | 参照整合性クリア＋パス正規化/重複制御。残: ビルド競合・UI e2e |
| G. 相互運用性・標準 | 4.0 | — | TypeSpec/OpenAPI/DTCG/単独ビルド。ロックイン回避◎ |
| H. AI/MCP 連携 | 4.5 | — | Phase0/1/2 実装、コマンド層パリティ、ヘッドレス運用可 |
| I. スケーラビリティ・性能 | 4.0 | ↑0.5 | React Compiler＋選択の局所購読。残: 仮想化 |
| J. 運用・採用性・ドキュメント | 4.0 | ↑0.5 | デプロイ雛形＋ガイド。残: 認証スキャフォールド・CI/CD |

**総合: 4.1 / 5** — 4.0 未満だった D/F/I/J を底上げ。残る上積み余地は E/H（既に 4.5）と、戦略投資（A/B のライブデータ層）。

### Rev 2 で実施した改善（コミット済み）
- **D1**: パーツ登録の `window.prompt` をインライン命名 UI に置換。
- **D2**: Palette のキーボード操作（Enter/Space で追加）＋ `role`/`aria-label`/`aria-selected`/`:focus-visible`。
- **F1**: `removeModel`/`removeChannel` 時に死参照（`bindAggregate`/`channelRef`）を全ツリーでクリア（`ComponentNode.mapEvery`/`ProjectDoc.mapAllTrees`）。
- **F2**: `Page.normalizePath` 強化（末尾/連続スラッシュ）＋ `addPage` 重複自動回避 ＋ `updatePage` 重複拒否。
- **I1**: 選択状態を `EditInteraction` Context から外し各ノードで `useAppSelector` 個別購読。
- **I3**: `large-tree.perf.test.ts`（1000 ノード生成≈3ms）でベースライン化。
- **J1**: 生成アプリに Dockerfile/nginx.conf/.dockerignore（`overwrite:false`）。
- **J3**: `docs/deployment.md`。

### Rev 2 後に残る改善（4.0 超を狙う場合）
- **F3**: BE ビルドのワークスペース単位ロック（npm install 競合）。
- **F4**: キャンバス操作の e2e（Playwright 等）。
- **I2**: 大規模ツリーの仮想化。
- **J2**: 認証/CSP スキャフォールド、CI/CD テンプレート。
- **A/B（戦略）**: ライブデータソース＋クエリ＋式バインド。

> 注: 調査時に確認した実測値 — FE テスト **272 件**（vitest）、コンポーネント種別 **約 31 種**、デモモードは **実装済み**（T52, DemoView.tsx）。

---

## 観点別

### A. プロダクト価値・ポジショニング — 4.0
- **強み**: ToolJet/Appsmith/Retool（ランタイム解釈型）に対し「ビルド可能なソース一式を成果物にする＝生成物が単独資産」という明確な差別化。DDD モデルファースト＋Modbus 等の産業用途は競合になく独自。
- **弱み**: ①ToolJet 風の「ライブデータソース＋クエリ＋`{{}}`バインド」は未実装（現状のバインドは設計時のサンプル行＝静的）。②想定ユーザーが「非エンジニア〜エンジニア」と広く曖昧。
- **改善**: 「コード生成型 × DDD」に振り切るか、ToolJet 的データ層を足すかの戦略選択を明示。

### B. 機能網羅性 — 4.0
- **強み**: 約 31 コンポーネント種、5FW、UI キット 8 種、リアルタイム 4 部品（mock/WS/Modbus）、DDD ロジック 3 段（ルール/ユースケース/サービス契約）、I/F・MCP。
- **弱み**: ロジック実装は手書き前提（サービス実装はスタブ）。ライブクエリ層なし。FW 深さに段差。
- **改善**: データソース/クエリ抽象（DataChannel の拡張）で CRUD 超えの実用性を。

### C. 生成コード品質 — 4.0
- **強み**: React/Remix は `features×{domain/application/infrastructure/presentation}` レイヤード＋DI＋brand 型＋Result＋カスタムコード保護（overwrite フラグ）。実ビルド検証済み。
- **弱み**: ①Vue/Svelte=UI+簡易ドメイン、Angular は最薄（ドメイン/CRUD 未生成）。②生成コードに prettier/eslint 未適用。③多フィールド VO 埋め込み集約は API 生成スキップ。
- **改善**: 生成物へ prettier 適用、Angular のドメイン層底上げ。
- **根拠**: `src/generator/emit-domain.ts`, `emit-project.ts`, `emit-crud.ts`, `emit-*-domain.ts`, `files.ts`(overwrite)。

### D. エディタ UX — 3.5
- **強み**: 8 モード（編集/モデル/ボード/設計図/デザイン/チャネル/プレビュー/実行/デモ）、HTML5 DnD、グリッド自由配置＋flex 整列ウィジェット、実物 UI ライブラリで WYSIWYG（`react-kit-views.tsx`）、Undo/Redo＋自動保存。
- **弱み**: ①パーツ登録が `window.prompt`。②キャンバスがマウス専用・a11y 薄い。③エラーフィードバックがトースト中心。
- **改善**: prompt→インラインモーダル、ポインタ API でタッチ対応、キーボード操作。

### E. アーキテクチャ・拡張性 — 4.5（白眉）
- **強み**: 「中立表現＋アダプタ」を 6 系統（UI パーツ/スタイル emitter/I-F アダプタ/コネクタ/FW generator/UI キット）で徹底し各 2 実装以上。コマンド層 `applyCommand` 一本で GUI/MCP/デモ/Undo が同一経路＝二重実装の構造的排除。全層 Result 型。
- **弱み**: 拡張軸が増え概念負荷が高い（コマンド種別 50 超）。
- **改善**: 新規参加者向けの設計ドキュメント整備。
- **根拠**: `src/application/commands.ts`, `src/generator/ui-model.ts`, `react-ui-kits.ts`, `emit-css.ts`, `data-channel.ts`, `interface-model.ts`。

### F. 堅牢性 — 3.5
- **強み**: Result 型徹底、autosave＋`saveState`/`dirty`/楽観ロック（expectedUpdatedAt）、外部更新の WS 即時同期、ビルド時 manifest 差分同期（幽霊ファイル対応）。
- **弱み**: ①参照整合性なし（モデル削除で Rule/Service/Usecase の参照が残存し得る）。②パス正規化の曖昧さ（`/x` と `/x/`）。③同時ビルドの npm install 競合。④UI 操作（DnD/リサイズ）の自動テストが薄い。
- **改善**: 削除時のカスケード/参照検査、キャンバス操作の e2e テスト。

### G. 相互運用性・標準 — 4.0
- **強み**: 中立 I/F モデルから TypeSpec＋OpenAPI 両出力（開発時に実 TypeSpec コンパイラ/Redocly CLI で検証実績）、DTCG トークン＋Tailwind 非依存、単独ビルド可でロックインなし。
- **弱み**: ①実ツール検証が CI ゲートに常設されていない（回帰検知不可）。②DTCG は部分準拠（color/dimension/font のみ）。
- **改善**: TypeSpec/Redocly を検証ゲートに常設。

### H. AI/MCP 連携 — 4.5
- **強み**: MCP ツール約 11〜15（read/generate/build/export/edit）、コマンド層経由で GUI とパリティ、stdio でヘッドレス完結、Phase2 の WS 即時同期も実装。
- **弱み**: MCP ツールの zod スキーマが一部個別定義（ドメイン schema と二重管理）で乖離リスク。
- **改善**: zod スキーマからの MCP 入力スキーマ自動導出。
- **根拠**: `mcp-server/src/index.ts`, `mcp-server/test/smoke.ts`。

### I. スケーラビリティ・性能 — 3.5（React Compiler 適用を踏まえ 2.5 から補正）
- **重要な前提**: ビルダー本体の `frontend/vite.config.ts` は **React Compiler を適用**している（`babel({ presets: [reactCompilerPreset()] })` ＋ `babel-plugin-react-compiler@^1.0.0`）。したがって `useMemo`/`useCallback`/`React.memo` を手書きしないのは**設計判断**であり、コンパイラがコンポーネント単位のメモ化と計算値のメモ化を自動挿入する。初回の「手書きメモ化ゼロ＝性能問題」という指摘は前提が誤り。
- **自動メモ化で緩和される点**: `propOf`/`str`/`num` 等の派生計算、`Palette` の `filter`、`LayerTree` の `flatten` などレンダ内計算は、入力が安定なら再計算されない。子サブツリーも props 不変ならスキップされる。
- **それでも残る実課題**:
  1. **選択の Context 伝播**: `EditInteraction` コンテキストが `selectedId` を含むため、選択変更時に全 `useEditInteraction` 消費者の render 関数が再実行される（Context 変更はコンパイラのメモ化対象外）。ただし props 不変の子出力はスキップされるため実コストは限定的。選択を粒度の細かい購読に分離すればさらに改善。
  2. **仮想化なし**: 1000+ ノードでは DOM ノードのマウント自体が重い（メモ化と独立した課題）。
  3. **超大規模未検証**: 大規模プロジェクトでの Redux/SQLite 並行性は未測定。
- **強み**: 履歴 100 件上限、Mermaid/ECharts 遅延ロード、生成側は Vite tree-shake、React Compiler で自動最適化。
- **改善（優先度順）**: ①選択状態の局所購読化（Context 分割 or セレクタ）②大規模ツリーの仮想化 ③大規模プロジェクトでの実測ベンチ。
- **対応状況（2026-06-17）**: ①完了（I1: `selectedId` を Context から外し各ノードで `useAppSelector` 個別購読 → 選択変更の再描画を当該ノードに限定）。③ベースライン計測（I3: `large-tree.perf.test.ts`、`generateProject(1000 ノード)=約 3ms`＝生成パイプラインは線形でスケール、アルゴリズム的爆発なし。DOM 描画性能は別途）。②仮想化は未着手。
- **生成物も同様**: 生成 React アプリも vite 設定に React Compiler を配線して出力する（`emit-project.ts` が `babel({ presets: [reactCompilerPreset()] })` ＋ `babel-plugin-react-compiler` を生成）。ビルダー・生成物の双方で自動メモ化が効く。
- **根拠**: `frontend/vite.config.ts`, `package.json`(babel-plugin-react-compiler), `src/presentation/renderer/NodeRenderer.tsx`, `LayerTree.tsx`, `Palette.tsx`, `edit-interaction.ts`。

### J. 運用・採用性・ドキュメント — 3.5
- **強み**: `requirements.md` 509 行＋M1〜M6 計画＋`presentation.html`＋デモモード実装済み。MIT ライセンス、競合ライセンス（ToolJet=AGPL）も明記。
- **弱み**: ①生成アプリの認証/CSP スキャフォールド未実装（NFR-06 は定義のみ）。②本番デプロイ導線なし（Dockerfile/CI-CD/SQLite→Postgres 移行）。
- **改善**: 認証スキャフォールドとデプロイテンプレ。

---

## 横断的な所見
1. **設計＞作り込み**: 拡張性・MCP・コマンド層パリティは商用級（E/H=4.5）。性能・セキュリティ・FW 深さは投資が遅れている。
2. **ToolJet ギャップ**: UI/レイアウトは ToolJet 風に寄せたが、ライブデータソース＋クエリ＋式バインドという核が未着手。位置づけ上の最大の意思決定点。
3. **品質ゲートの穴**: tsc/eslint/vitest は堅いが、UI 操作 e2e・実ツール I/F 検証・生成物の整形が抜けている。

## 優先改善（投資対効果順）
1. **データ層（A/B）**: ライブデータソース/クエリ — プロダクト価値の天井を上げる戦略投資。
2. **参照整合性＆UI e2e（F）**: 削除カスケードとキャンバス操作テスト。
3. **性能（I）**: 選択状態の局所購読化と大規模ツリーの仮想化（React Compiler で基本メモ化は済んでいるため、対象は構造的ボトルネックに絞る）。
4. **セキュリティ＆デプロイ導線（J）**: 認証スキャフォールド＋Dockerfile。
5. **検証ゲート（G）**: TypeSpec/Redocly を CI に常設。
