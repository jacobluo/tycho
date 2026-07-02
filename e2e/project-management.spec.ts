import { expect, test } from "@playwright/test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

declare global {
  interface Window {
    __TYCHO_WS_MESSAGES__?: string[];
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

async function login(page: import("@playwright/test").Page, username: string, password: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page.getByRole("button", { name: `${username} ${roleLabel(username)}` })).toBeVisible();
}

async function openAccountMenu(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: /.+ (管理员|普通用户)/ }).click();
}

async function waitForWorkspaceConnection(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator("#connectionStatus")).toHaveText("Connected");
}

async function startNamedSession(page: import("@playwright/test").Page, name: string): Promise<void> {
  await waitForWorkspaceConnection(page);
  await page.getByRole("button", { name: /CodeBuddy/ }).click();
  await expect(page.getByRole("heading", { name: "Name Session" })).toBeVisible();
  await page.getByLabel("Session Name").fill(name);
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect(page.getByRole("heading", { name: "Name Session" })).toHaveCount(0);
  await expect(page.locator(".terminal-card", { hasText: name })).toBeVisible();
}

async function closeSession(page: import("@playwright/test").Page, name: string): Promise<void> {
  const card = page.locator(".terminal-card", { hasText: name });
  if (await card.count() === 0) {
    return;
  }
  await card.getByRole("button", { name: "Close" }).click();
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

  await expect(page.locator(".terminal-card", { hasText: "Focused Build" })).toBeVisible();
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

  await expect(sessionItem).toHaveCount(0);
  await expect(page.locator(".terminal-card", { hasText: "Sidebar Close" })).toHaveCount(0);
});

test("terminal card actions: omits redundant Focus button", async ({ page }) => {
  await login(page, "admin", "admin");
  await startNamedSession(page, "No Focus Button");

  const card = page.locator(".terminal-card", { hasText: "No Focus Button" });
  await expect(card.getByRole("button", { name: "Focus" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Close" })).toBeVisible();
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

  await expect(page.locator("#projectSelect")).toHaveValue("assigned-project");
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
