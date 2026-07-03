import { expect, test } from "@playwright/test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

declare global {
  interface Window {
    __TYCHO_WS_MESSAGES__?: string[];
    __TYCHO_INJECT_WS_MESSAGE__?: (payload: unknown) => void;
  }
}

const tempDirs: string[] = [];
const directoryBrowserRoot = resolve(".playwright-mcp/directory-root");

function makeProjectDir(): string {
  mkdirSync(directoryBrowserRoot, { recursive: true });
  const dir = mkdtempSync(join(directoryBrowserRoot, "tycho-e2e-project-"));
  tempDirs.push(dir);
  return realpathSync(dir);
}

function roleLabel(username: string): string {
  return username === "admin" ? "管理员" : "普通用户";
}

async function chooseProjectDirectory(page: import("@playwright/test").Page, projectPath: string): Promise<void> {
  const rootPath = realpathSync(directoryBrowserRoot);

  await page.getByRole("button", { name: "Browse" }).click();
  await expect(page.getByRole("heading", { name: "Choose Project Folder" })).toBeVisible();
  await page.getByRole("button", { name: `Open ${rootPath}`, exact: true }).click();
  await page.getByRole("button", { name: `Select ${projectPath}`, exact: true }).click();
  await page.getByRole("button", { name: "Use This Folder" }).click();
  await expect(page.getByLabel("Local Path")).toHaveValue(projectPath);
}

async function installWebSocketMessageInjector(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class TychoTestWebSocket extends NativeWebSocket {
      private readonly tychoMessageListeners: EventListenerOrEventListenerObject[] = [];

      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        window.__TYCHO_INJECT_WS_MESSAGE__ = (payload: unknown) => {
          const event = new MessageEvent("message", { data: JSON.stringify(payload) });
          for (const listener of this.tychoMessageListeners) {
            if (typeof listener === "function") {
              listener.call(this, event);
            } else {
              listener.handleEvent(event);
            }
          }
        };
      }

      override addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions
      ): void {
        if (type === "message" && listener) {
          this.tychoMessageListeners.push(listener);
        }
        super.addEventListener(type, listener, options);
      }
    };
  });
}

async function login(
  page: import("@playwright/test").Page,
  username: string,
  password: string,
  options: { clearSessions?: boolean } = {}
): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.removeItem("tycho-layout-mode");
    localStorage.removeItem("tycho-slot-assignments");
    localStorage.removeItem("tycho-active-slot-id");
  });
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page.getByRole("button", { name: `${username} ${roleLabel(username)}` })).toBeVisible();
  if (options.clearSessions !== false) {
    await closeAllSessions(page);
  }
}

async function openAccountMenu(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: /.+ (管理员|普通用户)/ }).click();
}

async function selectWorkspaceProject(page: import("@playwright/test").Page, projectName: string): Promise<void> {
  await page.getByRole("button", { name: /^Project / }).click();
  await page.getByRole("option", { name: projectName, exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Project ${projectName}$`) })).toBeVisible();
}

async function selectedWorkspaceProjectId(page: import("@playwright/test").Page): Promise<string> {
  return (await page.locator("[data-project-switcher-trigger]").getAttribute("data-selected-project-id")) || "";
}

async function waitForWorkspaceConnection(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator("#connectionStatus")).toHaveText("Connected");
}

async function closeAllSessions(page: import("@playwright/test").Page): Promise<void> {
  await waitForWorkspaceConnection(page);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const windows = await page.evaluate(async () => {
      const response = await fetch("/api/state");
      const state = (await response.json()) as { windows?: Array<{ id: string }> };
      return state.windows || [];
    });
    if (windows.length === 0) {
      return;
    }

    await page.evaluate(async (windowId) => {
      await fetch(`/api/windows/${encodeURIComponent(windowId)}`, { method: "DELETE" });
    }, windows[0].id);
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const response = await fetch("/api/state");
          const state = (await response.json()) as { windows?: Array<{ id: string }> };
          return state.windows?.length || 0;
        })
      )
      .toBe(windows.length - 1);
  }
  throw new Error("Could not clear existing sessions before the test");
}

async function startNamedSession(page: import("@playwright/test").Page, name: string): Promise<void> {
  await waitForWorkspaceConnection(page);
  await page.getByRole("button", { name: /CodeBuddy/ }).click();
  const dialog = page.getByRole("dialog", { name: "Name Session" });
  await expect(dialog).toBeVisible();
  const nameInput = dialog.getByLabel("Session Name");
  await nameInput.fill(name);
  await expect(nameInput).toHaveValue(name);
  await expect(dialog.getByRole("button", { name: "Start Session" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Start Session" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(visibleSessionCard(page, name)).toBeVisible();
}

async function addManagedProject(page: import("@playwright/test").Page, name: string, projectPath: string): Promise<void> {
  await openProjectManagement(page);
  await page.getByRole("button", { name: "Add Project" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await chooseProjectDirectory(page, projectPath);
  await page.getByLabel("Description").fill(`${name} description`);
  await page.getByRole("button", { name: "Save Project" }).click();
  await expect(page.locator("#projectFormStatus")).toHaveText("Project added");
  await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible();
}

async function deleteManagedProjectsByName(page: import("@playwright/test").Page, names: string[]): Promise<void> {
  const deletedNames = await page.evaluate(async (projectNames) => {
    const configResponse = await fetch("/api/config");
    const config = (await configResponse.json()) as { projects?: Array<{ id: string; name: string; managed?: boolean }> };
    const projects = (config.projects || []).filter((project) => project.managed && projectNames.includes(project.name));
    for (const project of projects) {
      await fetch(`/api/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
    }
    return [...new Set(projects.map((project) => project.name))].sort();
  }, names);
  expect(deletedNames).toEqual([...names].sort());
}

