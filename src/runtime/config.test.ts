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
  readRuntimeConfig
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
  delete process.env.PROJECTS_DB;
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
