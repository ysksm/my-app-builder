use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use std::path::{Component, Path as FsPath};
use tokio::process::Command;

use crate::handlers::AppState;

#[derive(Deserialize)]
pub struct BuildInput {
    pub files: Vec<FileEntry>,
}

#[derive(Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub content: String,
    /// None/true = 生成ファイル(毎回上書き)。false = ユーザー所有(存在すれば保持)
    #[serde(default)]
    pub overwrite: Option<bool>,
}

impl FileEntry {
    fn is_generated(&self) -> bool {
        self.overwrite != Some(false)
    }
}

/// 生成ファイルのパス一覧(manifest)。次回ビルドで削除されたファイルを検出する
const MANIFEST: &str = ".appforge-generated.json";

#[derive(Serialize)]
pub struct BuildOutput {
    pub ok: bool,
    pub log: String,
}

/// ワークスペース外への書き込みを防ぐ: 相対パスかつ通常コンポーネントのみ許可
pub fn is_safe_rel_path(path: &str) -> bool {
    if path.is_empty() || path.len() > 512 {
        return false;
    }
    let p = FsPath::new(path);
    !p.is_absolute() && p.components().all(|c| matches!(c, Component::Normal(_)))
}

pub fn is_safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// カスタムコード保護(FR-GEN-05): src を全削除せず manifest 差分で同期する。
/// - 生成ファイル(overwrite!=false): 毎回上書き
/// - ユーザー所有ファイル(overwrite==false): 既存なら保持、無ければスタブ作成
/// - 前回生成して今回生成されない stale ファイル(削除されたページ等)は manifest 差分で削除
async fn sync_workspace_files(ws: &FsPath, files: &[FileEntry]) -> std::io::Result<()> {
    use std::collections::HashSet;

    let new_generated: HashSet<&str> = files
        .iter()
        .filter(|f| f.is_generated())
        .map(|f| f.path.as_str())
        .collect();

    let old_manifest: Vec<String> = tokio::fs::read(ws.join(MANIFEST))
        .await
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    for stale in old_manifest
        .iter()
        .filter(|p| !new_generated.contains(p.as_str()))
    {
        let _ = tokio::fs::remove_file(ws.join(stale)).await;
    }

    for f in files {
        let target = ws.join(&f.path);
        // ユーザー所有ファイルは既存なら上書きしない(手編集を保持)
        if !f.is_generated() && target.exists() {
            continue;
        }
        if let Some(parent) = target.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&target, &f.content).await?;
    }

    let manifest: Vec<&str> = new_generated.into_iter().collect();
    let json = serde_json::to_vec(&manifest).unwrap_or_else(|_| b"[]".to_vec());
    tokio::fs::write(ws.join(MANIFEST), json).await?;
    Ok(())
}

async fn run_npm(dir: &FsPath, args: &[&str]) -> (bool, String) {
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(600),
        Command::new("npm").args(args).current_dir(dir).output(),
    )
    .await;
    match result {
        Ok(Ok(out)) => {
            let mut log = String::new();
            log.push_str(&String::from_utf8_lossy(&out.stdout));
            log.push_str(&String::from_utf8_lossy(&out.stderr));
            (out.status.success(), log)
        }
        Ok(Err(e)) => (false, format!("npm の起動に失敗しました: {e}")),
        Err(_) => (false, "npm がタイムアウトしました(600s)".to_string()),
    }
}

pub async fn build_project(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<BuildInput>,
) -> Response {
    if !is_safe_id(&id) {
        return (StatusCode::BAD_REQUEST, "invalid project id").into_response();
    }
    for f in &input.files {
        if !is_safe_rel_path(&f.path) {
            return (
                StatusCode::BAD_REQUEST,
                format!("invalid file path: {}", f.path),
            )
                .into_response();
        }
    }

    let ws = state.workspaces.join(&id);
    let old_pkg = tokio::fs::read(ws.join("package.json")).await.ok();

    if let Err(e) = sync_workspace_files(&ws, &input.files).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    let mut log = String::new();
    let new_pkg = tokio::fs::read(ws.join("package.json")).await.ok();
    let needs_install =
        !ws.join("node_modules").exists() || old_pkg.as_deref() != new_pkg.as_deref();

    if needs_install {
        log.push_str("$ npm install\n");
        let (ok, out) = run_npm(&ws, &["install", "--no-audit", "--no-fund"]).await;
        log.push_str(&out);
        if !ok {
            return Json(BuildOutput { ok: false, log }).into_response();
        }
    }

    log.push_str("\n$ npm run build\n");
    let (ok, out) = run_npm(&ws, &["run", "build"]).await;
    log.push_str(&out);
    Json(BuildOutput { ok, log }).into_response()
}

