import { readdir, realpath, stat } from "node:fs/promises";
import { basename, delimiter, dirname, isAbsolute, relative, resolve } from "node:path";
import { projectRoot } from "../shared/paths.js";

export type DirectoryBrowserEntry = {
  name: string;
  path: string;
};

export type DirectoryBrowserResponse = {
  roots: DirectoryBrowserEntry[];
  currentPath: string | null;
  parentPath: string | null;
  entries: DirectoryBrowserEntry[];
};

export const DIRECTORY_BROWSER_ENTRY_LIMIT = 500;

function entryName(path: string): string {
  return basename(path) || path;
}

function isInsideRoot(path: string, root: string): boolean {
  const child = relative(root, path);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

function isInsideAnyRoot(path: string, roots: DirectoryBrowserEntry[]): boolean {
  return roots.some((root) => isInsideRoot(path, root.path));
}

async function realDirectory(path: string, notFoundMessage = `Directory path not found: ${path}`): Promise<string> {
  let real: string;
  try {
    real = await realpath(resolve(path));
  } catch {
    throw new Error(notFoundMessage);
  }

  const stats = await stat(real);
  if (!stats.isDirectory()) {
    throw new Error(`Directory path is not a directory: ${real}`);
  }
  return real;
}

export async function resolveDirectoryBrowserRoots(): Promise<DirectoryBrowserEntry[]> {
  const configuredRoots = process.env.PROJECT_BROWSER_ROOTS?.split(delimiter).map((path) => path.trim()).filter(Boolean) ?? [];
  const candidateRoots = configuredRoots.length > 0
    ? configuredRoots
    : process.env.NODE_ENV === "production"
      ? []
      : [process.env.HOME || projectRoot];

  const roots: DirectoryBrowserEntry[] = [];
  for (const candidate of candidateRoots) {
    try {
      const path = await realDirectory(candidate);
      roots.push({ name: entryName(path), path });
    } catch {
      // Invalid configured roots are unavailable rather than browser-visible.
    }
  }
  return roots;
}

async function parentWithinRoots(path: string, roots: DirectoryBrowserEntry[]): Promise<string | null> {
  const parent = dirname(path);
  if (parent === path) {
    return null;
  }
  try {
    const realParent = await realDirectory(parent);
    return isInsideAnyRoot(realParent, roots) ? realParent : null;
  } catch {
    return null;
  }
}

async function readChildDirectories(path: string, roots: DirectoryBrowserEntry[]): Promise<DirectoryBrowserEntry[]> {
  const children = await readdir(path, { withFileTypes: true });
  const entries: DirectoryBrowserEntry[] = [];

  for (const child of children) {
    if (!child.isDirectory()) {
      continue;
    }
    const childPath = resolve(path, child.name);
    try {
      const realChild = await realDirectory(childPath);
      if (isInsideAnyRoot(realChild, roots)) {
        entries.push({ name: child.name, path: realChild });
      }
    } catch {
      // Unreadable or unstable children should not fail the whole directory listing.
    }
  }

  return entries
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, DIRECTORY_BROWSER_ENTRY_LIMIT);
}

export async function listDirectories(requestedPath?: string): Promise<DirectoryBrowserResponse> {
  const roots = await resolveDirectoryBrowserRoots();
  if (!requestedPath) {
    return {
      roots,
      currentPath: null,
      parentPath: null,
      entries: roots
    };
  }

  const currentPath = await realDirectory(requestedPath);
  if (!isInsideAnyRoot(currentPath, roots)) {
    throw new Error(`Directory path is outside configured roots: ${currentPath}`);
  }

  return {
    roots,
    currentPath,
    parentPath: await parentWithinRoots(currentPath, roots),
    entries: await readChildDirectories(currentPath, roots)
  };
}
