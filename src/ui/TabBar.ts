export interface TabBarEvents {
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onReorder: (orderedIds: string[]) => void;
}

export class TabBar {
  private container: HTMLElement;
  private tabList: HTMLElement;
  private events: TabBarEvents;
  private draggedTab: HTMLElement | null = null;
  private usedNumbers = new Set<number>();

  constructor(parent: HTMLElement, events: TabBarEvents) {
    this.events = events;

    this.container = document.createElement("div");
    this.container.className = "tab-bar";

    this.tabList = document.createElement("div");
    this.tabList.className = "tab-bar__tabs";

    const newBtn = document.createElement("button");
    newBtn.className = "tab-bar__new";
    newBtn.textContent = "+";
    newBtn.title = "New terminal";
    newBtn.addEventListener("click", () => this.events.onNew());

    this.container.appendChild(this.tabList);
    this.container.appendChild(newBtn);
    parent.appendChild(this.container);

    this.setupDragDrop();
  }

  private nextNumber(): number {
    let n = 1;
    while (this.usedNumbers.has(n)) n++;
    this.usedNumbers.add(n);
    return n;
  }

  addTab(id: string): void {
    const num = this.nextNumber();
    const tab = document.createElement("div");
    tab.className = "tab-bar__tab";
    tab.dataset.id = id;
    tab.dataset.num = String(num);
    tab.draggable = true;

    const label = document.createElement("span");
    label.className = "tab-bar__label";
    label.textContent = `Terminal ${num}`;

    const closeBtn = document.createElement("button");
    closeBtn.className = "tab-bar__close";
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.events.onClose(id);
    });

    tab.addEventListener("click", () => this.events.onSelect(id));
    tab.appendChild(label);
    tab.appendChild(closeBtn);
    this.tabList.appendChild(tab);
  }

  removeTab(id: string): void {
    const tab = this.tabList.querySelector(`[data-id="${id}"]`) as
      | HTMLElement
      | null;
    if (tab) {
      const num = parseInt(tab.dataset.num || "0");
      this.usedNumbers.delete(num);
      tab.remove();
    }
  }

  setActive(id: string): void {
    for (const tab of this.tabList.children) {
      const el = tab as HTMLElement;
      el.classList.toggle("tab-bar__tab--active", el.dataset.id === id);
    }
  }

  private setupDragDrop(): void {
    this.tabList.addEventListener("dragstart", (e) => {
      const tab = (e.target as HTMLElement).closest(
        ".tab-bar__tab",
      ) as HTMLElement;
      if (!tab) return;
      this.draggedTab = tab;
      tab.classList.add("tab-bar__tab--dragging");
      e.dataTransfer!.effectAllowed = "move";
    });

    this.tabList.addEventListener("dragend", () => {
      if (this.draggedTab) {
        this.draggedTab.classList.remove("tab-bar__tab--dragging");
        this.draggedTab = null;
      }
    });

    this.tabList.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
      if (!this.draggedTab) return;

      const target = (e.target as HTMLElement).closest(
        ".tab-bar__tab",
      ) as HTMLElement;
      if (!target || target === this.draggedTab) return;

      const tabs = [...this.tabList.children] as HTMLElement[];
      const dragIdx = tabs.indexOf(this.draggedTab);
      const targetIdx = tabs.indexOf(target);

      if (dragIdx < targetIdx) {
        this.tabList.insertBefore(this.draggedTab, target.nextSibling);
      } else {
        this.tabList.insertBefore(this.draggedTab, target);
      }
    });

    this.tabList.addEventListener("drop", (e) => {
      e.preventDefault();
      const orderedIds = [...this.tabList.children].map(
        (el) => (el as HTMLElement).dataset.id!,
      );
      this.events.onReorder(orderedIds);
    });
  }

  destroy(): void {
    this.container.remove();
  }
}
