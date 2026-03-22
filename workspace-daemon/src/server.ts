import express from "express";
import cors from "cors";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { Tracker } from "./tracker";
import { MissionLoop } from "./mission-loop";
import { OpenClawClient } from "./openclaw-client";
import { Orchestrator } from "./orchestrator";
import { createProjectsRouter } from "./routes/projects";
import { createStatsRouter } from "./routes/stats";
import { createTasksRouter } from "./routes/tasks";
import { createAgentsRouter } from "./routes/agents";
import { createMissionsRouter } from "./routes/missions";
import { registerEventsRoutes } from "./routes/events";
import { createCheckpointsRouter } from "./routes/checkpoints";
import { createPhasesRouter } from "./routes/phases";
import { createDecomposeRouter } from "./routes/decompose";
import { createAdhocTaskRunsRouter, createTaskRunsRouter } from "./routes/task-runs";
import { createTeamsRouter } from "./routes/teams";
import { createSkillsRouter } from "./routes/skills";
import {
  createOverseerRouter,
  notifyPendingOverseerItems,
} from "./routes/overseer";

const PORT = Number(process.env.PORT ?? 3002);
const STARTUP_TIMESTAMP = Date.now();
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = process.env.DB_PATH
  ? path.dirname(process.env.DB_PATH)
  : path.resolve(SERVER_DIR, "..", ".workspaces");
const DB_FILE = process.env.DB_PATH
  ? process.env.DB_PATH
  : path.join(DB_DIR, "workspace.db");

mkdirSync(DB_DIR, { recursive: true });

process.env.WORKSPACE_DAEMON_DB_PATH = DB_FILE;

export function createServer(): {
  app: express.Express;
  tracker: Tracker;
  openclawClient: OpenClawClient;
  orchestrator: Orchestrator;
  missionLoop: MissionLoop;
} {
  const app = express();
  const tracker = new Tracker();
  const openclawClient = new OpenClawClient();
  const missionLoop = new MissionLoop(tracker, openclawClient, {
    overseerEnabled: true,
    overseerAgentId: "aurora",
  });
  const orchestrator = new Orchestrator(tracker, missionLoop);

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/workspace/version", (_req, res) => {
    res.json({
      version: STARTUP_TIMESTAMP,
      uptime: Math.floor((Date.now() - STARTUP_TIMESTAMP) / 1000),
    });
  });

  app.get("/api/workspace/config", (_req, res) => {
    res.json({
      autoApprove: orchestrator.getAutoApprove(),
      overseer: orchestrator.getOverseer(),
    });
  });

  app.patch("/api/workspace/config", (req, res) => {
    const autoApprove = req.body?.auto_approve;
    const overseer =
      typeof req.body?.overseer === "string"
        ? req.body.overseer.trim() || null
        : req.body?.overseer === null || req.body?.overseer === undefined
          ? undefined
          : "__invalid__";

    if (
      typeof autoApprove !== "boolean" &&
      autoApprove !== undefined &&
      autoApprove !== null
    ) {
      res.status(400).json({ error: "auto_approve is required" });
      return;
    }
    if (overseer === "__invalid__") {
      res.status(400).json({ error: "overseer must be a string" });
      return;
    }

    if (typeof autoApprove === "boolean") {
      orchestrator.setAutoApprove(autoApprove);
    }
    if (overseer !== undefined) {
      orchestrator.setOverseer(overseer);
    }
    res.json({
      autoApprove: orchestrator.getAutoApprove(),
      overseer: orchestrator.getOverseer(),
    });
  });

  app.get("/api/workspace/config/overseer", (_req, res) => {
    res.json({ overseer: orchestrator.getOverseer() });
  });

  app.get("/api/workspace/config/auto-approve", (_req, res) => {
    res.json({ autoApprove: orchestrator.getAutoApprove() });
  });

  app.post("/api/workspace/config/auto-approve", (req, res) => {
    const autoApprove = req.body?.auto_approve;
    if (typeof autoApprove !== "boolean") {
      res.status(400).json({ error: "auto_approve is required" });
      return;
    }

    orchestrator.setAutoApprove(autoApprove);
    res.json({ autoApprove: orchestrator.getAutoApprove() });
  });

  app.post("/api/workspace/config/overseer", (req, res) => {
    const overseer =
      typeof req.body?.overseer === "string"
        ? req.body.overseer.trim() || null
        : req.body?.overseer === null
          ? null
          : "__invalid__";
    if (overseer === "__invalid__") {
      res.status(400).json({ error: "overseer is required" });
      return;
    }

    orchestrator.setOverseer(overseer);
    res.json({ overseer: orchestrator.getOverseer() });
  });

  app.get("/api/workspace/recent-paths", (_req, res) => {
    const projects = tracker.listProjects();
    const suggestions = [
      ...projects.map((project) => project.path).filter((value): value is string => Boolean(value)),
      process.cwd(),
    ];

    res.json({
      paths: [...new Set(suggestions)],
    });
  });

  app.use("/api/workspace/projects", createProjectsRouter(tracker));
  app.use("/api/workspace/stats", createStatsRouter(tracker));
  app.use("/api/workspace/phases", createPhasesRouter(tracker));
  app.use("/api/workspace/tasks", createTasksRouter(tracker, orchestrator));
  app.use(
    "/api/workspace/task-runs/adhoc",
    createAdhocTaskRunsRouter(tracker, orchestrator, openclawClient),
  );
  app.use(
    "/api/workspace/task-runs",
    createTaskRunsRouter(tracker, orchestrator, openclawClient),
  );
  app.use("/api/workspace/agents", createAgentsRouter(tracker));
  app.use("/api/workspace/missions", createMissionsRouter(tracker));
  app.use("/api/workspace/checkpoints", createCheckpointsRouter(tracker, orchestrator));
  app.use("/api/workspace/decompose", createDecomposeRouter(tracker));
  app.use("/api/workspace/teams", createTeamsRouter(tracker));
  app.use("/api/workspace/skills", createSkillsRouter());
  app.use("/api/workspace/overseer", createOverseerRouter(tracker, openclawClient));

  const eventsRouter = Router();
  registerEventsRoutes(eventsRouter, tracker);
  app.use("/api/workspace/events", eventsRouter);

  return { app, tracker, openclawClient, orchestrator, missionLoop };
}

const { app, tracker, openclawClient, orchestrator } = createServer();

orchestrator.start();

const overseerScheduler = setInterval(() => {
  const hasConfiguredOverseers = tracker
    .listProjects()
    .some(
      (project) =>
        typeof project.overseer === "string" && project.overseer.trim().length > 0,
    );

  if (!hasConfiguredOverseers) {
    return;
  }

  console.log("[overseer] Checking for stale checkpoints...");
  void notifyPendingOverseerItems(tracker, openclawClient).catch(() => undefined);
}, 15 * 60 * 1_000);

const server = app.listen(PORT, () => {
  process.stdout.write(`Workspace daemon listening on http://localhost:${PORT}\n`);
});

server.on("close", () => {
  clearInterval(overseerScheduler);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    process.stderr.write(
      `Workspace daemon port ${PORT} is already in use; leaving the existing process running.\n`,
    );
    process.exit(0);
    return;
  }

  process.stderr.write(`Workspace daemon failed to start: ${error.message}\n`);
  process.exit(1);
});
