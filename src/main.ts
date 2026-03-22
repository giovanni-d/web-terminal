import { App } from "./ui/App.ts";
import "@xterm/xterm/css/xterm.css";
import "./style.css";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app element");

const app = new App(root);

app.init().catch((err) => {
  console.error("Failed to initialize terminal:", err);
  root.innerHTML =
    `<p class="error">Failed to start. Make sure the server is running.</p>`;
});
