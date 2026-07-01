const { Terminal } = window;

const els = {
  status: document.querySelector("#connectionStatus"),
  projectSelect: document.querySelector("#projectSelect"),
  projectPath: document.querySelector("#projectPath"),
  agentButtons: document.querySelector("#agentButtons"),
  sessionList: document.querySelector("#sessionList"),
  terminalGrid: document.querySelector("#terminalGrid"),
  newCodeBuddy: document.querySelector("#newCodeBuddy")
};

let socket;
let config = { agents: [], projects: [], defaultProjectId: "" };
let state = { connected: false, windows: [], panes: [], activeWindowId: null, activePaneId: null };
const terminals = new Map();
let activePaneId = null;
let selectedProjectId = "";

function connect() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${location.host}/ws`);

  socket.addEventListener("open", () => {
    els.status.textContent = "Connected";
    els.status.classList.add("connected");
  });

  socket.addEventListener("close", () => {
    els.status.textContent = "Disconnected, retrying";
    els.status.classList.remove("connected");
    setTimeout(connect, 800);
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "config") {
      config = message.config;
      selectedProjectId = getInitialProjectId();
      renderProjects();
      renderAgents();
      return;
    }
    if (message.type === "state") {
      state = message.state;
      render();
      return;
    }
    if (message.type === "pane_output") {
      terminals.get(message.paneId)?.term.write(message.data);
    }
  });
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function createSession(agentId) {
  send({ type: "create_session", agentId, projectId: selectedProjectId });
}

function getInitialProjectId() {
  const stored = localStorage.getItem("tycho-project-id");
  if (stored && config.projects.some((project) => project.id === stored)) {
    return stored;
  }
  return config.defaultProjectId || config.projects[0]?.id || "";
}

function selectedProject() {
  return config.projects.find((project) => project.id === selectedProjectId) || config.projects[0];
}

function renderProjects() {
  els.projectSelect.replaceChildren(
    ...config.projects.map((project) => {
      const option = document.createElement("option");
      option.value = project.id;
      option.textContent = project.name;
      option.selected = project.id === selectedProjectId;
      return option;
    })
  );
  renderProjectPath();
}

function renderProjectPath() {
  const project = selectedProject();
  els.projectPath.textContent = project ? project.path : "No project configured";
}

function renderAgents() {
  els.agentButtons.replaceChildren(
    ...config.agents.map((agent) => {
      const button = document.createElement("button");
      button.className = "agent-button";
      button.type = "button";
      button.innerHTML = `<span>${agent.name}</span><span>${agent.command}</span>`;
      button.disabled = !selectedProjectId;
      button.addEventListener("click", () => createSession(agent.id));
      return button;
    })
  );
}

function render() {
  els.status.textContent = state.connected ? "Connected" : "Connecting";
  els.status.classList.toggle("connected", state.connected);
  renderSessions();
  renderTerminals();
}

function renderSessions() {
  if (state.windows.length === 0) {
    els.sessionList.innerHTML = `<div class="session-item"><span>No sessions</span></div>`;
    return;
  }

  els.sessionList.replaceChildren(
    ...state.windows.map((windowState) => {
      const pane = paneForWindow(windowState);
      const item = document.createElement("div");
      item.className = "session-item";
      item.innerHTML = `<strong>${escapeHtml(windowState.title)}</strong><span>${escapeHtml(pane?.status || "starting")}</span><small>${escapeHtml(pane?.entry?.cwd || "")}</small>`;
      item.addEventListener("click", () => {
        document.querySelector(`[data-window-id="${windowState.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        send({ type: "focus_window", windowId: windowState.id });
      });
      return item;
    })
  );
}

