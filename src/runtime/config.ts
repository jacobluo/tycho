import { mkdir, writeFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import { stringify } from "yaml";
import {
  projectRoot,
  tuimuxConfigDir,
  tuimuxLocalConfigPath,
  tuimuxStateDir,
  tuimuxXdgConfigPath
} from "../shared/paths.js";

export const CODEBUDDY_APP_ID = "codebuddy";

export type AgentId = "codebuddy" | "codex" | "claude";

export type AgentEntry = {
  id: string;
  name: string;
  command: string;
  args?: string;
  cwd: string;
  autostart: boolean;
  restart_on_exit: boolean;
  env?: Record<string, string>;
};

export type ProjectConfig = {
  id: string;
  name: string;
  path: string;
};

export type RuntimeConfig = {
  agents: AgentEntry[];
  projects: ProjectConfig[];
  defaultProjectId: string;
  webPort: number;
};

function envCommand(agent: AgentId, fallback: string): string {
  return process.env[`${agent.toUpperCase()}_CMD`] || fallback;
}

function envArgs(agent: AgentId): string | undefined {
  return process.env[`${agent.toUpperCase()}_ARGS`] || undefined;
}

function buildAgent(agent: AgentId, name: string, fallbackCommand: string): AgentEntry {
  return {
    id: agent,
    name,
    command: envCommand(agent, fallbackCommand),
    args: envArgs(agent),
    cwd: projectRoot,
    autostart: false,
    restart_on_exit: false
  };
}

function slugifyProjectId(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}

function readProjects(): ProjectConfig[] {
  let projects: ProjectConfig[];
  const fromJson = process.env.PROJECTS_JSON;
  if (fromJson) {
    const parsed = JSON.parse(fromJson) as Array<Partial<ProjectConfig>>;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("PROJECTS_JSON must be a non-empty JSON array");
    }
    projects = parsed.map((project, index) => {
      if (!project.path) {
        throw new Error(`PROJECTS_JSON[${index}].path is required`);
      }
      const name = project.name || project.path.split("/").filter(Boolean).at(-1) || `Project ${index + 1}`;
      return {
        id: project.id || slugifyProjectId(name),
        name,
        path: resolve(project.path)
      };
    });
  } else if (process.env.PROJECT_DIRS) {
    const projectDirs = process.env.PROJECT_DIRS;
    const paths = projectDirs.split(delimiter).map((path) => path.trim()).filter(Boolean);
    if (paths.length === 0) {
      throw new Error("PROJECT_DIRS did not contain any project directories");
    }
    projects = paths.map((path, index) => {
      const name = path.split("/").filter(Boolean).at(-1) || `Project ${index + 1}`;
      return {
        id: slugifyProjectId(name),
        name,
        path: resolve(path)
      };
    });
  } else {
    const fallbackPath = process.env.AGENT_WORKDIR || process.env.CODEBUDDY_WORKDIR || projectRoot;
    const fallbackName = fallbackPath.split("/").filter(Boolean).at(-1) || "Current Project";
    projects = [
      {
        id: slugifyProjectId(fallbackName),
        name: fallbackName,
        path: resolve(fallbackPath)
      }
    ];
  }

  const ids = new Set<string>();
  for (const project of projects) {
    if (ids.has(project.id)) {
      throw new Error(`Duplicate project id: ${project.id}`);
    }
    ids.add(project.id);
    if (!statSync(project.path).isDirectory()) {
      throw new Error(`Project path is not a directory: ${project.path}`);
    }
  }

  return projects;
}

export function readRuntimeConfig(): RuntimeConfig {
  const projects = readProjects();
  const defaultProjectId = process.env.DEFAULT_PROJECT_ID || projects[0].id;
  const defaultProject = projects.find((project) => project.id === defaultProjectId) || projects[0];
  const agents = [
    buildAgent("codebuddy", process.env.CODEBUDDY_NAME || "CodeBuddy", "codebuddy"),
    buildAgent("codex", process.env.CODEX_NAME || "Codex", "codex"),
    buildAgent("claude", process.env.CLAUDE_NAME || "Claude", "claude")
  ].map((agent) => ({ ...agent, cwd: defaultProject.path }));

  if (process.env.CODEBUDDY_API_BASE || process.env.CODEBUDDY_TOKEN) {
    const codebuddy = agents.find((agent) => agent.id === CODEBUDDY_APP_ID);
    if (codebuddy) {
      codebuddy.env = {};
      if (process.env.CODEBUDDY_API_BASE) {
        codebuddy.env.CODEBUDDY_API_BASE = process.env.CODEBUDDY_API_BASE;
      }
      if (process.env.CODEBUDDY_TOKEN) {
        codebuddy.env.CODEBUDDY_TOKEN = process.env.CODEBUDDY_TOKEN;
      }
    }
  }

  for (const agent of agents) {
    const envPrefix = agent.id.toUpperCase();
    const extraEnv = process.env[`${envPrefix}_ENV_JSON`];
    if (!extraEnv) {
      continue;
    }
    try {
      agent.env = { ...agent.env, ...JSON.parse(extraEnv) };
    } catch {
      throw new Error(`${envPrefix}_ENV_JSON must be a JSON object`);
    }
  }

  return {
    agents,
    projects,
    defaultProjectId: defaultProject.id,
    webPort: Number(process.env.PORT || 3107)
  };
}

export function createSessionEntry(agent: AgentEntry, project: ProjectConfig, label?: string): AgentEntry {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const sessionName = label?.trim() || `${agent.name} · ${project.name} ${now.toLocaleTimeString()}`;

  return {
    ...agent,
    id: `${agent.id}-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
    name: sessionName,
    cwd: project.path,
    autostart: false,
    restart_on_exit: false,
    env: {
      ...agent.env,
      REMOTE_TUI_PROJECT_ID: project.id,
      REMOTE_TUI_PROJECT_NAME: project.name,
      REMOTE_TUI_PROJECT_PATH: project.path
    }
  };
}

export function getAgent(agentId: string, runtime = readRuntimeConfig()): AgentEntry {
  const agent = runtime.agents.find((candidate) => candidate.id === agentId);
  if (!agent) {
    throw new Error(`Unknown agent: ${agentId}`);
  }
  return agent;
}

export function getProject(projectId: string | undefined, runtime = readRuntimeConfig()): ProjectConfig {
  const id = projectId || runtime.defaultProjectId;
  const project = runtime.projects.find((candidate) => candidate.id === id);
  if (!project) {
    throw new Error(`Unknown project: ${id}`);
  }
  return project;
}

export function getPublicRuntimeConfig(runtime = readRuntimeConfig()) {
  return {
    agents: runtime.agents.map(({ id, name, command, args, cwd }) => ({
      id,
      name,
      command,
      args,
      cwd
    })),
    projects: runtime.projects,
    defaultProjectId: runtime.defaultProjectId,
    webPort: runtime.webPort
  };
}

export async function writeTuimuxConfig(runtime = readRuntimeConfig()): Promise<void> {
  await mkdir(tuimuxConfigDir, { recursive: true });
  await mkdir(tuimuxStateDir, { recursive: true });

  const config = {
    version: 2,
    layout: "panes",
    sidebar_position: "left",
    focus_on_launch: true,
    onboarding_completed: true,
    session: {
      persist: true
    },
    apps: runtime.agents
  };

  const yaml = stringify(config);
  await writeFile(tuimuxLocalConfigPath, yaml, "utf8");
  await writeFile(tuimuxXdgConfigPath, yaml, "utf8");
}
