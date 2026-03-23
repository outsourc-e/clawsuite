import { Router } from "express";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { execFile } from "child_process";
import { join, dirname } from "path";
import { Tracker } from "../tracker";

const STATE_PATH = join(
  process.env.HOME || "/Users/aurora",
  ".openclaw/workspace/data/dispatch-state.json"
);

function fireDispatchTrigger(missionId: string, mission: string): void {
  const text = `[dispatch] Mission started: ${missionId}. Goal: "${mission.slice(0, 100)}". Read data/dispatch-state.json and run the workspace-dispatch skill loop now.`;
  execFile("openclaw", ["system", "event", "--text", text, "--mode", "now"], (err) => {
    if (err) {
      console.error("[dispatch] Failed to fire system event:", err.message);
    } else {
      console.log("[dispatch] System event fired for", missionId);
    }
  });
}

export function createDispatchRouter(tracker?: Tracker): Router {
  const router = Router();

  router.get("/state", (_req, res) => {
    if (!existsSync(STATE_PATH)) {
      return res.json({ status: "idle", tasks: [] });
    }
    try {
      const raw = readFileSync(STATE_PATH, "utf-8");
      res.json(JSON.parse(raw));
    } catch {
      res.status(500).json({ error: "Failed to read dispatch state" });
    }
  });

  router.post("/start", (req, res) => {
    const { mission, mode, tasks, projectPath } = req.body;
    if (!mission) return res.status(400).json({ error: "mission is required" });

    const missionId = "mission-" + Date.now();
    const now = new Date().toISOString();

    const state = {
      mission_id: missionId,
      mission,
      status: "pending_dispatch",
      created_at: now,
      updated_at: now,
      current_task_id: null,
      tasks: tasks || [],
      options: { mode: mode || "autonomous", max_parallel: 1, project_path: projectPath || null },
    };

    // Write dispatch state file
    mkdirSync(dirname(STATE_PATH), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

    // Sync to daemon SQLite so Recent Missions shows it
    let projectId: string | null = null;
    if (tracker) {
      try {
        const project = tracker.createProject({
          name: mission.slice(0, 80),
          path: projectPath || null,
          spec: mission,
        });
        projectId = project.id;
        const phase = tracker.createPhase({ project_id: project.id, name: "Phase 1" });
        const dbMission = tracker.createMission({ phase_id: phase.id, name: mission.slice(0, 100) });
        if (dbMission) {
          for (const task of (tasks || [])) {
            tracker.createTask({
              mission_id: dbMission.id,
              name: task.title || task.name || "Task",
              description: task.description || "",
              agent_type: task.type || null,
            });
          }
          // Start the mission so the mission loop picks it up
          tracker.startMission(dbMission.id);
        }
      } catch {
        // SQLite sync is best-effort
      }
    }

    // Fire system event to trigger dispatch skill immediately
    fireDispatchTrigger(missionId, mission);

    res.json({ ok: true, mission_id: missionId, project_id: projectId });
  });

  return router;
}
