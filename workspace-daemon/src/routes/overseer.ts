import { Router } from "express";
import { OpenClawClient } from "../openclaw-client";
import { Tracker } from "../tracker";

const PENDING_THRESHOLD_MINUTES = 10;
const PENDING_THRESHOLD_MS = PENDING_THRESHOLD_MINUTES * 60 * 1000;

type PendingOverseerItem = {
  checkpointId: string;
  taskRunId: string;
  projectId: string;
  projectName: string;
  taskName: string;
  overseer: string;
  createdAt: string;
  ageMinutes: number;
};

function getPendingOverseerItems(tracker: Tracker): PendingOverseerItem[] {
  const now = Date.now();

  return tracker
    .listCheckpoints("pending")
    .flatMap((checkpoint) => {
      if (!checkpoint.project_id) {
        return [];
      }

      const project = tracker.getProject(checkpoint.project_id);
      const overseer =
        typeof project?.overseer === "string" ? project.overseer.trim() : "";

      if (!overseer) {
        return [];
      }

      const createdAtMs = Date.parse(checkpoint.created_at);
      if (Number.isNaN(createdAtMs)) {
        return [];
      }

      const ageMs = now - createdAtMs;
      if (ageMs < PENDING_THRESHOLD_MS) {
        return [];
      }

      return [
        {
          checkpointId: checkpoint.id,
          taskRunId: checkpoint.task_run_id,
          projectId: checkpoint.project_id,
          projectName: checkpoint.project_name ?? "Unknown project",
          taskName: checkpoint.task_name ?? "Unknown task",
          overseer,
          createdAt: checkpoint.created_at,
          ageMinutes: Math.max(PENDING_THRESHOLD_MINUTES, Math.floor(ageMs / 60000)),
        },
      ];
    });
}

export function createOverseerRouter(
  tracker: Tracker,
  openclawClient: OpenClawClient,
): Router {
  const router = Router();

  // Recommended OpenClaw cron:
  // Schedule: every 15 minutes
  // Payload: POST http://localhost:3099/api/workspace/overseer/notify
  // Model: not needed (HTTP-only cron)

  router.get("/pending", (_req, res) => {
    res.json({
      threshold_minutes: PENDING_THRESHOLD_MINUTES,
      items: getPendingOverseerItems(tracker),
    });
  });

  router.post("/notify", async (_req, res) => {
    try {
      const pendingItems = getPendingOverseerItems(tracker);

      for (const item of pendingItems) {
        await openclawClient.systemEvent(
          `Overseer reminder: ${item.projectName} / ${item.taskName} has a pending checkpoint (ID: ${item.checkpointId}) waiting for review for ${item.ageMinutes} minutes`,
        );
      }

      res.json({
        count: pendingItems.length,
      });
    } catch {
      res.status(500).json({ error: "Internal error" });
    }
  });

  return router;
}