function visibleSessionCard(page: import("@playwright/test").Page, name: string): import("@playwright/test").Locator {
  return page.locator(`.terminal-card[data-session-title="${name}"]`);
}

async function closeSession(page: import("@playwright/test").Page, name: string): Promise<void> {
  const card = visibleSessionCard(page, name);
  if (await card.count() === 0) {
    return;
  }
  await card.getByRole("button", { name: "Close Session" }).click();
  const dialog = page.getByRole("dialog", { name: "Close Session" });
  if (await dialog.count() > 0) {
    await dialog.getByRole("button", { name: "Close Session" }).click();
  }
  await expect(card).toHaveCount(0);
}

async function logout(page: import("@playwright/test").Page): Promise<void> {
  const logoutItem = page.getByRole("menuitem", { name: "Log Out" });
  if (await logoutItem.count() === 0) {
    await openAccountMenu(page);
  }
  await logoutItem.click();
}

async function openProjectManagement(page: import("@playwright/test").Page): Promise<void> {
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Admin Management" }).click();
  await expect(page).toHaveURL(/\/admin\/projects$/);
  await expect(page.getByRole("navigation", { name: "Admin Management" })).toBeVisible();
  await expect(page.locator(".workspace-sidebar")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Project Management" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Managed" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit Project" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Delete Selected" })).toBeDisabled();
  await expect(page.locator("#projectForm")).toHaveCount(0);
}

