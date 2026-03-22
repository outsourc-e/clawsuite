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

export function getPendingOverseerItems(tracker: Tracker): PendingOverseerItem[] {
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

  // Reminder checks also run on an internal daemon interval in server.ts.

  router.get("/pending", (_req, res) => {
    res.json({
      threshold_minutes: PENDING_THRESHOLD_MINUTES,
      items: getPendingOverseerItems(tracker),
    });
  });

  router.post("/notify", async (_req, res) => {
    try {
      const count = await notifyPendingOverseerItems(tracker, openclawClient);
      res.json({
        count,
      });
    } catch {
      res.status(500).json({ error: "Internal error" });
    }
  });

  return router;
}

export async function notifyPendingOverseerItems(
  tracker: Tracker,
  openclawClient: OpenClawClient,
): Promise<number> {
  const pendingItems = getPendingOverseerItems(tracker);

  for (const item of pendingItems) {
    await openclawClient.systemEvent(
      `Overseer reminder for ${item.overseer}: ${item.projectName} / ${item.taskName} has checkpoint ${item.checkpointId} pending for ${item.ageMinutes} minutes`,
    );
  }

  return pendingItems.length;
}
