import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDirs: string[] = [];

function makeProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "tycho-e2e-project-"));
  tempDirs.push(dir);
  return dir;
}

async function login(page: import("@playwright/test").Page, username: string, password: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page.getByRole("button", { name: `${username} / ${username === "admin" ? "admin" : "user"}` })).toBeVisible();
}

async function openAccountMenu(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: /.+ \/ (admin|user)/ }).click();
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

  await login(page, "admin", "admin");
  await expect(page.getByRole("button", { name: "New CodeBuddy" })).toHaveCount(0);
  await expect(page.locator(".sidebar").getByRole("heading", { name: "Add Project" })).toHaveCount(0);
  await expect(page.locator(".sidebar").getByRole("heading", { name: "Users" })).toHaveCount(0);
  await openProjectManagement(page);

  await page.getByRole("button", { name: "Add Project" }).click();
  await page.getByLabel("Name", { exact: true }).fill("E2E Managed Project");
  await page.getByLabel("Local Path").fill(projectPath);
  await page.getByLabel("Description").fill("Created by Playwright");
  await page.getByRole("button", { name: "Save Project" }).click();

  await expect(page.locator("#projectFormStatus")).toHaveText("Project added");
  await expect(page.getByRole("row", { name: /E2E Managed Project/ })).toBeVisible();
  await expect(page.locator("#projectPath")).toHaveText(projectPath);
  await expect(page.locator("#projectDescription")).toHaveText("Created by Playwright");
  await page.getByRole("checkbox", { name: "Select E2E Managed Project" }).check();
  await expect(page.getByRole("button", { name: "Edit Project" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Delete Selected" })).toBeEnabled();

  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Selected" }).click();

  await expect(page.locator("#projectFormStatus")).toHaveText("Project deleted");
  await expect(page.getByRole("row", { name: /E2E Managed Project/ })).toHaveCount(0);
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
  await expect(page.getByRole("button", { name: "password-user / user" })).toBeVisible();
});

test("boots the Vue Vite client", async ({ page }) => {
  await page.goto("/");

  await expect.poll(() => page.evaluate(() => window.__TYCHO_CLIENT__)).toBe("vue-vite");
});

test("shows a validation error for an invalid project path", async ({ page }) => {
  const missingPath = join(tmpdir(), `tycho-e2e-missing-${Date.now()}`);

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
