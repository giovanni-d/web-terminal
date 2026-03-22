use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use std::io::ErrorKind;
use tokio::sync::mpsc;
use tracing::info;

use crate::protocol::{self, ClientMessage};
use crate::pty::PtySession;

enum PtyCommand {
    Write(Vec<u8>),
    Resize(u16, u16),
}

pub async fn handle(socket: WebSocket) {
    let id = uuid::Uuid::new_v4();
    info!("[pty] session started ({id})");

    let pty = match PtySession::spawn(80, 24) {
        Ok(p) => p,
        Err(e) => {
            info!("[pty] failed to spawn: {e}");
            return;
        }
    };

    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (outbound_tx, mut outbound_rx) = mpsc::channel::<Vec<u8>>(64);
    let (cmd_tx, cmd_rx) = mpsc::channel::<PtyCommand>(64);

    // Task 1: PTY I/O (blocking thread)
    // Owns the PTY, handles reads + incoming write/resize commands
    let tx = outbound_tx.clone();
    let pty_task = tokio::task::spawn_blocking(move || {
        pty_io_loop(pty, tx, cmd_rx);
    });

    // Task 2: outbound channel → WebSocket sender
    let writer_task = tokio::spawn(async move {
        while let Some(data) = outbound_rx.recv().await {
            if ws_sender.send(Message::Binary(data.into())).await.is_err() {
                break;
            }
        }
        let _ = ws_sender.close().await;
    });

    // Main task: WebSocket receiver → PTY commands
    while let Some(Ok(msg)) = ws_receiver.next().await {
        match msg {
            Message::Binary(data) => match protocol::decode(&data) {
                ClientMessage::Stdin(bytes) => {
                    let _ = cmd_tx.send(PtyCommand::Write(bytes)).await;
                }
                ClientMessage::Resize { cols, rows } => {
                    let _ = cmd_tx.send(PtyCommand::Resize(cols, rows)).await;
                }
                ClientMessage::Unknown => {}
            },
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Cleanup: dropping cmd_tx signals the PTY thread to stop
    drop(cmd_tx);
    drop(outbound_tx);
    let _ = pty_task.await;
    writer_task.abort();

    info!("[pty] session ended ({id})");
}

fn pty_io_loop(
    mut pty: PtySession,
    outbound: mpsc::Sender<Vec<u8>>,
    cmd_rx: mpsc::Receiver<PtyCommand>,
) {
    let mut cmd_rx = cmd_rx;
    let mut buf = [0u8; 16384];

    loop {
        // Drain any pending commands (non-blocking)
        loop {
            match cmd_rx.try_recv() {
                Ok(PtyCommand::Write(data)) => {
                    let _ = pty.write_all(&data);
                }
                Ok(PtyCommand::Resize(cols, rows)) => {
                    let _ = pty.resize(cols, rows);
                }
                Err(mpsc::error::TryRecvError::Empty) => break,
                Err(mpsc::error::TryRecvError::Disconnected) => return,
            }
        }

        // Try to read from PTY
        match pty.read(&mut buf) {
            Ok(0) => {
                let _ = outbound.blocking_send(protocol::encode_control("exit", 0));
                return;
            }
            Ok(n) => {
                if outbound.blocking_send(protocol::encode_stdout(&buf[..n])).is_err() {
                    return;
                }
            }
            Err(ref e) if e.kind() == ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
            Err(_) => {
                let _ = outbound.blocking_send(protocol::encode_control("exit", 0));
                return;
            }
        }
    }
}
