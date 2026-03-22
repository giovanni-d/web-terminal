async function run(cmd: string[], label: string): Promise<void> {
  console.log(`[build] ${label}...`);
  const { code } = await new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (code !== 0) {
    console.error(`[build] ${label} failed`);
    Deno.exit(code);
  }
}

// Build server binary (debug mode for faster compilation)
await run(
  ["cargo", "build", "--manifest-path", "server/Cargo.toml"],
  "server (axum + pty-process)",
);

console.log("[build] done\n");

// Start Rust server + Vite dev server
const server = new Deno.Command("./server/target/debug/terminal-server", {
  env: { ...Deno.env.toObject(), PORT: "3001", DIST_DIR: "dist", RUST_LOG: "info" },
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

const vite = new Deno.Command("deno", {
  args: ["run", "-A", "npm:vite"],
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

function killAll() {
  try { server.kill("SIGTERM"); } catch { /* already dead */ }
  try { vite.kill("SIGTERM"); } catch { /* already dead */ }
}

Deno.addSignalListener("SIGINT", () => {
  killAll();
  Deno.exit(0);
});

const result = await Promise.race([server.status, vite.status]);
killAll();
Deno.exit(result.code);
