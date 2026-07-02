import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listDirectories, resolveDirectoryBrowserRoots } from "./directory-browser.js";

const tempDirs: string[] = [];
const originalEnv = { ...process.env };

function makeDir(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `tycho-${name}-`));
  tempDirs.push(dir);
  return realpathSync(dir);
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) || path;
}

afterEach(() => {
  process.env = { ...originalEnv };
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("directory browser", () => {
  test("is disabled in production without configured roots", async () => {
    delete process.env.PROJECT_BROWSER_ROOTS;
    process.env.NODE_ENV = "production";

    assert.deepEqual(await resolveDirectoryBrowserRoots(), []);
  });

  test("uses the development home directory fallback", async () => {
    const home = makeDir("home");
    delete process.env.PROJECT_BROWSER_ROOTS;
    process.env.NODE_ENV = "development";
    process.env.HOME = home;

    assert.deepEqual(await resolveDirectoryBrowserRoots(), [{ name: basename(home), path: home }]);
  });

  test("lists roots without enumerating slash", async () => {
    const root = makeDir("root");
    process.env.PROJECT_BROWSER_ROOTS = root;

    assert.deepEqual(await listDirectories(), {
      roots: [{ name: basename(root), path: root }],
      currentPath: null,
      parentPath: null,
      entries: [{ name: basename(root), path: root }]
    });
  });

  test("lists child directories only and sorts by name", async () => {
    const root = makeDir("root");
    mkdirSync(join(root, "zeta"));
    mkdirSync(join(root, "alpha"));
    writeFileSync(join(root, "file.txt"), "not shown");
    process.env.PROJECT_BROWSER_ROOTS = root;

    const result = await listDirectories(root);

    assert.deepEqual(result.entries.map((entry) => entry.name), ["alpha", "zeta"]);
  });

  test("rejects paths outside configured roots", async () => {
    const root = makeDir("root");
    const outside = makeDir("outside");
    process.env.PROJECT_BROWSER_ROOTS = root;

    await assert.rejects(() => listDirectories(outside), /Directory path is outside configured roots/);
  });

  test("rejects non-directory paths", async () => {
    const root = makeDir("root");
    const filePath = join(root, "file.txt");
    writeFileSync(filePath, "not a directory");
    process.env.PROJECT_BROWSER_ROOTS = root;

    await assert.rejects(() => listDirectories(filePath), /Directory path is not a directory/);
  });

  test("omits symlinks that escape configured roots", async () => {
    const root = makeDir("root");
    const outside = makeDir("outside");
    symlinkSync(outside, join(root, "escape"));
    process.env.PROJECT_BROWSER_ROOTS = root;

    const result = await listDirectories(root);

    assert.equal(result.entries.some((entry) => entry.name === "escape"), false);
  });
});
