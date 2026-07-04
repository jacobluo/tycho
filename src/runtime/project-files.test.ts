import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listProjectFiles, previewProjectFile, PROJECT_FILE_PREVIEW_LIMIT } from "./project-files.js";
import type { ProjectConfig } from "./config.js";

const tempDirs: string[] = [];

function makeProject(): ProjectConfig {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "tycho-project-files-")));
  tempDirs.push(dir);
  return { id: "alpha", name: "Alpha", path: dir };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("project file browser", () => {
  test("lists root entries with directories before files sorted by name", async () => {
    const project = makeProject();
    mkdirSync(join(project.path, "zeta"));
    mkdirSync(join(project.path, "alpha"));
    writeFileSync(join(project.path, "readme.md"), "# Readme");
    writeFileSync(join(project.path, "app.ts"), "console.log('ok');");

    const listing = await listProjectFiles(project, "");

    assert.equal(listing.projectId, "alpha");
    assert.equal(listing.projectName, "Alpha");
    assert.equal(listing.currentPath, "");
    assert.equal(listing.parentPath, null);
    assert.deepEqual(
      listing.entries.map((entry) => `${entry.type}:${entry.name}`),
      ["directory:alpha", "directory:zeta", "file:app.ts", "file:readme.md"]
    );
  });

  test("lists nested directories and exposes parent path", async () => {
    const project = makeProject();
    mkdirSync(join(project.path, "src"));
    mkdirSync(join(project.path, "src", "components"));
    writeFileSync(join(project.path, "src", "main.ts"), "export {};");

    const listing = await listProjectFiles(project, "src");

    assert.equal(listing.currentPath, "src");
    assert.equal(listing.parentPath, "");
    assert.deepEqual(
      listing.entries.map((entry) => entry.relativePath),
      ["src/components", "src/main.ts"]
    );
  });

  test("rejects traversal outside the project root", async () => {
    const project = makeProject();

    await assert.rejects(() => listProjectFiles(project, "../outside"), /File path is outside project/);
    await assert.rejects(() => previewProjectFile(project, "../outside.txt"), /File path is outside project/);
  });

  test("rejects symlinks that escape the project root", async () => {
    const project = makeProject();
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "tycho-project-files-outside-")));
    tempDirs.push(outside);
    writeFileSync(join(outside, "secret.txt"), "hidden");
    symlinkSync(outside, join(project.path, "escape"));

    const listing = await listProjectFiles(project, "");

    assert.equal(
      listing.entries.some((entry) => entry.name === "escape"),
      false
    );
    await assert.rejects(() => listProjectFiles(project, "escape"), /File path is outside project/);
  });

  test("shows sensitive files in listings but blocks preview content", async () => {
    const project = makeProject();
    writeFileSync(join(project.path, ".env.local"), "TOKEN=abc");
    writeFileSync(join(project.path, "api-secret.txt"), "secret");

    const listing = await listProjectFiles(project, "");
    const envEntry = listing.entries.find((entry) => entry.name === ".env.local");
    const secretEntry = listing.entries.find((entry) => entry.name === "api-secret.txt");
    assert.equal(envEntry?.sensitive, true);
    assert.equal(secretEntry?.sensitive, true);

    const preview = await previewProjectFile(project, ".env.local");
    assert.equal(preview.previewable, false);
    assert.equal(preview.sensitive, true);
    assert.equal(preview.reason, "sensitive");
    assert.equal(preview.content, "");
  });

  test("blocks preview for files under sensitive directories", async () => {
    const project = makeProject();
    mkdirSync(join(project.path, "secrets"));
    writeFileSync(join(project.path, "secrets", "config.txt"), "password=abc");

    const listing = await listProjectFiles(project, "");
    const secretsEntry = listing.entries.find((entry) => entry.name === "secrets");
    assert.equal(secretsEntry?.type, "directory");
    assert.equal(secretsEntry?.sensitive, true);

    const preview = await previewProjectFile(project, "secrets/config.txt");
    assert.equal(preview.previewable, false);
    assert.equal(preview.sensitive, true);
    assert.equal(preview.reason, "sensitive");
    assert.equal(preview.content, "");
  });

  test("rejects file symlinks that escape the project root", async () => {
    const project = makeProject();
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "tycho-project-files-outside-")));
    tempDirs.push(outside);
    const outsideFile = join(outside, "outside.txt");
    writeFileSync(outsideFile, "outside");
    symlinkSync(outsideFile, join(project.path, "link.txt"));

    const listing = await listProjectFiles(project, "");

    assert.equal(
      listing.entries.some((entry) => entry.name === "link.txt"),
      false
    );
    await assert.rejects(() => previewProjectFile(project, "link.txt"), /File path is outside project/);
  });

  test("previews text files and caps content at 256 KB", async () => {
    const project = makeProject();
    const content = "a".repeat(PROJECT_FILE_PREVIEW_LIMIT + 100);
    writeFileSync(join(project.path, "large.txt"), content);

    const preview = await previewProjectFile(project, "large.txt");

    assert.equal(preview.previewable, true);
    assert.equal(preview.truncated, true);
    assert.equal(preview.content.length, PROJECT_FILE_PREVIEW_LIMIT);
  });

  test("blocks binary preview", async () => {
    const project = makeProject();
    writeFileSync(join(project.path, "image.bin"), Buffer.from([0, 1, 2, 0, 3]));

    const preview = await previewProjectFile(project, "image.bin");

    assert.equal(preview.previewable, false);
    assert.equal(preview.reason, "binary");
    assert.equal(preview.content, "");
  });

  test("blocks binary preview without NUL bytes", async () => {
    const project = makeProject();
    writeFileSync(join(project.path, "invalid-utf8.bin"), Buffer.alloc(128, 0xff));

    const preview = await previewProjectFile(project, "invalid-utf8.bin");

    assert.equal(preview.previewable, false);
    assert.equal(preview.reason, "binary");
    assert.equal(preview.content, "");
  });

  test("blocks invalid UTF-8 bytes at the end of complete files", async () => {
    const project = makeProject();
    writeFileSync(join(project.path, "invalid-tail.bin"), Buffer.from([65, 66, 67, 0xff, 0xff]));

    const preview = await previewProjectFile(project, "invalid-tail.bin");

    assert.equal(preview.previewable, false);
    assert.equal(preview.reason, "binary");
    assert.equal(preview.content, "");
  });
});