fn content_type_for(path: &FsPath) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript",
        "css" => "text/css",
        "json" | "map" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

async fn serve_from_dist(state: &AppState, id: &str, rel: &str) -> Response {
    if !is_safe_id(id) || (!rel.is_empty() && !is_safe_rel_path(rel)) {
        return (StatusCode::BAD_REQUEST, "invalid path").into_response();
    }
    let dist = state.workspaces.join(id).join("dist");
    let mut target = dist.join(rel);
    if rel.is_empty() || !target.is_file() {
        // SPA フォールバック(HashRouter のため基本 index.html だけで足りる)
        target = dist.join("index.html");
    }
    match tokio::fs::read(&target).await {
        Ok(bytes) => (
            [(header::CONTENT_TYPE, content_type_for(&target))],
            bytes,
        )
            .into_response(),
        Err(_) => (
            StatusCode::NOT_FOUND,
            "まだビルドされていません。実行モードでビルドしてください。",
        )
            .into_response(),
    }
}

pub async fn serve_preview_index(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    serve_from_dist(&state, &id, "").await
}

pub async fn serve_preview_file(
    State(state): State<AppState>,
    Path((id, rest)): Path<(String, String)>,
) -> Response {
    serve_from_dist(&state, &id, &rest).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rel_path_validation() {
        assert!(is_safe_rel_path("src/App.tsx"));
        assert!(is_safe_rel_path("package.json"));
        assert!(!is_safe_rel_path("../escape.txt"));
        assert!(!is_safe_rel_path("src/../../escape.txt"));
        assert!(!is_safe_rel_path("/etc/passwd"));
        assert!(!is_safe_rel_path(""));
    }

    #[test]
    fn id_validation() {
        assert!(is_safe_id("550e8400-e29b-41d4-a716-446655440000"));
        assert!(!is_safe_id("a/b"));
        assert!(!is_safe_id("..."));
        assert!(!is_safe_id(""));
    }

    fn genf(path: &str, content: &str) -> FileEntry {
        FileEntry { path: path.into(), content: content.into(), overwrite: None }
    }
    fn user(path: &str, content: &str) -> FileEntry {
        FileEntry { path: path.into(), content: content.into(), overwrite: Some(false) }
    }
    async fn read(ws: &std::path::Path, p: &str) -> Option<String> {
        tokio::fs::read_to_string(ws.join(p)).await.ok()
    }

    #[tokio::test]
    async fn custom_code_protection_and_stale_cleanup() {
        let ws = std::env::temp_dir().join(format!("appforge-sync-test-{}", std::process::id()));
        let _ = tokio::fs::remove_dir_all(&ws).await;
        tokio::fs::create_dir_all(&ws).await.unwrap();

        // 初回生成: 生成ファイル2 + ユーザー所有スタブ
        sync_workspace_files(
            &ws,
            &[
                genf("src/pages/Page0.tsx", "v1"),
                genf("src/pages/Page1.tsx", "p1"),
                user("src/custom/overrides.css", "/* stub */"),
            ],
        )
        .await
        .unwrap();
        assert_eq!(read(&ws, "src/custom/overrides.css").await.as_deref(), Some("/* stub */"));

        // ユーザーが custom と(誤って)生成ファイルを手編集
        tokio::fs::write(ws.join("src/custom/overrides.css"), "USER EDIT").await.unwrap();

        // 再生成: Page0 内容変更、Page1 は削除(消えたページ)、custom は再びスタブで送る
        sync_workspace_files(
            &ws,
            &[
                genf("src/pages/Page0.tsx", "v2"),
                user("src/custom/overrides.css", "/* stub */"),
            ],
        )
        .await
        .unwrap();

        // 生成ファイルは上書きされる
        assert_eq!(read(&ws, "src/pages/Page0.tsx").await.as_deref(), Some("v2"));
        // 削除されたページの生成ファイルは stale として消える
        assert!(read(&ws, "src/pages/Page1.tsx").await.is_none());
        // ユーザー所有ファイルの手編集は保持される(上書きされない)
        assert_eq!(read(&ws, "src/custom/overrides.css").await.as_deref(), Some("USER EDIT"));

        let _ = tokio::fs::remove_dir_all(&ws).await;
    }
}
