import { Router } from "express";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";

const STATE_PATH = join(
  process.env.HOME || "/Users/aurora",
  ".openclaw/workspace/data/dispatch-state.json"
);

export function createDispatchRouter(): Router {
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
    const { mission, mode, tasks } = req.body;
    if (!mission) return res.status(400).json({ error: "mission is required" });

    const state = {
      mission_id: "mission-" + Date.now(),
      mission,
      status: "pending_dispatch",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_task_id: null,
      tasks: tasks || [],
      options: { mode: mode || "autonomous", max_parallel: 1 },
    };

    mkdirSync(dirname(STATE_PATH), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    res.json({ ok: true, mission_id: state.mission_id });
  });

  return router;
}
