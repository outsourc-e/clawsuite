import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getWorkflowConfig } from "./config";
import { cleanupWorktree, getBaseBranch, getWorktreeBranch } from "./git-ops";
import type { Project, Task, WorkflowHooks, WorkspaceInfo } from "./types";

const execFileAsync = promisify(execFile);
export const BLOCKED_PATHS = ["/Users/aurora/.openclaw/workspace/clawsuite", process.cwd()];

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function normalizeAbsolutePath(value: string): string {
  return path.resolve(value.trim());
}

export function isBlockedProjectPath(projectPath: string): boolean {
  const candidate = normalizeAbsolutePath(projectPath);

  return BLOCKED_PATHS.some((blockedPath) => {
    const blocked = normalizeAbsolutePath(blockedPath);
    const relative = path.relative(blocked, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}

export function createSafeProjectPath(timestamp = Date.now()): string {
  return path.join("/tmp", `conductor-${timestamp}`);
}

export function resolveProjectPath(projectPath?: string | null, timestamp = Date.now()): string {
  const candidate = typeof projectPath === "string" && projectPath.trim().length > 0 ? normalizeAbsolutePath(projectPath) : null;
  if (candidate && !isBlockedProjectPath(candidate)) {
    return candidate;
  }

  const safePath = createSafeProjectPath(timestamp);
  if (!candidate) {
    console.warn(`[workspace] Missing project path, using safe fallback: ${safePath}`);
  } else {
    console.warn(`[workspace] Blocked project path "${candidate}" replaced with safe fallback: ${safePath}`);
  }
  return safePath;
}

async function runHooks(commands: string[] | undefined, cwd: string): Promise<void> {
  if (!commands || commands.length === 0) {
    return;
  }

  for (const command of commands) {
    await execFileAsync("zsh", ["-lc", command], { cwd });
  }
}

function hasGitDirectory(projectPath: string | null): boolean {
  if (!projectPath || !fs.existsSync(projectPath)) {
    return false;
  }

  return fs.existsSync(path.join(projectPath, ".git"));
}

function hasWorkspaceGitEntry(workspacePath: string): boolean {
  return fs.existsSync(path.join(workspacePath, ".git"));
}

export class WorkspaceManager {
  private async createGitWorktree(
    projectPath: string,
    workspacePath: string,
    runId: string,
    baseBranch: string,
  ): Promise<void> {
    await execFileAsync("git", ["worktree", "add", workspacePath, "-b", getWorktreeBranch(runId), baseBranch], {
      cwd: projectPath,
    });

    if (!hasWorkspaceGitEntry(workspacePath)) {
      throw new Error(`Git worktree creation succeeded but ${workspacePath} does not contain a .git entry`);
    }
  }

  async prepare(project: Project, task: Task, runId: string): Promise<WorkspaceInfo> {
    const isEphemeralProject = project.path?.startsWith("/tmp/conductor") ?? false;
    const projectPath = resolveProjectPath(project.path);
    const workflowConfig = getWorkflowConfig(projectPath);
    if (isEphemeralProject) {
      const createdNow = !fs.existsSync(projectPath);
      fs.mkdirSync(projectPath, { recursive: true });
      return {
        path: projectPath,
        createdNow,
        hooks: {},
        git_worktree: false,
      };
    }

    const projectKey = sanitizeSegment(project.name || project.id);
    const taskKey = sanitizeSegment(task.name || task.id);
    const workspacePath = path.join(workflowConfig.workspaceRoot, projectKey, `${task.id}-${taskKey}`);
    const createdNow = !fs.existsSync(workspacePath);

    fs.mkdirSync(path.dirname(workspacePath), { recursive: true });

    if (!hasGitDirectory(projectPath)) {
      throw new Error(`Cannot create workspace for task ${task.id}: project path is not a git repository`);
    }

    if (createdNow) {
      const baseBranch = await getBaseBranch(projectPath);
      await this.createGitWorktree(projectPath, workspacePath, runId, baseBranch);
      await execFileAsync("git", ["checkout", "HEAD", "--", "."], { cwd: workspacePath });
    } else if (!hasWorkspaceGitEntry(workspacePath)) {
      throw new Error(`Workspace path exists but is not a git worktree: ${workspacePath}`);
    }

    if (fs.existsSync(projectPath)) {
      const manifestPath = path.join(workspacePath, ".workspace-source");
      if (!fs.existsSync(manifestPath)) {
        fs.writeFileSync(manifestPath, `${projectPath}\n`, "utf8");
      }
    }

    if (createdNow) {
      await runHooks(workflowConfig.hooks.after_create, workspacePath);
    }

    return {
      path: workspacePath,
      createdNow,
      hooks: workflowConfig.hooks,
      git_worktree: true,
    };
  }

  async ensureWorkspace(project: Project, task: Task, runId: string): Promise<WorkspaceInfo> {
    return this.prepare(project, task, runId);
  }

  async cleanup(project: Project, task: Task, runId: string): Promise<void> {
    const projectPath = typeof project.path === "string" && project.path.trim().length > 0 ? resolveProjectPath(project.path) : null;
    if (!projectPath || !fs.existsSync(projectPath)) {
      return;
    }

    const workflowConfig = getWorkflowConfig(projectPath);
    const projectKey = sanitizeSegment(project.name || project.id);
    const taskKey = sanitizeSegment(task.name || task.id);
    const workspacePath = path.join(workflowConfig.workspaceRoot, projectKey, `${task.id}-${taskKey}`);

    await cleanupWorktree(projectPath, workspacePath, getWorktreeBranch(runId));
  }

  async runBeforeRunHooks(workspacePath: string, hooks: WorkflowHooks): Promise<void> {
    await runHooks(hooks.before_run, workspacePath);
  }

  async runAfterRunHooks(workspacePath: string, hooks: WorkflowHooks): Promise<void> {
    await runHooks(hooks.after_run, workspacePath);
  }
}
