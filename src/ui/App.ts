import { Session } from "./Session.ts";
import { TabBar } from "./TabBar.ts";

export class App {
  private sessions = new Map<string, Session>();
  private activeId: string | null = null;
  private tabOrder: string[] = [];
  private tabBar: TabBar;
  private terminalArea: HTMLElement;
  private statusBar: HTMLElement;
  private resizeObserver: ResizeObserver;

  constructor(private root: HTMLElement) {
    this.tabBar = new TabBar(root, {
      onSelect: (id) => this.activate(id),
      onClose: (id) => this.closeSession(id),
      onNew: () => this.createSession(),
      onReorder: (ids) => {
        this.tabOrder = ids;
      },
    });

    this.terminalArea = document.createElement("div");
    this.terminalArea.className = "terminal-area";
    root.appendChild(this.terminalArea);

    this.statusBar = document.createElement("div");
    this.statusBar.className = "status-bar";
    this.statusBar.textContent = "disconnected";
    this.terminalArea.appendChild(this.statusBar);

    this.resizeObserver = new ResizeObserver(() => {
      const active = this.activeId !== null
        ? this.sessions.get(this.activeId)
        : null;
      active?.fit();
    });
    this.resizeObserver.observe(this.terminalArea);
  }

  private showStatus(show: boolean): void {
    this.statusBar.classList.toggle("status-bar--visible", show);
    this.terminalArea.classList.toggle("terminal-area--disconnected", show);
  }

  async createSession(): Promise<void> {
    const session = new Session(this.terminalArea);

    session.onExit = () => this.closeSession(session.id);

    session.onDisconnect = () => {
      this.showStatus(true);
    };

    this.sessions.set(session.id, session);
    this.tabOrder.push(session.id);
    this.tabBar.addTab(session.id);
    this.activate(session.id);

    try {
      await session.connect();
      this.showStatus(false);
    } catch {
      this.showStatus(true);
    }
  }

  private activate(id: string): void {
    if (this.activeId !== null) {
      this.sessions.get(this.activeId)?.hide();
    }
    this.activeId = id;
    this.sessions.get(id)?.show();
    this.tabBar.setActive(id);
  }

  private closeSession(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;

    session.destroy();
    this.sessions.delete(id);
    this.tabOrder = this.tabOrder.filter((i) => i !== id);
    this.tabBar.removeTab(id);

    if (this.activeId === id) {
      if (this.tabOrder.length > 0) {
        this.activate(this.tabOrder[this.tabOrder.length - 1]);
      } else {
        this.activeId = null;
      }
    }
  }

  async init(): Promise<void> {
    await this.createSession();
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    for (const session of this.sessions.values()) {
      session.destroy();
    }
    this.sessions.clear();
    this.tabBar.destroy();
  }
}