function renderTerminals() {
  const livePaneIds = new Set(state.panes.map((pane) => pane.paneId));
  for (const [paneId, terminal] of terminals) {
    if (!livePaneIds.has(paneId)) {
      terminal.term.dispose();
      terminals.delete(paneId);
    }
  }

  if (state.windows.length === 0) {
    els.terminalGrid.className = "terminal-grid empty";
    els.terminalGrid.innerHTML = `<div class="empty-state">Start an agent to open a live TUI panel.</div>`;
    return;
  }

  els.terminalGrid.className = "terminal-grid";
  els.terminalGrid.querySelector(".empty-state")?.remove();

  for (const windowState of state.windows) {
    const pane = paneForWindow(windowState);
    if (!pane) {
      continue;
    }
    let card = els.terminalGrid.querySelector(`[data-window-id="${windowState.id}"]`);
    if (!card) {
      card = document.createElement("article");
      card.className = "terminal-card";
      card.dataset.windowId = windowState.id;
      card.dataset.paneId = pane.paneId;
      card.innerHTML = `
        <div class="terminal-titlebar">
          <div class="terminal-title"><strong></strong><span></span></div>
          <div class="terminal-actions">
            <button type="button" data-action="focus">Focus</button>
            <button class="danger" type="button" data-action="close">Close</button>
          </div>
        </div>
        <div class="terminal-host"></div>
      `;
      card.querySelector('[data-action="focus"]').addEventListener("click", () => {
        send({ type: "focus_window", windowId: windowState.id });
        focusPane(pane.paneId);
      });
      card.querySelector('[data-action="close"]').addEventListener("click", () => {
        send({ type: "close_window", windowId: windowState.id });
      });
      els.terminalGrid.append(card);
    }

    card.querySelector("strong").textContent = windowState.title;
    card.querySelector("span").textContent = `${pane.status} / ${pane.entry.cwd}`;
    card.classList.toggle("active", state.activeWindowId === windowState.id || activePaneId === pane.paneId);

    if (!terminals.has(pane.paneId)) {
      mountTerminal(card, card.querySelector(".terminal-host"), windowState, pane);
    }
  }

  for (const card of Array.from(els.terminalGrid.querySelectorAll(".terminal-card"))) {
    if (!state.windows.some((windowState) => windowState.id === card.dataset.windowId)) {
      card.remove();
    }
  }
}

function mountTerminal(card, host, windowState, pane) {
  const term = new Terminal({
    allowProposedApi: false,
    cursorBlink: true,
    fontFamily: '"SFMono-Regular", Menlo, Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.18,
    theme: {
      background: "#0b0f14",
      foreground: "#eef2f7",
      cursor: "#4fb8ff",
      selectionBackground: "#2f5d7c"
    }
  });

  host.tabIndex = 0;
  term.open(host);
  term.write(pane.buffer || "");
  term.onData((data) => send({ type: "input", paneId: pane.paneId, data }));
  terminals.set(pane.paneId, { term, host });

  const focus = () => {
    activePaneId = pane.paneId;
    send({ type: "focus_window", windowId: windowState.id });
    term.focus();
    for (const current of document.querySelectorAll(".terminal-card.active")) {
      current.classList.remove("active");
    }
    card.classList.add("active");
  };

  host.addEventListener("pointerdown", focus);
  host.addEventListener("focus", focus);
  card.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".terminal-actions")) {
      return;
    }
    focus();
  });

  const resize = () => {
    const rect = host.getBoundingClientRect();
    const cols = Math.max(20, Math.floor((rect.width - 16) / 7.8));
    const rows = Math.max(6, Math.floor((rect.height - 16) / 15.4));
    term.resize(cols, rows);
    send({ type: "resize", paneId: pane.paneId, cols, rows });
  };

  new ResizeObserver(resize).observe(host);
  setTimeout(() => {
    resize();
    focus();
  }, 50);
}

function focusPane(paneId) {
  const terminal = terminals.get(paneId);
  if (!terminal) {
    return;
  }
  activePaneId = paneId;
  terminal.term.focus();
}

function paneForWindow(windowState) {
  return state.panes.find((pane) => pane.paneId === windowState.activePaneId);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

els.projectSelect.addEventListener("change", () => {
  selectedProjectId = els.projectSelect.value;
  localStorage.setItem("tycho-project-id", selectedProjectId);
  renderProjectPath();
  renderAgents();
});
els.newCodeBuddy.addEventListener("click", () => createSession("codebuddy"));
connect();
