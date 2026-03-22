# Web Terminal

A browser-based terminal emulator. Connects to a real shell running on the server via WebSocket. Ships as a single binary with the frontend embedded.

## Architecture

```
Browser (xterm.js)  <--WebSocket-->  Rust server (axum + pty-process)
```

- **Frontend**: TypeScript + xterm.js, built with Vite
- **Server**: Rust binary using axum for HTTP/WebSocket and pty-process for PTY management
- **Single binary**: Frontend is embedded at compile time via rust-embed — no external files needed

## Features

- Multiple terminal tabs with drag-and-drop reordering
- Copy/paste (Ctrl+C / Ctrl+V)
- Clickable URLs
- Unicode/emoji support (UnicodeGraphemesAddon)
- WebGL-accelerated rendering
- Auto-resize to fit window
- Server disconnection detection with status indicator
- Configurable via CLI args (port, host, log level)

## Requirements

- [Deno](https://deno.com) (frontend build)
- [Rust](https://rustup.rs) (server)

## Development

```sh
deno install
deno task dev
```

Runs cargo-watch (auto-rebuilds server on Rust changes) and Vite (HMR for frontend) in parallel. Open http://localhost:5173.

You can also run them separately:

```sh
deno task dev:server   # cargo watch + server on port 3001
deno task dev:vite     # Vite on port 5173
```

## Running

```sh
deno task build:all
./server/target/release/terminal-server
```

Single binary, no runtime dependencies. Serves everything on port 3000.

```
$ terminal-server --help
Web terminal server

Usage: terminal-server [OPTIONS]

Options:
  -p, --port <PORT>            Port to listen on [env: PORT=] [default: 3000]
      --host <HOST>            Host to bind to [env: HOST=] [default: 0.0.0.0]
  -l, --log-level <LOG_LEVEL>  Log level (error, warn, info, debug, trace) [env: RUST_LOG=] [default: info]
  -h, --help                   Print help
```

```sh
terminal-server --port 8080 --host 127.0.0.1
```

## Project Structure

```
src/                Frontend (TypeScript)
  ui/
    App.ts          Tab management, layout
    Session.ts      xterm.js instance + WebSocket connection
    TabBar.ts       Tab bar with drag-and-drop
  main.ts           Entry point
  style.css         Styles

server/             Rust server
  src/
    main.rs         axum router, embedded static files (rust-embed)
    ws.rs           WebSocket handler, per-session PTY lifecycle
    pty.rs          PTY spawn/read/write via pty-process
    protocol.rs     Binary message protocol (stdin/stdout/resize/control)
```
