import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { buildCheckpoint } from "./checkpoint-builder";
import { OpenClawClient, type SessionStatus } from "./openclaw-client";
import { QARunner } from "./qa-runner";
import { Tracker } from "./tracker";
import type { AgentRecord, Project, Task, TaskRun, TaskWithRelations } from "./types";
import { resolveProjectPath, WorkspaceManager } from "./workspace";

const execFileAsync = promisify(execFile);

const FRONTEND_TASK_PATTERN = /ui|react|screen|component|style|layout|design|frontend/;
const BACKEND_TASK_PATTERN = /api|route|endpoint|db|database|schema|migration|backend|daemon|server/;
const QA_TASK_PATTERN = /review|qa|verify|test|check|audit/;
const PLANNING_TASK_PATTERN = /plan|decompose|spec|roadmap/;

export interface MissionLoopConfig {
  pollIntervalMs: number;
  sessionTimeoutMs: number;
  maxRetries: number;
  retryBaseMs: number;
  qualityThreshold: number;
  overseerEnabled: boolean;
  overseerAgentId?: string;
}

type RetryState = {
  attempt: number;
  dueAtMs: number;
  error: string | null;
};

type SessionState = {
  lastMessage?: string;
};

const DEFAULT_CONFIG: MissionLoopConfig = {
  pollIntervalMs: 5_000,
  sessionTimeoutMs: 10 * 60 * 1_000,
  maxRetries: 3,
  retryBaseMs: 10_000,
  qualityThreshold: 0.85,
  overseerEnabled: false,
};

function delayForAttempt(baseMs: number, attempt: number): number {
  return baseMs * 2 ** Math.max(attempt - 1, 0);
}

