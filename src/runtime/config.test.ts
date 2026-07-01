import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  createSessionEntry,
  getProject,
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
});