async function openUserManagement(page: import("@playwright/test").Page): Promise<void> {
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Admin Management" }).click();
  await expect(page).toHaveURL(/\/admin\/projects$/);
  await page.getByRole("link", { name: "User Management" }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Users" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit User" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Delete Selected" })).toBeDisabled();
  await expect(page.locator("#userFormStatus")).toHaveCount(0);
}

async function openSessionManagement(page: import("@playwright/test").Page): Promise<void> {
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Admin Management" }).click();
  await expect(page).toHaveURL(/\/admin\/projects$/);
  await page.getByRole("link", { name: "Session Management" }).click();
  await expect(page).toHaveURL(/\/admin\/sessions$/);
  await expect(page.getByRole("heading", { name: "Session Management" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Sessions" })).toBeVisible();
}

test.afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("adds and deletes a managed project", async ({ page }) => {
  const projectPath = makeProjectDir();
  const editedProjectPath = makeProjectDir();

  await login(page, "admin", "admin");
  await expect(page.getByRole("button", { name: "New CodeBuddy" })).toHaveCount(0);
  await expect(page.locator(".sidebar").getByRole("heading", { name: "Add Project" })).toHaveCount(0);
  await expect(page.locator(".sidebar").getByRole("heading", { name: "Users" })).toHaveCount(0);
  await openProjectManagement(page);

  await page.getByRole("button", { name: "Add Project" }).click();
  await page.getByLabel("Name", { exact: true }).fill("E2E Managed Project");
  await chooseProjectDirectory(page, projectPath);
  await page.getByLabel("Description").fill("Created by Playwright");
  await page.getByRole("button", { name: "Save Project" }).click();

  await expect(page.locator("#projectFormStatus")).toHaveText("Project added");
  await expect(page.getByRole("row", { name: new RegExp(`E2E Managed Project.*${projectPath}.*Created by Playwright`) })).toBeVisible();
  await expect(page.getByText("Selected Path")).toHaveCount(0);
  await expect(page.getByText("Selected Description")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Select E2E Managed Project" }).check();
  await expect(page.getByRole("button", { name: "Edit Project" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Delete Selected" })).toBeEnabled();
  await expect(page.getByText("Selected Path")).toHaveCount(0);
  await expect(page.getByText("Selected Description")).toHaveCount(0);

  await page.getByRole("button", { name: "Edit Project" }).click();
  await page.getByLabel("Name", { exact: true }).fill("E2E Edited Project");
  await page.getByLabel("Local Path").fill("");
  await chooseProjectDirectory(page, editedProjectPath);
  await page.getByLabel("Description").fill("Edited by Playwright");
  await page.getByRole("button", { name: "Save Project" }).click();

  await expect(page.locator("#projectFormStatus")).toHaveText("Project updated");
  await expect(page.getByRole("row", { name: new RegExp(`E2E Edited Project.*${editedProjectPath}.*Edited by Playwright`) })).toBeVisible();
  await expect(page.getByText("Selected Path")).toHaveCount(0);
  await expect(page.getByText("Selected Description")).toHaveCount(0);

  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Selected" }).click();

  await expect(page.locator("#projectFormStatus")).toHaveText("Project deleted");
  await expect(page.getByRole("row", { name: /E2E Edited Project/ })).toHaveCount(0);
});

test("changes password from the account menu", async ({ page }) => {
  await login(page, "admin", "admin");
  await openUserManagement(page);
  await page.getByRole("button", { name: "Add User" }).click();
  await page.getByLabel("New Username").fill("password-user");
  await page.getByLabel("New Password").fill("initial-password");
  await page.getByLabel("New Role").selectOption("user");
  await page.getByRole("button", { name: "Save User" }).click();
  await expect(page.locator("#userFormStatus")).toHaveText("User created");

  await logout(page);
  await login(page, "password-user", "initial-password");
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Change Password" }).click();
  await expect(page.getByRole("heading", { name: "Change Password" })).toBeVisible();
  await page.getByLabel("Current Password").fill("initial-password");
  await page.getByLabel("New Password").fill("changed-password");
  await page.getByRole("button", { name: "Save Password" }).click();
  await expect(page.locator("#passwordFormStatus")).toHaveText("Password changed");
  await page.getByRole("button", { name: "Close" }).click();

  await logout(page);
  await page.getByLabel("Username").fill("password-user");
  await page.getByLabel("Password").fill("initial-password");
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page.locator(".login-panel .form-status")).toHaveText("Invalid username or password");

  await page.getByLabel("Password").fill("changed-password");
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page.getByRole("button", { name: "password-user 普通用户" })).toBeVisible();
});

test("boots the Vue Vite client", async ({ page }) => {
  await page.goto("/");

  await expect.poll(() => page.evaluate(() => window.__TYCHO_CLIENT__)).toBe("vue-vite");
});

test("workspace interactions: account menu closes when clicking outside", async ({ page }) => {
  await login(page, "admin", "admin");

  await openAccountMenu(page);
  await expect(page.getByRole("menuitem", { name: "Log Out" })).toBeVisible();
  await page.getByRole("heading", { name: "Server-side TUIs" }).click();

  await expect(page.getByRole("menuitem", { name: "Log Out" })).toHaveCount(0);
});

test("interface style switch: toggles light style and persists across reload", async ({ page }) => {
  await login(page, "admin", "admin");

  const styleGroup = page.getByRole("group", { name: "Interface style" });
  await styleGroup.getByRole("button", { name: "Light" }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-interface-style", "light");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("tycho-interface-style")))
    .toBe("light");

  await page.reload();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-interface-style", "light");
  await styleGroup.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-interface-style", "dark");
});

test("custom project switcher: changes projects without native select", async ({ page }) => {
  const alphaPath = makeProjectDir();
  const betaPath = makeProjectDir();

  await login(page, "admin", "admin");
  await addManagedProject(page, "Switcher Alpha", alphaPath);
  await addManagedProject(page, "Switcher Beta", betaPath);
  await page.getByRole("link", { name: "Workspace" }).click();

  await expect(page.locator("#projectSelect")).toHaveCount(0);
  await selectWorkspaceProject(page, "Switcher Alpha");
  await expect(page.locator("#projectPath")).toHaveText(alphaPath);

  await selectWorkspaceProject(page, "Switcher Beta");
  await expect(page.locator("#projectPath")).toHaveText(betaPath);
  await expect(page.getByRole("listbox", { name: "Projects" })).toHaveCount(0);

  await deleteManagedProjectsByName(page, ["Switcher Alpha", "Switcher Beta"]);
});

test("input reminder: marks sessions that are waiting for user input", async ({ page }) => {
  await installWebSocketMessageInjector(page);
  await login(page, "admin", "admin");
  const selectedProjectId = await selectedWorkspaceProjectId(page);
  const selectedProjectPath = (await page.locator("#projectPath").textContent()) || "";
  await page.evaluate(({ projectId, projectPath }) => {
    window.__TYCHO_INJECT_WS_MESSAGE__?.({
      type: "state",
      state: {
        connected: true,
        windows: [{ id: "window-needs-input", title: "Needs Help", layout: {}, activePaneId: "pane-needs-input" }],
        panes: [
          {
            paneId: "pane-needs-input",
            status: "running",
            buffer: "I can do either option.\nWhich approach should I use?",
            entry: {
              id: "codebuddy",
              name: "CodeBuddy",
              command: "codebuddy",
              cwd: projectPath,
              projectId,
              projectPath,
              autostart: false,
              restart_on_exit: false
            }
          }
        ],
        activeWindowId: "window-needs-input",
        activePaneId: "pane-needs-input"
      }
    });
  }, { projectId: selectedProjectId, projectPath: selectedProjectPath });

  const sidebarItem = page.locator("#sessionList .session-item", { hasText: "Needs Help" });
  await expect(sidebarItem).toHaveClass(/input-waiting/);
  await expect(sidebarItem.getByText("Needs input")).toBeVisible();

  const card = visibleSessionCard(page, "Needs Help");
  await expect(card).toHaveClass(/input-waiting/);
  await expect(card.locator(".terminal-titlebar").getByText("Needs input")).toBeVisible();
  await expect(card).toHaveAttribute("data-slot-id", "slot-1");

  await page.evaluate(() => {
    window.__TYCHO_INJECT_WS_MESSAGE__?.({
      type: "pane_output",
      paneId: "pane-needs-input",
      data: "\nWorking on it now\n"
    });
  });

  await expect(sidebarItem).not.toHaveClass(/input-waiting/);
  await expect(card).not.toHaveClass(/input-waiting/);
});

test("workspace interactions: creating a session asks for a name and sends it", async ({ page }) => {
  await page.addInitScript(() => {
    window.__TYCHO_WS_MESSAGES__ = [];
    const originalSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function patchedSend(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      window.__TYCHO_WS_MESSAGES__?.push(typeof data === "string" ? data : "[binary]");
      return originalSend.call(this, data);
    };
  });

  await login(page, "admin", "admin");
  await waitForWorkspaceConnection(page);
  await page.getByRole("button", { name: /CodeBuddy/ }).click();
  await expect(page.getByRole("heading", { name: "Name Session" })).toBeVisible();
  await page.getByLabel("Session Name").fill("Focused Build");
  await page.getByRole("button", { name: "Start Session" }).click();

  await expect(visibleSessionCard(page, "Focused Build")).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (window.__TYCHO_WS_MESSAGES__ || []).some((message) => {
          try {
            const payload = JSON.parse(message) as Record<string, unknown>;
            return payload.type === "create_session" && payload.label === "Focused Build";
          } catch {
            return false;
          }
        })
      )
    )
    .toBe(true);
  await closeSession(page, "Focused Build");
});

test("user session isolation: admin manages ordinary user sessions from backend only", async ({ page }) => {
  const username = `session-user-${Date.now()}`;
  const password = "session-password";
  const sessionName = "User Owned Session";

  await login(page, "admin", "admin");
  const projectName = (await page.locator(".project-switcher-name").textContent()) || "tycho";

  await openUserManagement(page);
  await page.getByRole("button", { name: "Add User" }).click();
  await page.getByLabel("New Username").fill(username);
  await page.getByLabel("New Password").fill(password);
  await page.getByLabel("New Role").selectOption("user");
  await page.getByRole("button", { name: "Save User" }).click();
  await expect(page.locator("#userFormStatus")).toHaveText("User created");

  const userRow = page.locator(`[data-user-row="${username}"]`);
  await expect(userRow).toBeVisible();
  await userRow.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel(projectName).check();
  await page.getByRole("button", { name: "Save Projects" }).click();
  await expect(page.locator(".user-status-message")).toHaveText("Projects saved");

  await logout(page);
  await login(page, username, password);
  await startNamedSession(page, sessionName);
  await expect(page.locator("#sessionList .session-item", { hasText: sessionName })).toBeVisible();
  await expect(visibleSessionCard(page, sessionName)).toBeVisible();

  await logout(page);
  await login(page, "admin", "admin", { clearSessions: false });

  await expect(page.locator("#sessionList .session-item", { hasText: sessionName })).toHaveCount(0);
  await expect(visibleSessionCard(page, sessionName)).toHaveCount(0);

  await openSessionManagement(page);
  const sessionRow = page.getByRole("row", { name: new RegExp(`${sessionName}.*${username}.*CodeBuddy`) });
  await expect(sessionRow).toBeVisible();
  await expect(sessionRow.getByText(/\d{4}-\d{2}-\d{2}/)).toBeVisible();

  await sessionRow.getByRole("button", { name: "View" }).click();
  const drawer = page.getByRole("complementary", { name: "Session details" });
  await expect(drawer.getByRole("heading", { name: "Session Details" })).toBeVisible();
  await expect(drawer.getByText(sessionName)).toBeVisible();
  await expect(drawer.getByText(username)).toBeVisible();

  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toHaveCount(0);
  await sessionRow.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("#sessionAdminStatus")).toHaveText("Session deleted");
  await expect(sessionRow).toHaveCount(0);
});

test("workspace interactions: focusing a session does not scroll the terminal grid", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await login(page, "admin", "admin");
  await startNamedSession(page, "Focus One");
  await page.addStyleTag({
    content: "#terminalGrid::after { content: ''; display: block; height: 900px; }"
  });

  const grid = page.locator("#terminalGrid");
  await grid.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const beforeScrollTop = await grid.evaluate((element) => element.scrollTop);
  expect(beforeScrollTop).toBeGreaterThan(0);

  await page.locator("#sessionList .session-item", { hasText: "Focus One" }).click();

  await expect.poll(() => grid.evaluate((element) => element.scrollTop)).toBe(beforeScrollTop);
});

test("sidebar session close: closes a session from the Sessions list", async ({ page }) => {
  await login(page, "admin", "admin");
  await startNamedSession(page, "Sidebar Close");

  const sessionItem = page.locator("#sessionList .session-item", { hasText: "Sidebar Close" });
  await expect(sessionItem).toBeVisible();
  await sessionItem.getByRole("button", { name: "Close Sidebar Close" }).click();
  await page.getByRole("dialog", { name: "Close Session" }).getByRole("button", { name: "Close Session" }).click();

  await expect(sessionItem).toHaveCount(0);
  await expect(visibleSessionCard(page, "Sidebar Close")).toHaveCount(0);
});

test("terminal card actions: omits redundant Focus button", async ({ page }) => {
  await login(page, "admin", "admin");
  await startNamedSession(page, "No Focus Button");

  const card = visibleSessionCard(page, "No Focus Button");
  await expect(card.getByRole("button", { name: "Focus" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Close Session" })).toBeVisible();
});

test("session close focus polish: uses custom close confirmation", async ({ page }) => {
  let nativeDialogs = 0;
  page.on("dialog", async (dialog) => {
    nativeDialogs += 1;
    await dialog.dismiss();
  });

  await login(page, "admin", "admin");
  await startNamedSession(page, "Confirm Close");

  const card = visibleSessionCard(page, "Confirm Close");
  await card.getByRole("button", { name: "Close Session" }).click();
  const dialog = page.getByRole("dialog", { name: "Close Session" });
  await expect(dialog.getByRole("heading", { name: "Close Session" })).toBeVisible();
  await expect(dialog.getByText("Confirm Close")).toBeVisible();
  expect(nativeDialogs).toBe(0);

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(card).toBeVisible();
  await expect(page.getByRole("heading", { name: "Close Session" })).toHaveCount(0);

  await card.getByRole("button", { name: "Close Session" }).click();
  await page.getByRole("dialog", { name: "Close Session" }).getByRole("button", { name: "Close Session" }).click();
  await expect(card).toHaveCount(0);
  expect(nativeDialogs).toBe(0);
});

test("session close focus polish: marks active sidebar session", async ({ page }) => {
  await login(page, "admin", "admin");
  await startNamedSession(page, "Active Sidebar");

  const sessionItem = page.locator("#sessionList .session-item", { hasText: "Active Sidebar" });
  await expect(sessionItem).toHaveClass(/active/);
});

test("single active session selection: selecting sessions keeps one active item and stable card order", async ({ page }) => {
  await login(page, "admin", "admin");
  await startNamedSession(page, "Stable One");
  await startNamedSession(page, "Stable Two");
  await startNamedSession(page, "Stable Three");

  const sidebarTwo = page.locator("#sessionList .session-item", { hasText: "Stable Two" });
  await sidebarTwo.click();
  await expect(page.locator("#sessionList .session-item.active")).toHaveCount(1);
  await expect(sidebarTwo).toHaveClass(/active/);
  await expect(visibleSessionCard(page, "Stable Two")).toHaveCount(1);

  const cardOne = visibleSessionCard(page, "Stable One");
  await cardOne.click();
  const sidebarOne = page.locator("#sessionList .session-item", { hasText: "Stable One" });
  await expect(page.locator("#sessionList .session-item.active")).toHaveCount(1);
  await expect(sidebarOne).toHaveClass(/active/);
  await expect(visibleSessionCard(page, "Stable One")).toHaveCount(1);
});

test("session slot layout: switches visible slot modes", async ({ page }) => {
  await login(page, "admin", "admin");
  await startNamedSession(page, "Layout One");
  await startNamedSession(page, "Layout Two");
  await startNamedSession(page, "Layout Three");

  await page.locator('[data-slot-id="slot-1"]').click();
  await page.locator("#sessionList .session-item", { hasText: "Layout One" }).click();
  await page.getByRole("button", { name: "Single session layout" }).click();
  await expect(visibleSessionCard(page, "Layout One")).toBeVisible();
  await expect(page.locator('.terminal-card[data-session-title^="Layout "]')).toHaveCount(1);

  await page.getByRole("button", { name: "Two vertical layout" }).click();
  await page.locator('[data-slot-id="slot-2"]').click();
  await page.locator("#sessionList .session-item", { hasText: "Layout Two" }).click();
  await expect(page.locator('.terminal-card[data-session-title^="Layout "]')).toHaveCount(2);

  await page.getByRole("button", { name: "Two horizontal layout" }).click();
  await expect(page.locator('.terminal-card[data-session-title^="Layout "]')).toHaveCount(2);

  await page.getByRole("button", { name: "Four session layout" }).click();
  await page.locator('[data-slot-id="slot-3"]').click();
  await page.locator("#sessionList .session-item", { hasText: "Layout Three" }).click();
  await expect(page.locator('.terminal-card[data-session-title^="Layout "]')).toHaveCount(3);
});

test("session slot layout: assigns sessions through active slot and selector", async ({ page }) => {
  await login(page, "admin", "admin");
  await startNamedSession(page, "Slot Alpha");
  await startNamedSession(page, "Slot Beta");
  await startNamedSession(page, "Slot Gamma");
  await page.getByRole("button", { name: "Two vertical layout" }).click();

  const slotTwo = page.locator('[data-slot-id="slot-2"]');
  await slotTwo.click();
  await page.locator("#sessionList .session-item", { hasText: "Slot Gamma" }).click();
  await expect(slotTwo).toHaveAttribute("data-session-title", "Slot Gamma");
  await expect(page.locator('[data-slot-id="slot-1"]')).not.toHaveAttribute("data-session-title", "Slot Gamma");

  await slotTwo.getByLabel("Session for Slot 2").selectOption({ label: "Slot Beta" });
  await expect(slotTwo).toHaveAttribute("data-session-title", "Slot Beta");
  await expect(page.locator("#sessionList .session-item", { hasText: "Slot Gamma" })).toBeVisible();
});

test("session slot layout: hides display without closing and still confirms close", async ({ page }) => {
  await login(page, "admin", "admin");
  await startNamedSession(page, "Hide Me");
  await startNamedSession(page, "Close Me");
  await page.getByRole("button", { name: "Two vertical layout" }).click();

  await page.locator('[data-slot-id="slot-1"]').click();
  await page.locator("#sessionList .session-item", { hasText: "Hide Me" }).click();
  await page.locator('[data-slot-id="slot-2"]').click();
  await page.locator("#sessionList .session-item", { hasText: "Close Me" }).click();

  const hideSlot = visibleSessionCard(page, "Hide Me");
  await hideSlot.getByRole("button", { name: "Hide" }).click();
  await expect(page.locator("#sessionList .session-item", { hasText: "Hide Me" })).toBeVisible();
  await expect(visibleSessionCard(page, "Hide Me")).toHaveCount(0);

  const closeSlot = visibleSessionCard(page, "Close Me");
  await closeSlot.getByRole("button", { name: "Close Session" }).click();
  await page.getByRole("dialog", { name: "Close Session" }).getByRole("button", { name: "Close Session" }).click();
  await expect(page.locator("#sessionList .session-item", { hasText: "Close Me" })).toHaveCount(0);
});

test("terminal resize fit: emits valid resize dimensions across layout changes", async ({ page }) => {
  await page.addInitScript(() => {
    window.__TYCHO_WS_MESSAGES__ = [];
    const originalSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function patchedSend(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      window.__TYCHO_WS_MESSAGES__?.push(typeof data === "string" ? data : "[binary]");
      return originalSend.call(this, data);
    };
  });

  await login(page, "admin", "admin");
  await startNamedSession(page, "Resize Fit");
  await page.getByRole("button", { name: "Single session layout" }).click();
  await page.getByRole("button", { name: "Four session layout" }).click();

  await expect
    .poll(async () =>
      page.evaluate(() =>
        (window.__TYCHO_WS_MESSAGES__ || [])
          .map((message) => {
            try {
              return JSON.parse(message) as Record<string, unknown>;
            } catch {
              return null;
            }
          })
          .filter((payload): payload is Record<string, unknown> => Boolean(payload) && payload.type === "resize")
      )
    )
    .toContainEqual(expect.objectContaining({ type: "resize", cols: expect.any(Number), rows: expect.any(Number) }));

  const invalidResizeCount = await page.evaluate(() =>
    (window.__TYCHO_WS_MESSAGES__ || []).filter((message) => {
      try {
        const payload = JSON.parse(message) as Record<string, unknown>;
        return payload.type === "resize" && (!(Number(payload.cols) > 0) || !(Number(payload.rows) > 0));
      } catch {
        return false;
      }
    }).length
  );
  expect(invalidResizeCount).toBe(0);
});

test("project scoped sessions: switching projects filters session list and slots without closing sessions", async ({ page }) => {
  const alphaPath = makeProjectDir();
  const betaPath = makeProjectDir();

  await login(page, "admin", "admin");
  await addManagedProject(page, "Project Scope Alpha", alphaPath);
  await addManagedProject(page, "Project Scope Beta", betaPath);
  await page.getByRole("link", { name: "Workspace" }).click();

  await selectWorkspaceProject(page, "Project Scope Alpha");
  await startNamedSession(page, "Alpha Session");
  await expect(page.locator("#sessionList .session-item", { hasText: "Alpha Session" })).toBeVisible();
  await expect(visibleSessionCard(page, "Alpha Session")).toBeVisible();

  await selectWorkspaceProject(page, "Project Scope Beta");
  await startNamedSession(page, "Beta Session");
  await expect(page.locator("#sessionList .session-item", { hasText: "Beta Session" })).toBeVisible();
  await expect(visibleSessionCard(page, "Beta Session")).toBeVisible();
  await expect(page.locator("#sessionList .session-item", { hasText: "Alpha Session" })).toHaveCount(0);
  await expect(visibleSessionCard(page, "Alpha Session")).toHaveCount(0);

  await selectWorkspaceProject(page, "Project Scope Alpha");
  await expect(page.locator("#sessionList .session-item", { hasText: "Alpha Session" })).toBeVisible();
  await expect(visibleSessionCard(page, "Alpha Session")).toBeVisible();
  await expect(page.locator("#sessionList .session-item", { hasText: "Beta Session" })).toHaveCount(0);
  await expect(visibleSessionCard(page, "Beta Session")).toHaveCount(0);

  await selectWorkspaceProject(page, "Project Scope Beta");
  await expect(page.locator("#sessionList .session-item", { hasText: "Beta Session" })).toBeVisible();
  await expect(visibleSessionCard(page, "Beta Session")).toBeVisible();

  await deleteManagedProjectsByName(page, ["Project Scope Alpha", "Project Scope Beta"]);
});

test("project scoped sessions: restored sessions without project metadata use cwd for filtering", async ({ page }) => {
  const alphaPath = makeProjectDir();
  const betaPath = makeProjectDir();

  await installWebSocketMessageInjector(page);
  await login(page, "admin", "admin");
  await addManagedProject(page, "Restored Scope Alpha", alphaPath);
  await addManagedProject(page, "Restored Scope Beta", betaPath);
  await page.getByRole("link", { name: "Workspace" }).click();

  await page.evaluate(
    ({ alphaPath: injectedAlphaPath, betaPath: injectedBetaPath }) => {
      window.__TYCHO_INJECT_WS_MESSAGE__?.({
        type: "state",
        state: {
          connected: true,
          windows: [
            { id: "window-restored-alpha", title: "Restored Alpha", layout: {}, activePaneId: "pane-restored-alpha" },
            { id: "window-restored-beta", title: "Restored Beta", layout: {}, activePaneId: "pane-restored-beta" }
          ],
          panes: [
            {
              paneId: "pane-restored-alpha",
              status: "running",
              buffer: "> ",
              entry: {
                id: "codex-restored-alpha",
                name: "Restored Alpha",
                command: "codex",
                cwd: injectedAlphaPath,
                autostart: false,
                restart_on_exit: false
              }
            },
            {
              paneId: "pane-restored-beta",
              status: "running",
              buffer: "> ",
              entry: {
                id: "codex-restored-beta",
                name: "Restored Beta",
                command: "codex",
                cwd: injectedBetaPath,
                autostart: false,
                restart_on_exit: false
              }
            }
          ],
          activeWindowId: "window-restored-alpha",
          activePaneId: "pane-restored-alpha"
        }
      });
    },
    { alphaPath, betaPath }
  );

  await selectWorkspaceProject(page, "Restored Scope Alpha");
  await expect(page.locator("#sessionList .session-item", { hasText: "Restored Alpha" })).toBeVisible();
  await expect(page.locator("#sessionList .session-item", { hasText: "Restored Beta" })).toHaveCount(0);

  await selectWorkspaceProject(page, "Restored Scope Beta");
  await expect(page.locator("#sessionList .session-item", { hasText: "Restored Beta" })).toBeVisible();
  await expect(page.locator("#sessionList .session-item", { hasText: "Restored Alpha" })).toHaveCount(0);

  await deleteManagedProjectsByName(page, ["Restored Scope Alpha", "Restored Scope Beta"]);
});

test("shows a validation error for an invalid project path", async ({ page }) => {
  const missingPath = join(directoryBrowserRoot, `tycho-e2e-missing-${Date.now()}`);

  await login(page, "admin", "admin");
  await openProjectManagement(page);
  await page.getByRole("button", { name: "Add Project" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Missing Project");
  await page.getByLabel("Local Path").fill(missingPath);
  await page.getByRole("button", { name: "Save Project" }).click();

  await expect(page.locator("#projectFormStatus")).toHaveClass(/error/);
  await expect(page.locator("#projectFormStatus")).toContainText("Project path is not a directory");
  await expect(page.getByRole("row", { name: /Missing Project/ })).toHaveCount(0);
});

test("directory browser API is admin-only and root constrained", async ({ page }) => {
  await login(page, "admin", "admin");
  const adminPayload = await page.evaluate(async () => {
    const response = await fetch("/api/directories");
    return {
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      body: await response.text()
    };
  });
  expect(adminPayload.status).toBe(200);
  expect(adminPayload.contentType).toContain("application/json");
  expect(JSON.parse(adminPayload.body).roots.length).toBeGreaterThan(0);

  const outsideStatus = await page.evaluate(async () => {
    const response = await fetch(`/api/directories?path=${encodeURIComponent("/")}`);
    return response.status;
  });
  expect(outsideStatus).toBe(403);

  await openUserManagement(page);
  await page.getByRole("button", { name: "Add User" }).click();
  await page.getByLabel("New Username").fill("directory-user");
  await page.getByLabel("New Password").fill("directory-password");
  await page.getByRole("button", { name: "Save User" }).click();
  await expect(page.locator("#userFormStatus")).toHaveText("User created");

  await logout(page);
  await login(page, "directory-user", "directory-password");
  const userStatus = await page.evaluate(async () => {
    const response = await fetch("/api/directories");
    return response.status;
  });
  expect(userStatus).toBe(403);
});

test("admin assigns a project and ordinary user cannot manage projects", async ({ page }) => {
  const projectPath = makeProjectDir();

  await login(page, "admin", "admin");
  await openProjectManagement(page);
  await page.getByRole("button", { name: "Add Project" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Assigned Project");
  await page.getByLabel("Local Path").fill(projectPath);
  await page.getByLabel("Description").fill("Visible to assigned user");
  await page.getByRole("button", { name: "Save Project" }).click();
  await expect(page.locator("#projectFormStatus")).toHaveText("Project added");

  await openUserManagement(page);
  await page.getByRole("button", { name: "Add User" }).click();
  await page.getByLabel("New Username").fill("alice");
  await page.getByLabel("New Password").fill("secret-secret");
  await page.getByLabel("New Role").selectOption("user");
  await page.getByRole("button", { name: "Save User" }).click();
  await expect(page.locator("#userFormStatus")).toHaveText("User created");

  const aliceRow = page.locator('[data-user-row="alice"]');
  await expect(aliceRow).toBeVisible();
  await aliceRow.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Assigned Project").check();
  await page.getByRole("button", { name: "Save Projects" }).click();
  await expect(page.locator(".user-status-message")).toHaveText("Projects saved");

  await logout(page);
  await login(page, "alice", "secret-secret");

  await expect.poll(() => selectedWorkspaceProjectId(page)).toBe("assigned-project");
  await expect(page.locator("#projectDescription")).toHaveText("Visible to assigned user");
  await openAccountMenu(page);
  await expect(page.getByRole("menuitem", { name: "Admin Management" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Project Management" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "User Management" })).toHaveCount(0);
  await page.goto("/admin/projects");
  await expect(page).toHaveURL(/\/$/);

  const status = await page.evaluate(async () => {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Forbidden", path: "/tmp", description: "" })
    });
    return response.status;
  });
  expect(status).toBe(403);

  await logout(page);
  await login(page, "admin", "admin");
  await openProjectManagement(page);
  await page.getByRole("checkbox", { name: "Select Assigned Project" }).check();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Selected" }).click();
  await expect(page.locator("#projectFormStatus")).toHaveText("Project deleted");
});
