import { EventEmitter } from "node:events";
import { getWorkflowConfig } from "./config";
import { MissionLoop } from "./mission-loop";
import { Tracker } from "./tracker";
import type {
  AgentRecord,
  OrchestratorState,
  Task,
  TaskRunStatus,
} from "./types";

const FRONTEND_TASK_PATTERN = /ui|react|screen|component|style|layout|design|frontend/;
const BACKEND_TASK_PATTERN = /api|route|endpoint|db|database|schema|migration|backend|daemon|server/;
const QA_TASK_PATTERN = /review|qa|verify|test|check|audit/;
const PLANNING_TASK_PATTERN = /plan|decompose|spec|roadmap/;

export function getPreferredAgentId(taskName: string): string | null {
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

function isOnlineAgent(agent: AgentRecord): boolean {
  return agent.status === "online" || agent.status === "idle" || agent.status === "away";
}

export function selectAgent(task: Task, agents: AgentRecord[]): AgentRecord | null {
  if (task.agent_id) {
    return agents.find((agent) => agent.id === task.agent_id) ?? null;
  }

  const onlineAgents = agents.filter(isOnlineAgent);
  const preferredAgentId = getPreferredAgentId(task.name.toLowerCase());
  if (preferredAgentId) {
    const preferredAgent = onlineAgents.find((agent) => agent.id === preferredAgentId);
    if (preferredAgent) {
      return preferredAgent;
    }
  }

  if (task.suggested_agent_type) {
    const suggestedAgent = onlineAgents.find((agent) => agent.adapter_type === task.suggested_agent_type);
    if (suggestedAgent) {
      return suggestedAgent;
    }
  }

  return onlineAgents[0] ?? null;
}

export class Orchestrator extends EventEmitter {
  private readonly tracker: Tracker;
  private readonly missionLoop: MissionLoop;
  private autoApprove: boolean;
  readonly state: OrchestratorState;

  constructor(tracker: Tracker, missionLoop: MissionLoop) {
    super();
    this.tracker = tracker;
    this.missionLoop = missionLoop;
    const workflowConfig = getWorkflowConfig();
    this.autoApprove = workflowConfig.autoApprove;
    this.state = {
      pollIntervalMs: workflowConfig.pollIntervalMs,
      maxConcurrentAgents: workflowConfig.maxConcurrentAgents,
      providerConcurrency: {},
      running: new Map(),
      claimed: new Set(),
      retryAttempts: new Map(),
      completed: new Set(),
    };
  }

  start(): void {
    this.missionLoop.start();
  }

  stop(): void {
    this.missionLoop.stop();
  }

  setAutoApprove(enabled: boolean): void {
    this.autoApprove = enabled;
  }

  getAutoApprove(): boolean {
    return this.autoApprove;
  }

  async triggerTask(taskId: string): Promise<boolean> {
    const task = this.tracker.getTask(taskId);
    if (!task) {
      return false;
    }

    const mission = this.tracker.getMission(task.mission_id);
    if (!mission) {
      return false;
    }

    if (mission.status !== "running") {
      this.tracker.startMission(mission.id);
    }

    if (task.status === "paused" || task.status === "failed" || task.status === "stopped") {
      this.tracker.setTaskStatus(task.id, "pending");
    }

    this.missionLoop.clearRetry(task.id);
    this.tracker.refreshMissionTaskStatuses(task.mission_id);
    this.missionLoop.requestTick();
    return true;
  }

  async dispatchTaskRun(runId: string): Promise<boolean> {
    const taskRun = this.tracker.getTaskRun(runId);
    if (!taskRun) {
      return false;
    }

    const task = this.tracker.getTask(taskRun.task_id);
    if (!task) {
      return false;
    }

    this.tracker.updateTaskRun(runId, {
      status: "pending",
      completed_at: null,
      error: null,
      input_tokens: 0,
      output_tokens: 0,
      cost_cents: 0,
    });
    this.tracker.setTaskStatus(task.id, "pending");
    this.missionLoop.clearRetry(task.id);
    this.tracker.refreshMissionTaskStatuses(task.mission_id);
    this.missionLoop.requestTick();
    return true;
  }

  controlTaskRun(runId: string, action: "pause" | "stop"): boolean {
    void this.missionLoop.controlTaskRun(runId, action);

    const run = this.tracker.getTaskRun(runId);
    if (!run) {
      return false;
    }

    const nextStatus: Extract<TaskRunStatus, "paused" | "stopped"> =
      action === "pause" ? "paused" : "stopped";
    this.tracker.appendRunEvent(runId, "status", {
      status: nextStatus,
      message: `${action} requested`,
    });
    return true;
  }
}
