import { open, readdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ProjectConfig } from "./config.js";

export const PROJECT_FILE_PREVIEW_LIMIT = 256 * 1024;
export const PROJECT_FILE_ENTRY_LIMIT = 1000;

export type ProjectFileEntry = {
  name: string;
  relativePath: string;
  type: "directory" | "file";
  size: number | null;
  modifiedAt: string | null;
  sensitive: boolean;
};

export type ProjectDirectoryListing = {
  projectId: string;
  projectName: string;
  currentPath: string;
  parentPath: string | null;
  entries: ProjectFileEntry[];
};

export type ProjectFilePreview = {
  projectId: string;
  relativePath: string;
  name: string;
  size: number;
  modifiedAt: string | null;
  sensitive: boolean;
  previewable: boolean;
  truncated: boolean;
  content: string;
  reason?: "sensitive" | "directory" | "binary" | "too-large" | "not-found";
};

type ResolvedProjectPath = {
  rootRealPath: string;
  requestedPath: string;
  realPath: string;
  relativePath: string;
};

const sensitiveSubstrings = ["secret", "token", "credential", "private", "key"];
const sensitiveExactNames = new Set([".ssh", ".npmrc", ".netrc", ".pypirc"]);
const allowedControlBytes = new Set([8, 9, 10, 12, 13, 27]);

function slashPath(path: string): string {
  return path.split(sep).filter(Boolean).join("/");
}

function pathSegments(path: string): string[] {
  return path.split(/[\\/]+/).filter(Boolean);
}

function isInsideRoot(rootRealPath: string, candidatePath: string): boolean {
  const child = relative(rootRealPath, candidatePath);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

function rejectAbsolutePath(requestedPath: string): void {
  if (requestedPath && isAbsolute(requestedPath)) {
    throw new Error("File path is outside project");
  }
}

async function projectRootRealPath(project: ProjectConfig): Promise<string> {
  return realpath(project.path);
}

async function resolveExistingProjectPath(project: ProjectConfig, requestedPath = ""): Promise<ResolvedProjectPath> {
  rejectAbsolutePath(requestedPath);
  const rootRealPath = await projectRootRealPath(project);
  const candidatePath = resolve(rootRealPath, requestedPath || ".");
  if (!isInsideRoot(rootRealPath, candidatePath)) {
    throw new Error("File path is outside project");
  }

  const realPath = await realpath(candidatePath);
  if (!isInsideRoot(rootRealPath, realPath)) {
    throw new Error("File path is outside project");
  }

  return {
    rootRealPath,
    requestedPath,
    realPath,
    relativePath: slashPath(relative(rootRealPath, realPath))
  };
}

async function resolveMaybeMissingProjectPath(project: ProjectConfig, requestedPath = ""): Promise<ResolvedProjectPath | null> {
  rejectAbsolutePath(requestedPath);
  const rootRealPath = await projectRootRealPath(project);
  const candidatePath = resolve(rootRealPath, requestedPath || ".");
  if (!isInsideRoot(rootRealPath, candidatePath)) {
    throw new Error("File path is outside project");
  }

  try {
    const realPath = await realpath(candidatePath);
    if (!isInsideRoot(rootRealPath, realPath)) {
      throw new Error("File path is outside project");
    }
    return {
      rootRealPath,
      requestedPath,
      realPath,
      relativePath: slashPath(relative(rootRealPath, realPath))
    };
  } catch (error) {
    if (error instanceof Error && error.message === "File path is outside project") {
      throw error;
    }
    return null;
  }
}

function parentPath(relativePath: string): string | null {
  if (!relativePath) {
    return null;
  }
  const parent = slashPath(dirname(relativePath));
  return parent === "." ? "" : parent;
}

function isSensitiveSegment(segment: string): boolean {
  const lower = segment.toLowerCase();
  return lower === ".env"
    || lower.startsWith(".env.")
    || lower.endsWith(".pem")
    || lower.endsWith(".p12")
    || sensitiveExactNames.has(lower)
    || sensitiveSubstrings.some((substring) => lower.includes(substring));
}

function isSensitivePath(relativePath: string): boolean {
  return pathSegments(relativePath).some(isSensitiveSegment);
}

function modifiedAt(stats: { mtime: Date }): string {
  return stats.mtime.toISOString();
}

function compareEntries(left: ProjectFileEntry, right: ProjectFileEntry): number {
  if (left.type !== right.type) {
    return left.type === "directory" ? -1 : 1;
  }
  return left.name.localeCompare(right.name);
}

function hasBinaryControlBytes(buffer: Buffer): boolean {
  let disallowed = 0;
  for (const byte of buffer) {
    if (byte === 0) {
      return true;
    }
    if (byte < 32 && !allowedControlBytes.has(byte)) {
      disallowed += 1;
    }
  }
  return disallowed > Math.max(8, buffer.length * 0.01);
}

function hasInvalidUtf8(buffer: Buffer, truncated: boolean): boolean {
  const sample = truncated ? buffer.subarray(0, Math.max(0, buffer.length - 4)) : buffer;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
  } catch {
    return true;
  }
  const decoded = new TextDecoder("utf-8").decode(sample);
  return decoded.includes("\uFFFD");
}

