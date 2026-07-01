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

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tycho" })).toBeVisible();

  await page.getByLabel("Name").fill("E2E Managed Project");
  await page.getByLabel("Local Path").fill(projectPath);
  await page.getByLabel("Description").fill("Created by Playwright");
  await page.getByRole("button", { name: "Add Project" }).click();

  await expect(page.locator("#projectFormStatus")).toHaveText("Project added");
  await expect(page.locator("#projectSelect")).toHaveValue("e2e-managed-project");
  await expect(page.locator("#projectPath")).toHaveText(projectPath);
  await expect(page.locator("#projectDescription")).toHaveText("Created by Playwright");
  await expect(page.getByRole("button", { name: "Delete Project" })).toBeEnabled();

  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Project" }).click();

  await expect(page.locator("#projectFormStatus")).toHaveText("Project deleted");
  await expect(page.locator("#projectSelect")).not.toHaveValue("e2e-managed-project");
});

test("shows a validation error for an invalid project path", async ({ page }) => {
  const missingPath = join(tmpdir(), `tycho-e2e-missing-${Date.now()}`);

  await page.goto("/");
  await page.getByLabel("Name").fill("Missing Project");
  await page.getByLabel("Local Path").fill(missingPath);
  await page.getByRole("button", { name: "Add Project" }).click();

  await expect(page.locator("#projectFormStatus")).toHaveClass(/error/);
  await expect(page.locator("#projectFormStatus")).toContainText("Project path is not a directory");
  await expect(page.locator("#projectSelect")).not.toHaveValue("missing-project");
});
