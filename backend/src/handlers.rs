use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::sync::broadcast;

use crate::build;
use crate::realtime;
use crate::store::{Project, Store, StoreError};

/// プロジェクト更新の通知(MCP Phase 2 / FR-MCP-02)。WS でビルダーへ即時プッシュする
#[derive(Clone, Serialize)]
pub struct ProjectEvent {
    pub id: String,
    pub updated_at: i64,
}

#[derive(Clone)]
pub struct AppState {
    pub store: Store,
    pub workspaces: PathBuf,
    /// プロジェクト更新イベントの配信(create / update で送信)
    pub events: broadcast::Sender<ProjectEvent>,
}

impl AppState {
    fn notify(&self, project: &Project) {
        // 受信者がいなくてもエラーにしない(送信失敗は無視)
        let _ = self.events.send(ProjectEvent { id: project.id.clone(), updated_at: project.updated_at });
    }
}

#[derive(Deserialize)]
pub struct ProjectInput {
    pub name: String,
    pub doc: serde_json::Value,
}

impl IntoResponse for StoreError {
    fn into_response(self) -> Response {
        match self {
            StoreError::NotFound => (StatusCode::NOT_FOUND, "not found").into_response(),
            StoreError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg).into_response(),
        }
    }
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/projects", get(list_projects).post(create_project))
        .route(
            "/api/projects/{id}",
            get(get_project).put(update_project).delete(delete_project),
        )
        .route("/api/projects/{id}/build", post(build::build_project))
        .route("/api/projects/{id}/events", get(realtime::project_events))
        .route("/api/channels/{id}/stream", get(realtime::channel_stream))
        .route("/api/channels/{id}/write", post(realtime::channel_write))
        .route("/preview/{id}", get(build::serve_preview_index))
        .route("/preview/{id}/", get(build::serve_preview_index))
        .route("/preview/{id}/{*path}", get(build::serve_preview_file))
        .with_state(state)
}

async fn list_projects(State(state): State<AppState>) -> Result<impl IntoResponse, StoreError> {
    Ok(Json(state.store.list()?))
}

async fn get_project(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StoreError> {
    Ok(Json(state.store.get(&id)?))
}

async fn create_project(
    State(state): State<AppState>,
    Json(input): Json<ProjectInput>,
) -> Result<impl IntoResponse, StoreError> {
    let project = state.store.create(&input.name, &input.doc)?;
    state.notify(&project);
    Ok((StatusCode::CREATED, Json(project)))
}

async fn update_project(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<ProjectInput>,
) -> Result<impl IntoResponse, StoreError> {
    let project = state.store.update(&id, &input.name, &input.doc)?;
    state.notify(&project);
    Ok(Json(project))
}

async fn delete_project(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StoreError> {
    state.store.delete(&id)?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    fn test_router() -> Router {
        router(AppState {
            store: Store::open_in_memory().unwrap(),
            workspaces: std::env::temp_dir().join("appforge-test-ws"),
            events: broadcast::channel(16).0,
        })
    }

    async fn body_json(res: Response) -> serde_json::Value {
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice(&bytes).unwrap()
    }

    fn post(uri: &str, body: &str) -> Request<Body> {
        Request::post(uri)
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    fn put(uri: &str, body: &str) -> Request<Body> {
        Request::put(uri)
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    #[tokio::test]
    async fn crud_roundtrip() {
        let app = test_router();

        // create
        let res = app
            .clone()
            .oneshot(post(
                "/api/projects",
                r#"{"name":"demo","doc":{"pages":[1]}}"#,
            ))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);
        let created = body_json(res).await;
        let id = created["id"].as_str().unwrap().to_string();
        assert_eq!(created["name"], "demo");
        assert_eq!(created["doc"]["pages"][0], 1);

        // get
        let res = app
            .clone()
            .oneshot(
                Request::get(format!("/api/projects/{id}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        // update
        let res = app
            .clone()
            .oneshot(put(
                &format!("/api/projects/{id}"),
                r#"{"name":"renamed","doc":{"pages":[]}}"#,
            ))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let updated = body_json(res).await;
        assert_eq!(updated["name"], "renamed");

        // list
        let res = app
            .clone()
            .oneshot(Request::get("/api/projects").body(Body::empty()).unwrap())
            .await
            .unwrap();
        let list = body_json(res).await;
        assert_eq!(list.as_array().unwrap().len(), 1);

        // delete
        let res = app
            .clone()
            .oneshot(
                Request::delete(format!("/api/projects/{id}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);

        // get after delete -> 404
        let res = app
            .clone()
            .oneshot(
                Request::get(format!("/api/projects/{id}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn update_missing_returns_404() {
        let app = test_router();
        let res = app
            .oneshot(put("/api/projects/nope", r#"{"name":"x","doc":{}}"#))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn build_rejects_path_traversal() {
        let app = test_router();
        let res = app
            .oneshot(post(
                "/api/projects/abc-123/build",
                r#"{"files":[{"path":"../escape.txt","content":"x"}]}"#,
            ))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn preview_before_build_returns_404() {
        let app = test_router();
        let res = app
            .oneshot(
                Request::get("/preview/no-such-project/")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }
}