function isBinaryBuffer(buffer: Buffer, truncated: boolean): boolean {
  return hasBinaryControlBytes(buffer) || hasInvalidUtf8(buffer, truncated);
}

async function readPreviewBuffer(path: string, size: number): Promise<{ buffer: Buffer; truncated: boolean }> {
  const handle = await open(path, "r");
  try {
    const length = Math.min(size, PROJECT_FILE_PREVIEW_LIMIT + 1);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return {
      buffer: buffer.subarray(0, bytesRead),
      truncated: size > PROJECT_FILE_PREVIEW_LIMIT
    };
  } finally {
    await handle.close();
  }
}

export async function listProjectFiles(project: ProjectConfig, path = ""): Promise<ProjectDirectoryListing> {
  const resolved = await resolveExistingProjectPath(project, path);
  const directoryStats = await stat(resolved.realPath);
  if (!directoryStats.isDirectory()) {
    throw new Error("File path is not a directory");
  }

  const children = await readdir(resolved.realPath, { withFileTypes: true });
  const entries: ProjectFileEntry[] = [];

  for (const child of children) {
    const childPath = resolve(resolved.realPath, child.name);
    try {
      const childRealPath = await realpath(childPath);
      if (!isInsideRoot(resolved.rootRealPath, childRealPath)) {
        continue;
      }
      const childStats = await stat(childRealPath);
      if (!childStats.isDirectory() && !childStats.isFile()) {
        continue;
      }
      const relativePath = slashPath(relative(resolved.rootRealPath, childRealPath));
      entries.push({
        name: child.name,
        relativePath,
        type: childStats.isDirectory() ? "directory" : "file",
        size: childStats.isDirectory() ? null : childStats.size,
        modifiedAt: modifiedAt(childStats),
        sensitive: isSensitivePath(relativePath)
      });
    } catch {
      // Unreadable or unstable entries should disappear rather than fail the whole listing.
    }
  }

  return {
    projectId: project.id,
    projectName: project.name,
    currentPath: resolved.relativePath,
    parentPath: parentPath(resolved.relativePath),
    entries: entries.sort(compareEntries).slice(0, PROJECT_FILE_ENTRY_LIMIT)
  };
}

export async function previewProjectFile(project: ProjectConfig, path: string): Promise<ProjectFilePreview> {
  const resolved = await resolveMaybeMissingProjectPath(project, path);
  if (!resolved) {
    const relativePath = slashPath(path);
    return {
      projectId: project.id,
      relativePath,
      name: basename(relativePath) || project.name,
      size: 0,
      modifiedAt: null,
      sensitive: isSensitivePath(relativePath),
      previewable: false,
      truncated: false,
      content: "",
      reason: "not-found"
    };
  }

  const fileStats = await stat(resolved.realPath);
  const sensitive = isSensitivePath(resolved.relativePath);
  const basePreview = {
    projectId: project.id,
    relativePath: resolved.relativePath,
    name: basename(resolved.relativePath) || project.name,
    size: fileStats.size,
    modifiedAt: modifiedAt(fileStats),
    sensitive,
    truncated: false,
    content: ""
  };

  if (sensitive) {
    return { ...basePreview, previewable: false, reason: "sensitive" };
  }
  if (fileStats.isDirectory()) {
    return { ...basePreview, previewable: false, reason: "directory" };
  }
  if (!fileStats.isFile()) {
    return { ...basePreview, previewable: false, reason: "not-found" };
  }

  const { buffer, truncated } = await readPreviewBuffer(resolved.realPath, fileStats.size);
  if (isBinaryBuffer(buffer, truncated)) {
    return { ...basePreview, previewable: false, reason: "binary" };
  }

  const contentBuffer = buffer.subarray(0, Math.min(buffer.length, PROJECT_FILE_PREVIEW_LIMIT));
  const content = new TextDecoder("utf-8").decode(contentBuffer, { stream: truncated });
  return {
    ...basePreview,
    previewable: true,
    truncated,
    content
  };
}
