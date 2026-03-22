import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { UnicodeGraphemesAddon } from "@xterm/addon-unicode-graphemes";

const MSG_STDIN = 0x01;
const MSG_STDOUT = 0x02;
const MSG_RESIZE = 0x03;
const MSG_CONTROL = 0x04;

export class Session {
  readonly id: string;
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private searchAddon: SearchAddon;
  private ws: WebSocket | null = null;
  private container: HTMLElement;
  private encoder = new TextEncoder();
  private connected = false;
  private destroying = false;

  /** Shell process exited — safe to close the tab */
  onExit: (() => void) | null = null;
  /** WebSocket disconnected — server went away, keep tab alive */
  onDisconnect: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.id = crypto.randomUUID();

    this.container = document.createElement("div");
    this.container.className = "session";
    this.container.style.display = "none";
    parent.appendChild(this.container);

    this.terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      theme: {
        background: "#11111b",
        foreground: "#c0caf5",
        cursor: "#c0caf5",
        selectionBackground: "#7aa2f744",
        black: "#45475a",
        red: "#f38ba8",
        green: "#a6e3a1",
        yellow: "#f9e2af",
        blue: "#89b4fa",
        magenta: "#f5c2e7",
        cyan: "#94e2d5",
        white: "#bac2de",
        brightBlack: "#585b70",
        brightRed: "#f38ba8",
        brightGreen: "#a6e3a1",
        brightYellow: "#f9e2af",
        brightBlue: "#89b4fa",
        brightMagenta: "#f5c2e7",
        brightCyan: "#94e2d5",
        brightWhite: "#a6adc8",
      },
    });

    this.fitAddon = new FitAddon();
    this.searchAddon = new SearchAddon();

    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(this.searchAddon);
    this.terminal.loadAddon(new WebLinksAddon());
    this.terminal.loadAddon(new ClipboardAddon());
    this.terminal.loadAddon(new UnicodeGraphemesAddon());

    this.terminal.open(this.container);

    try {
      this.terminal.loadAddon(new WebglAddon());
    } catch {
      // WebGL not available
    }

    this.terminal.onData((data) => {
      this.sendStdin(this.encoder.encode(data));
    });

    this.terminal.onResize(({ cols, rows }) => {
      this.sendResize(cols, rows);
    });

    this.terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;

      if (event.ctrlKey && event.key === "c") {
        if (this.terminal.hasSelection()) {
          navigator.clipboard.writeText(this.terminal.getSelection()).catch(
            () => {},
          );
          this.terminal.clearSelection();
          return false;
        }
      }

      if (event.ctrlKey && event.key === "v") {
        event.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (text) this.sendStdin(this.encoder.encode(text));
        }).catch(() => {});
        return false;
      }

      return true;
    });
  }

  async connect(): Promise<void> {
    const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${wsProtocol}//${location.host}/ws`;

    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onmessage = (event) => {
      const data = new Uint8Array(event.data as ArrayBuffer);
      const type = data[0];
      const payload = data.subarray(1);

      switch (type) {
        case MSG_STDOUT:
          this.terminal.write(payload);
          break;
        case MSG_CONTROL: {
          const ctrl = JSON.parse(new TextDecoder().decode(payload));
          if (ctrl.event === "exit") {
            this.connected = false;
            this.onExit?.();
          }
          break;
        }
      }
    };

    this.ws.onclose = () => {
      if (this.connected && !this.destroying) {
        this.connected = false;
        this.onDisconnect?.();
      }
    };

    this.ws.onerror = () => {};

    await new Promise<void>((resolve, reject) => {
      this.ws!.onopen = () => {
        this.connected = true;
        resolve();
      };
      this.ws!.onerror = () => reject(new Error("WebSocket connection failed"));
    });

    this.fit();
    this.sendResize(this.terminal.cols, this.terminal.rows);
  }

  get isConnected(): boolean {
    return this.connected;
  }

  private sendStdin(data: Uint8Array): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const buf = new Uint8Array(1 + data.length);
    buf[0] = MSG_STDIN;
    buf.set(data, 1);
    this.ws.send(buf);
  }

  private sendResize(cols: number, rows: number): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const json = this.encoder.encode(JSON.stringify({ cols, rows }));
    const buf = new Uint8Array(1 + json.length);
    buf[0] = MSG_RESIZE;
    buf.set(json, 1);
    this.ws.send(buf);
  }

  fit(): void {
    this.fitAddon.fit();
  }

  show(): void {
    this.container.style.display = "";
    this.fit();
    this.terminal.focus();
  }

  hide(): void {
    this.container.style.display = "none";
  }

  destroy(): void {
    this.destroying = true;
    this.ws?.close();
    this.terminal.dispose();
    this.container.remove();
  }
}
