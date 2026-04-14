mod bm25;
mod eval;
mod handlers;
mod index;
mod vector;

use std::sync::Arc;

use axum::{
    routing::{get, post},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use handlers::{
    benchmark_handler, eval_results_handler, health_handler, index_handler,
    load_eval_cases_handler, query_handler, AppStateInner,
};

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "engine=debug,tower_http=debug".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let state = Arc::new(AppStateInner::new());

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/index", post(index_handler))
        .route("/query", post(query_handler))
        .route("/benchmark", get(benchmark_handler))
        .route("/eval/cases", post(load_eval_cases_handler))
        .route("/eval/results", get(eval_results_handler))
        .layer(cors)
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3001".to_string());
    let addr = format!("0.0.0.0:{port}");
    tracing::info!("engine listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
