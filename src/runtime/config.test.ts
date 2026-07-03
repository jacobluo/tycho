import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  addManagedProject,
  createSessionEntry,
  getProject,
  getPublicRuntimeConfig,
  removeManagedProject,
  readRuntimeConfig,
  toPublicAgentEntry,
  toPublicTuimuxState,
  updateManagedProject
} from "./config.js";

const ORIGINAL_ENV = { ...process.env };
const tempDirs: string[] = [];

function makeProjectDir(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `tycho-${name}-`));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.PROJECTS_JSON;
  delete process.env.PROJECT_DIRS;
  delete process.env.DEFAULT_PROJECT_ID;
  delete process.env.AGENT_WORKDIR;
  delete process.env.CODEBUDDY_WORKDIR;
  const storeDir = makeProjectDir("store");
  process.env.PROJECTS_DB = join(storeDir, "projects.sqlite");
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("runtime config", () => {
  test("reads explicit project allowlist from PROJECTS_JSON", () => {
    const alphaPath = makeProjectDir("alpha");
    const betaPath = makeProjectDir("beta");
    process.env.PROJECTS_JSON = JSON.stringify([
      { id: "alpha", name: "Alpha", path: alphaPath },
      { id: "beta", name: "Beta", path: betaPath }
    ]);
    process.env.DEFAULT_PROJECT_ID = "beta";

    const runtime = readRuntimeConfig();

    assert.equal(runtime.defaultProjectId, "beta");
    assert.deepEqual(runtime.projects, [
      { id: "alpha", name: "Alpha", path: alphaPath },
      { id: "beta", name: "Beta", path: betaPath }
    ]);
    assert.equal(runtime.agents.find((agent) => agent.id === "codebuddy")?.cwd, betaPath);
  });

  test("rejects unknown project ids", () => {
    const projectPath = makeProjectDir("only");
    process.env.PROJECTS_JSON = JSON.stringify([
      { id: "only", name: "Only", path: projectPath }
    ]);

    assert.throws(() => getProject("missing", readRuntimeConfig()), /Unknown project: missing/);
  });

  test("rejects duplicate project ids", () => {
    const firstPath = makeProjectDir("first");
    const secondPath = makeProjectDir("second");
    process.env.PROJECTS_JSON = JSON.stringify([
      { id: "dup", name: "First", path: firstPath },
      { id: "dup", name: "Second", path: secondPath }
    ]);

    assert.throws(() => readRuntimeConfig(), /Duplicate project id: dup/);
  });

  test("session entries run in the selected project directory", () => {
    const projectPath = makeProjectDir("session");
    const runtime = readRuntimeConfig();
    const agent = runtime.agents[0];
    const project = { id: "session", name: "Session", path: projectPath };

    const entry = createSessionEntry(agent, project, "Session smoke");

    assert.equal(entry.name, "Session smoke");
    assert.equal(entry.cwd, projectPath);
    assert.equal(entry.env?.REMOTE_TUI_PROJECT_ID, "session");
    assert.equal(entry.env?.REMOTE_TUI_PROJECT_PATH, projectPath);
  });

  test("browser-safe session entries omit env while internal entries keep it", () => {
    const projectPath = makeProjectDir("safe-entry");
    process.env.CODEBUDDY_TOKEN = "unit-test-token";
    process.env.CODEBUDDY_ENV_JSON = JSON.stringify({ EXTRA_SECRET: "hidden" });
    const runtime = readRuntimeConfig();
    const agent = runtime.agents.find((candidate) => candidate.id === "codebuddy")!;
    const project = { id: "safe-entry", name: "Safe Entry", path: projectPath };

    const entry = createSessionEntry(agent, project, "Safe entry");
    const publicEntry = toPublicAgentEntry(entry);

    assert.equal(entry.env?.CODEBUDDY_TOKEN, "unit-test-token");
    assert.equal(entry.env?.EXTRA_SECRET, "hidden");
    assert.equal("env" in publicEntry, false);
    assert.equal(publicEntry.id, entry.id);
    assert.equal(publicEntry.name, entry.name);
    assert.equal(publicEntry.cwd, projectPath);
    assert.equal(publicEntry.projectId, "safe-entry");
    assert.equal(publicEntry.projectName, "Safe Entry");
    assert.equal(publicEntry.projectPath, projectPath);
  });

  test("browser-safe tuimux state omits nested pane env", () => {
    const projectPath = makeProjectDir("safe-state");
    const runtime = readRuntimeConfig();
    const project = { id: "safe-state", name: "Safe State", path: projectPath };
    const entry = createSessionEntry(runtime.agents[0], project, "Safe state", {
      REMOTE_TUI_USER_ID: "user-1",
      SECRET_VALUE: "hidden"
    });

    const publicState = toPublicTuimuxState({
      connected: true,
      windows: [{ id: "window-1", title: "Safe state", layout: {}, activePaneId: "pane-1" }],
      panes: [{ paneId: "pane-1", entry, status: "running", buffer: "hello" }],
      activeWindowId: "window-1",
      activePaneId: "pane-1"
    });

    assert.equal("env" in publicState.panes[0].entry, false);
    assert.equal(publicState.panes[0].entry.name, "Safe state");
    assert.equal(publicState.panes[0].buffer, "hello");
    assert.equal(publicState.panes[0].entry.projectId, "safe-state");
    assert.equal(publicState.panes[0].entry.projectName, "Safe State");
    assert.equal(publicState.panes[0].entry.projectPath, projectPath);
  });

  test("public config default project falls back to visible projects", () => {
    const alphaPath = makeProjectDir("alpha");
    const betaPath = makeProjectDir("beta");
    process.env.PROJECTS_JSON = JSON.stringify([
      { id: "alpha", name: "Alpha", path: alphaPath },
      { id: "beta", name: "Beta", path: betaPath }
    ]);
    process.env.DEFAULT_PROJECT_ID = "alpha";
    const runtime = readRuntimeConfig();

    assert.equal(getPublicRuntimeConfig(runtime, [runtime.projects[1]]).defaultProjectId, "beta");
    assert.equal(getPublicRuntimeConfig(runtime, []).defaultProjectId, "");
  });

  test("persists managed projects with descriptions", async () => {
    const storeDir = makeProjectDir("store");
    const projectPath = makeProjectDir("managed");
    process.env.PROJECTS_DB = join(storeDir, "projects.sqlite");

    const project = await addManagedProject({
      name: "Managed App",
      path: projectPath,
      description: "Local customer workbench"
    });
    const runtime = readRuntimeConfig();

    assert.equal(project.id, "managed-app");
    assert.deepEqual(runtime.projects.find((candidate) => candidate.id === "managed-app"), {
      id: "managed-app",
      name: "Managed App",
      path: projectPath,
      description: "Local customer workbench",
      managed: true
    });
    assert.equal(existsSync(process.env.PROJECTS_DB), true);
  });

  test("rejects managed projects with duplicate paths", async () => {
    const storeDir = makeProjectDir("store");
    const projectPath = makeProjectDir("managed");
    process.env.PROJECTS_DB = join(storeDir, "projects.sqlite");

    await addManagedProject({ name: "First", path: projectPath });

    await assert.rejects(
      () => addManagedProject({ name: "Second", path: projectPath }),
      /Project path is already configured/
    );
  });

  test("updates managed project details", async () => {
    const storeDir = makeProjectDir("store");
    const firstPath = makeProjectDir("first");
    const secondPath = makeProjectDir("second");
    process.env.PROJECTS_DB = join(storeDir, "projects.sqlite");

    const project = await addManagedProject({ name: "Managed App", path: firstPath, description: "Before" });
    const updated = await updateManagedProject(project.id, {
      name: "Updated App",
      path: secondPath,
      description: "After"
    });

    assert.deepEqual(updated, {
      id: project.id,
      name: "Updated App",
      path: secondPath,
      description: "After",
      managed: true
    });
    assert.deepEqual(readRuntimeConfig().projects.find((candidate) => candidate.id === project.id), updated);
  });

  test("rejects managed project updates with duplicate paths", async () => {
    const storeDir = makeProjectDir("store");
    const firstPath = makeProjectDir("first");
    const secondPath = makeProjectDir("second");
    process.env.PROJECTS_DB = join(storeDir, "projects.sqlite");

    const first = await addManagedProject({ name: "First", path: firstPath });
    await addManagedProject({ name: "Second", path: secondPath });

    await assert.rejects(
      () => updateManagedProject(first.id, { path: secondPath }),
      /Project path is already configured/
    );
  });

  test("does not update configured projects", async () => {
    const storeDir = makeProjectDir("store");
    const envProjectPath = makeProjectDir("env");
    process.env.PROJECTS_DB = join(storeDir, "projects.sqlite");
    process.env.PROJECTS_JSON = JSON.stringify([
      { id: "env", name: "Env", path: envProjectPath }
    ]);

    assert.equal(await updateManagedProject("env", { name: "Nope" }), null);
  });

  test("removes only managed projects", async () => {
    const storeDir = makeProjectDir("store");
    const envProjectPath = makeProjectDir("env");
    const managedPath = makeProjectDir("managed");
    process.env.PROJECTS_DB = join(storeDir, "projects.sqlite");
    process.env.PROJECTS_JSON = JSON.stringify([
      { id: "env", name: "Env", path: envProjectPath }
    ]);

    const project = await addManagedProject({ name: "Managed", path: managedPath });

    assert.equal(await removeManagedProject(project.id), true);
    assert.equal(readRuntimeConfig().projects.some((candidate) => candidate.id === project.id), false);
    assert.equal(await removeManagedProject("env"), false);
    assert.equal(readRuntimeConfig().projects.some((candidate) => candidate.id === "env"), true);
  });
});