function parseSqliteDate(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getPreferredAgentId(taskName: string): string | null {
  if (FRONTEND_TASK_PATTERN.test(taskName)) {
    return "aurora-coder";
  }

  if (BACKEND_TASK_PATTERN.test(taskName)) {
    return "aurora-daemon";
  }

  if (QA_TASK_PATTERN.test(taskName)) {
    return "aurora-qa";
  }

  if (PLANNING_TASK_PATTERN.test(taskName)) {
    return "aurora-planner";
  }

  return null;
}

function isRunnableAgent(agent: AgentRecord): boolean {
  return agent.status === "online" || agent.status === "idle" || agent.status === "away";
}

function safeTrim(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class MissionLoop {
  private readonly tracker: Tracker;
  private readonly openclawClient: OpenClawClient;
  private readonly workspaceManager: WorkspaceManager;
  private readonly qaRunner: QARunner;
  private readonly config: MissionLoopConfig;
  private readonly retries = new Map<string, RetryState>();
  private readonly sessions = new Map<string, SessionState>();
  private timer: NodeJS.Timeout | null = null;
  private runningTick = false;
  private pendingImmediateTick = false;

  constructor(
    tracker: Tracker,
    openclawClient: OpenClawClient,
    config?: Partial<MissionLoopConfig>,
  ) {
    this.tracker = tracker;
    this.openclawClient = openclawClient;
    this.workspaceManager = new WorkspaceManager();
    this.qaRunner = new QARunner();
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.runTick();
    }, this.config.pollIntervalMs);
    this.requestTick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  requestTick(): void {
    if (this.runningTick) {
      this.pendingImmediateTick = true;
      return;
    }

    void this.runTick();
  }

  clearRetry(taskId: string): void {
    this.retries.delete(taskId);
  }

  async controlTaskRun(
    runId: string,
    action: "pause" | "stop",
  ): Promise<boolean> {
    const run = this.tracker.getTaskRun(runId);
    if (!run || run.status !== "running" || !run.session_id) {
      return false;
    }

    const message =
      action === "pause"
        ? "Pause work and wait for further instructions."
        : "Stop work now and exit without making more changes.";

    try {
      await this.openclawClient.sendMessage(run.session_id, message);
    } catch {
      return false;
    }

    this.tracker.appendRunEvent(run.id, "status", {
      status: action === "pause" ? "paused" : "stopped",
      message: `Control request sent to session ${run.session_id}`,
    });
    return true;
  }

  private async runTick(): Promise<void> {
    if (this.runningTick) {
      this.pendingImmediateTick = true;
      return;
    }

    this.runningTick = true;
    try {
      await this.processRetries();
      await this.processRunningSessions();
      await this.processReadyTasks();
    } finally {
      this.runningTick = false;
      if (this.pendingImmediateTick) {
        this.pendingImmediateTick = false;
        void this.runTick();
      }
    }
  }

  private async processRetries(): Promise<void> {
    const now = Date.now();

    for (const [taskId, retry] of this.retries) {
      if (retry.dueAtMs > now) {
        continue;
      }

      const task = this.tracker.getTask(taskId);
      if (!task) {
        this.retries.delete(taskId);
        continue;
      }

      const mission = this.tracker.getMission(task.mission_id);
      if (!mission || mission.status !== "running") {
        continue;
      }

      this.tracker.createPendingTaskRun(
        task.id,
        task.agent_id,
        null,
        retry.attempt,
      );
      this.tracker.setTaskStatus(task.id, "pending");
      this.tracker.refreshMissionTaskStatuses(task.mission_id);
      this.retries.delete(taskId);
    }
  }

  private async processRunningSessions(): Promise<void> {
    const runningRuns = this.tracker.getRunningTaskRuns();

    for (const run of runningRuns) {
      if (!run.session_id) {
        continue;
      }

      const approvalContext = this.tracker.getTaskRunApprovalContext(run.id);
      if (!approvalContext) {
        continue;
      }

      const task = this.tracker.getTask(approvalContext.task_id);
      if (!task) {
        continue;
      }

      try {
        if (this.isTimedOut(run)) {
          await this.failRun(run, task, "Session timed out");
          continue;
        }

        const status = await this.openclawClient.getSessionStatus(run.session_id);
        this.captureSessionOutput(run.id, status);

        if (status.status === "running" || status.status === "unknown") {
          continue;
        }

        if (status.status === "completed") {
          await this.completeRun(
            run,
            task,
            approvalContext.project_id,
            approvalContext.project_name,
            approvalContext.project_path,
            status,
          );
          continue;
        }

        const failureReason =
          safeTrim(status.lastMessage) ??
          (status.status === "timeout" ? "Session timed out" : "OpenClaw session failed");
        await this.failRun(run, task, failureReason);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Mission loop polling failed";
        await this.failRun(run, task, message);
      }
    }
  }

  private async processReadyTasks(): Promise<void> {
    const runningMissions = this.tracker.listMissions({ status: "running" });
    if (runningMissions.length === 0) {
      return;
    }

    this.tracker.refreshReadyTasks();

    const tasks = this.tracker.listTasks({});
    const liveRuns = this.tracker.getRunningTaskRuns();
    const runningByProject = new Map<string, number>();
    const taskById = new Map(tasks.map((task) => [task.id, task] as const));

    for (const run of liveRuns) {
      const task = taskById.get(run.task_id);
      if (!task) {
        continue;
      }
      runningByProject.set(
        task.project_id,
        (runningByProject.get(task.project_id) ?? 0) + 1,
      );
    }

    for (const mission of runningMissions) {
      const project = this.tracker.getProject(mission.project_id);
      if (!project) {
        continue;
      }

      const readyTasks = tasks
        .filter((task) => task.mission_id === mission.id && task.status === "ready")
        .sort((left, right) => {
          if (left.sort_order !== right.sort_order) {
            return left.sort_order - right.sort_order;
          }
          return left.created_at.localeCompare(right.created_at);
        });

      let availableSlots = Math.max(
        project.max_concurrent - (runningByProject.get(project.id) ?? 0),
        0,
      );

      for (const task of readyTasks) {
        if (availableSlots <= 0) {
          break;
        }

        const hasLiveRun = this.tracker
          .listTaskRuns({ taskId: task.id })
          .some((run) => run.status === "running" && run.session_id);
        if (hasLiveRun) {
          continue;
        }

        const started = await this.startTask(project, task);
        if (!started) {
          continue;
        }

        availableSlots -= 1;
        runningByProject.set(
          project.id,
          (runningByProject.get(project.id) ?? 0) + 1,
        );
      }
    }
  }

  private async startTask(project: Project, task: TaskWithRelations): Promise<boolean> {
    const agent = this.selectAgent(task);
    if (!agent) {
      this.tracker.setTaskStatus(task.id, "failed");
      return false;
    }

    const pendingRun = this.getPendingRun(task.id);
    const attempt = pendingRun?.attempt ?? 1;
    const taskRun =
      pendingRun ??
      this.tracker.createPendingTaskRun(task.id, agent.id, null, attempt);

    try {
      this.clearRetry(task.id);
      const workspace = await this.workspaceManager.ensureWorkspace(project, task, taskRun.id);
      this.tracker.updateTaskRunWorkspacePath(taskRun.id, workspace.path);

      const prompt = await this.buildTaskPrompt(project, task, agent, workspace.path);
      const session = await this.openclawClient.spawnSession({
        task: prompt,
        agentId: agent.id,
        model: agent.model ?? undefined,
        label: `${project.name}: ${task.name}`,
        cwd: workspace.path,
        runTimeoutSeconds: Math.ceil(this.config.sessionTimeoutMs / 1_000),
      });

      if (!safeTrim(session.sessionKey)) {
        throw new Error("OpenClaw returned an empty session key");
      }

      this.tracker.setTaskRunSessionId(taskRun.id, session.sessionKey);
      this.tracker.updateTaskRun(taskRun.id, {
        status: "running",
        completed_at: null,
        error: null,
        input_tokens: 0,
        output_tokens: 0,
        cost_cents: 0,
      });
      this.tracker.markTaskRunStarted(taskRun.id);
      this.tracker.setTaskStatus(task.id, "running");
      this.tracker.setAgentStatus(agent.id, "running");
      this.tracker.logAuditEvent("task.started", taskRun.id, "task_run", {
        agent_id: agent.id,
        session_id: session.sessionKey,
      });
      this.tracker.appendRunEvent(taskRun.id, "started", {
        session_id: session.sessionKey,
        workspace_path: workspace.path,
      });
      this.sessions.set(taskRun.id, {});
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start task";
      this.tracker.failTaskRun(taskRun.id, message);
      this.tracker.setTaskStatus(task.id, "failed");
      this.tracker.setAgentStatus(agent.id, "idle");
      this.tracker.logAuditEvent("task.failed", taskRun.id, "task_run", {
        reason: message,
      });
      this.scheduleRetry(task, taskRun.attempt, message);
      return false;
    }
  }

  private async completeRun(
    run: TaskRun,
    task: Task,
    projectId: string,
    projectName: string,
    projectPath: string | null,
    status: SessionStatus,
  ): Promise<void> {
    const workspacePath = safeTrim(run.workspace_path);
    if (!workspacePath) {
      await this.failRun(run, task, "Task run completed without a workspace path");
      return;
    }

    const resolvedProjectPath = safeTrim(projectPath)
      ? resolveProjectPath(projectPath)
      : null;
    const checkpoint = await buildCheckpoint(
      workspacePath,
      resolvedProjectPath,
      projectName,
      task.name,
      run.id,
      this.tracker,
      false,
    );

    const qaResult = await this.qaRunner.runQA(
      checkpoint.raw_diff ?? "",
      workspacePath,
      checkpoint.id,
    );
    const latestCheckpoint =
      this.tracker.setCheckpointQaResult(checkpoint.id, qaResult) ?? checkpoint;

    this.tracker.completeTaskRun(run.id, {
      status: latestCheckpoint.status === "approved" ? "completed" : "awaiting_review",
      error: null,
      input_tokens: 0,
      output_tokens: status.totalTokens ?? 0,
      cost_cents: 0,
    });
    this.tracker.logAuditEvent("task.completed", run.id, "task_run", {
      qa_verdict: qaResult.verdict,
      qa_confidence: qaResult.confidence,
      checkpoint_id: checkpoint.id,
    });

    const project = this.tracker.getProject(projectId);
    const autoApproveEnabled = Number(project?.auto_approve ?? 0) === 1;
    if (
      latestCheckpoint.status !== "approved" &&
      autoApproveEnabled &&
      qaResult.verdict === "APPROVED" &&
      qaResult.confidence >= this.config.qualityThreshold
    ) {
      this.tracker.approveCheckpoint(
        latestCheckpoint.id,
        qaResult.issues.length > 0 ? qaResult.issues.join("\n") : undefined,
      );
    }

    const taskRun = this.tracker.getTaskRun(run.id);
    if (taskRun?.status === "completed") {
      this.tracker.setTaskStatus(task.id, "completed");
    }

    const agentId = safeTrim(run.agent_id) ?? safeTrim(task.agent_id);
    if (agentId) {
      this.tracker.setAgentStatus(agentId, "idle");
    }
    this.sessions.delete(run.id);
  }

  private async failRun(run: TaskRun, task: Task, error: string): Promise<void> {
    this.tracker.failTaskRun(run.id, error);
    this.tracker.setTaskStatus(task.id, "failed");
    this.tracker.logAuditEvent("task.failed", run.id, "task_run", {
      reason: error,
    });

    const agentId = safeTrim(run.agent_id) ?? safeTrim(task.agent_id);
    if (agentId) {
      this.tracker.setAgentStatus(agentId, "idle");
    }

    this.sessions.delete(run.id);
    this.scheduleRetry(task, run.attempt, error);
  }

  private scheduleRetry(task: Task, attempt: number, error: string | null): void {
    if (attempt >= this.config.maxRetries) {
      if (this.config.overseerEnabled && this.config.overseerAgentId) {
        void this.openclawClient.systemEvent(
          `Mission loop failed task "${task.name}" after ${attempt} attempts: ${error ?? "Unknown error"}`,
        ).catch(() => undefined);
      }
      return;
    }

    this.retries.set(task.id, {
      attempt: attempt + 1,
      dueAtMs: Date.now() + delayForAttempt(this.config.retryBaseMs, attempt),
      error,
    });
  }

  private getPendingRun(taskId: string): TaskRun | null {
    const runs = this.tracker.listTaskRuns({ taskId });
    return (
      runs.find(
        (run) =>
          run.status === "pending" &&
          run.completed_at === null &&
          run.session_id === null,
      ) ?? null
    );
  }

  private selectAgent(task: Task): AgentRecord | null {
    if (task.agent_id) {
      return this.tracker.getAgent(task.agent_id);
    }

    const agents = this.tracker.listAgents().filter(isRunnableAgent);
    if (agents.length === 0) {
      return null;
    }

    const preferredId =
      safeTrim(task.agent_type) ??
      getPreferredAgentId(task.name.toLowerCase()) ??
      task.suggested_agent_type ??
      null;

    if (preferredId) {
      const preferredAgent =
        agents.find((agent) => agent.id === preferredId) ??
        agents.find((agent) => agent.adapter_type === preferredId);
      if (preferredAgent) {
        return preferredAgent;
      }
    }

    return agents[0] ?? null;
  }

  private async buildTaskPrompt(
    project: Project,
    task: Task,
    agent: AgentRecord,
    workspacePath: string,
  ): Promise<string> {
    const projectPath = safeTrim(project.path);
    const gitLog = projectPath ? await this.readGitLog(resolveProjectPath(projectPath)) : null;
    const roleContext = safeTrim(agent.system_prompt) ?? this.getAgentRoleContext(task, agent);

    return [
      `IDENTITY: ${agent.id}`,
      roleContext,
      "",
      "## Project",
      `Name: ${project.name}`,
      `Workspace: ${workspacePath}`,
      project.spec ? `Spec:\n${project.spec}` : "",
      gitLog ? `Recent git log:\n${gitLog}` : "",
      "",
      "## Task",
      `Name: ${task.name}`,
      task.description ? `Description:\n${task.description}` : "",
      "",
      "## Requirements",
      "- Work directly in the provided workspace.",
      "- Finish the task end-to-end and leave the repo in a reviewable state.",
      "- Run focused verification where appropriate and summarize any failures.",
      "- Do not wait for more instructions unless blocked.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async readGitLog(projectPath: string): Promise<string | null> {
    if (!existsSync(projectPath)) {
      return null;
    }

    try {
      const { stdout } = await execFileAsync(
        "git",
        ["log", "--oneline", "-5"],
        { cwd: projectPath, timeout: 10_000 },
      );
      const trimmed = stdout.trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      return null;
    }
  }

  private getAgentRoleContext(task: Task, agent: AgentRecord): string {
    const requestedType = safeTrim(task.agent_type) ?? agent.role;

    switch (requestedType) {
      case "frontend":
      case "aurora-coder":
        return "ROLE: Frontend implementation specialist. Focus on React, Tailwind, and workspace UI changes.";
      case "backend":
      case "aurora-daemon":
        return "ROLE: Backend implementation specialist. Focus on the workspace daemon, tracker, routes, and database correctness.";
      case "reviewer":
      case "aurora-qa":
        return "ROLE: QA and verification specialist. Review changes for regressions, correctness, and missing tests.";
      case "planner":
      case "aurora-planner":
        return "ROLE: Planning specialist. Break work into precise implementation steps.";
      default:
        return `ROLE: ${agent.role || "Implementation specialist"}.`;
    }
  }

  private captureSessionOutput(runId: string, status: SessionStatus): void {
    const message = safeTrim(status.lastMessage);
    if (!message) {
      return;
    }

    const sessionState = this.sessions.get(runId) ?? {};
    if (sessionState.lastMessage === message) {
      return;
    }

    sessionState.lastMessage = message;
    this.sessions.set(runId, sessionState);
    this.tracker.appendRunEvent(runId, "output", { message });
  }

  private isTimedOut(run: TaskRun): boolean {
    const startedAt = parseSqliteDate(run.started_at);
    if (!startedAt) {
      return false;
    }

    return Date.now() - startedAt > this.config.sessionTimeoutMs;
  }
}
