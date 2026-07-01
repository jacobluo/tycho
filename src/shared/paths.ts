import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = dirname(fileURLToPath(import.meta.url));

export const projectRoot = resolve(sourceDir, "..", "..");
export const tuimuxHome = join(projectRoot, ".tuimux");
export const xdgConfigHome = join(tuimuxHome, "config");
export const xdgStateHome = join(tuimuxHome, "state");
export const tuimuxConfigDir = join(xdgConfigHome, "tuimux");
export const tuimuxStateDir = join(xdgStateHome, "tuimux");
export const tuimuxLocalConfigPath = join(projectRoot, "tuimux.yaml");
export const tuimuxXdgConfigPath = join(tuimuxConfigDir, "tuimux.yaml");
export const tuimuxSocketPath = join(tuimuxStateDir, "tuimux.sock");
export const projectsDbPath = join(tuimuxHome, "tycho.sqlite");
export const tuimuxBinPath = join(projectRoot, "node_modules", "tuimux", "dist", "index.js");
export const clientDistDir = join(projectRoot, "dist", "client");
export const nodeModulesDir = join(projectRoot, "node_modules");
