mod protocol;
mod pty;
mod ws;

use axum::{
    extract::WebSocketUpgrade,
    http::{header, Uri},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use clap::Parser;
use rust_embed::Embed;

#[derive(Embed)]
#[folder = "../dist/"]
struct Assets;

#[derive(Parser)]
#[command(name = "terminal-server", about = "Web terminal server")]
struct Args {
    /// Port to listen on
    #[arg(short, long, default_value = "3000", env = "PORT")]
    port: u16,

    /// Host to bind to
    #[arg(long, default_value = "0.0.0.0", env = "HOST")]
    host: String,

    /// Log level (error, warn, info, debug, trace)
    #[arg(short, long, default_value = "info", env = "RUST_LOG")]
    log_level: String,
}

#[tokio::main]
async fn main() {
    let args = Args::parse();

    std::env::set_var("RUST_LOG", &args.log_level);
    tracing_subscriber::fmt::init();

    let app = Router::new()
        .route("/ws", get(ws_upgrade))
        .fallback(get(static_handler));

    let addr = format!("{}:{}", args.host, args.port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("failed to bind");

    tracing::info!("listening on http://{addr}");

    axum::serve(listener, app).await.expect("server error");
}

async fn ws_upgrade(upgrade: WebSocketUpgrade) -> impl IntoResponse {
    upgrade.on_upgrade(ws::handle)
}

async fn static_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };

    match Assets::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path)
                .first_or_octet_stream()
                .to_string();
            ([(header::CONTENT_TYPE, mime)], content.data).into_response()
        }
        None => {
            let index = Assets::get("index.html").unwrap();
            let mime = "text/html; charset=utf-8";
            ([(header::CONTENT_TYPE, mime.to_string())], index.data).into_response()
        }
    }
}
