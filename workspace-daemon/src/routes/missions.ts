import { Router } from "express";
import { Tracker } from "../tracker";
import type { Mission } from "../types";

function parseEventData(data: string | null): Record<string, unknown> | null {
  if (!data) {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const MISSION_STATUSES: Mission["status"][] = [
  "pending",
  "decomposing",
  "ready",
  "running",
  "reviewing",
  "revising",
  "paused",
  "completed",
  "failed",
  "stopped",
];

function isMissionStatus(value: string): value is Mission["status"] {
  return (MISSION_STATUSES as readonly string[]).includes(value);
}

export function createMissionsRouter(tracker: Tracker): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const phaseId =
      typeof req.query.phase_id === "string" && req.query.phase_id.trim().length > 0
        ? req.query.phase_id.trim()
        : undefined;
    const projectId =
      typeof req.query.project_id === "string" && req.query.project_id.trim().length > 0
        ? req.query.project_id.trim()
        : undefined;
    const statusValue =
      typeof req.query.status === "string" && req.query.status.trim().length > 0
        ? req.query.status.trim()
        : undefined;
    const status = statusValue && isMissionStatus(statusValue) ? statusValue : undefined;

    res.json(
      tracker.listMissions({
        phase_id: phaseId,
        project_id: projectId,
        status,
      }),
    );
  });

  router.post("/", (req, res) => {
    const { phase_id, name } = req.body as {
      phase_id?: string;
      name?: string;
    };

    if (!phase_id || !name || name.trim().length === 0) {
      res.status(400).json({ error: "phase_id and name are required" });
      return;
    }

    if (!tracker.getPhase(phase_id)) {
      res.status(404).json({ error: "Phase not found" });
      return;
    }

    const mission = tracker.createMission({
      phase_id,
      name: name.trim(),
    });
    res.status(201).json(mission);
  });

  router.get("/:id/status", (req, res) => {
    const status = tracker.getMissionStatus(req.params.id);
    if (!status) {
      res.status(404).json({ error: "Mission not found" });
      return;
    }
    res.json(status);
  });

  router.get("/:id/live", (req, res) => {
    const mission = tracker.getMission(req.params.id);
    if (!mission) {
      res.status(404).json({ error: "Mission not found" });
      return;
    }

    const status = tracker.getMissionStatus(req.params.id);
    if (!status) {
      res.status(500).json({ error: "Internal error" });
      return;
    }

    const tasks = tracker.listTasks({ mission_id: req.params.id });
    const taskIds = new Set(tasks.map((task) => task.id));
    const activeRuns = tracker
      .listTaskRuns({})
      .filter(
        (run) =>
          taskIds.has(run.task_id) &&
          (run.status === "pending" ||
            run.status === "running" ||
            run.status === "awaiting_review" ||
            run.status === "paused"),
      )
      .map((run) => ({
        ...run,
        session: run.session_id
          ? {
              session_id: run.session_id,
              workspace_path: run.workspace_path,
              started_at: run.started_at,
            }
          : null,
        recent_events: tracker.listRunEvents(run.id).slice(-5).map((event) => ({
          ...event,
          data: parseEventData(event.data),
        })),
      }));

    res.json({
      mission: status.mission,
      task_breakdown: status.task_breakdown,
      tasks,
      active_runs: activeRuns,
    });
  });

  router.post("/:id/start", (req, res) => {
    const ok = tracker.startMission(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Mission not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/:id/pause", (req, res) => {
    const ok = tracker.pauseMission(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Mission not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/:id/resume", (req, res) => {
    const ok = tracker.resumeMission(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Mission not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/:id/stop", (req, res) => {
    const ok = tracker.stopMission(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Mission not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.patch("/:id/status", (req, res) => {
    const nextStatus =
      typeof req.body?.status === "string" ? req.body.status.trim() : "";
    if (!isMissionStatus(nextStatus)) {
      res.status(400).json({ error: "Invalid mission status" });
      return;
    }

    const mission = tracker.getMission(req.params.id);
    if (!mission) {
      res.status(404).json({ error: "Mission not found" });
      return;
    }

    if (!tracker.canTransitionMissionStatus(mission.status, nextStatus)) {
      res.status(400).json({
        error: `Invalid mission transition: ${mission.status} -> ${nextStatus}`,
      });
      return;
    }

    const updated = tracker.updateMissionLifecycleStatus(req.params.id, nextStatus);
    if (!updated) {
      res.status(500).json({ error: "Internal error" });
      return;
    }

    res.json(updated);
  });

  return router;
}
