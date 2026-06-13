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
}

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

    // 生成ソースの書き出し(src は全量入れ替えで古いページの残骸を防ぐ)
    let _ = tokio::fs::remove_dir_all(ws.join("src")).await;
    for f in &input.files {
        let target = ws.join(&f.path);
        if let Some(parent) = target.parent()
            && let Err(e) = tokio::fs::create_dir_all(parent).await
        {
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
        if let Err(e) = tokio::fs::write(&target, &f.content).await {
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
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
}
