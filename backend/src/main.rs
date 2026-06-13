mod build;
mod handlers;
mod realtime;
mod store;

use std::net::SocketAddr;
use std::path::PathBuf;
use tower_http::cors::CorsLayer;

#[tokio::main]
async fn main() {
    let db_path = std::env::var("APPFORGE_DB").unwrap_or_else(|_| "appforge.db".into());
    let workspaces =
        PathBuf::from(std::env::var("APPFORGE_WORKSPACES").unwrap_or_else(|_| "workspaces".into()));
    std::fs::create_dir_all(&workspaces).expect("failed to create workspaces dir");

    let store = store::Store::open(&db_path).expect("failed to open database");
    let state = handlers::AppState { store, workspaces };
    let app = handlers::router(state).layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([127, 0, 0, 1], 8787));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind");
    println!("appforge-backend listening on http://{addr}");
    axum::serve(listener, app).await.expect("server error");
}
