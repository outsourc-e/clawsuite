import { Router } from "express";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const STATE_PATH = path.join(
  process.env.HOME || "/Users/aurora",
  ".openclaw/workspace/data/dispatch-state.json",
);

type DispatchState = {
  options?: {
    project_path?: unknown;
  };
};

function readDispatchProjectPath(): string | null {
  if (!existsSync(STATE_PATH)) {
    return null;
  }

  try {
    const raw = readFileSync(STATE_PATH, "utf-8");
    const state = JSON.parse(raw) as DispatchState;
    return typeof state.options?.project_path === "string" &&
      state.options.project_path.trim().length > 0
      ? state.options.project_path.trim()
      : null;
  } catch {
    return null;
  }
}

function getContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "text/plain; charset=utf-8";
  }
}

function isInsideBasePath(basePath: string, resolvedPath: string): boolean {
  const relativePath = path.relative(basePath, resolvedPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

export function createDispatchFilesRouter(): Router {
  const router = Router();

  router.get("/*", (req, res) => {
    const routeParams = req.params as Record<string, string | undefined>;
    const requestedPath = typeof routeParams["0"] === "string" ? routeParams["0"].trim() : "";
    if (!requestedPath) {
      res.status(400).json({ error: "file path is required" });
      return;
    }

    const projectPath = readDispatchProjectPath();
    if (!projectPath) {
      res.status(404).json({ error: "Project path not found" });
      return;
    }

    const resolvedProjectPath = path.resolve(projectPath);
    const resolvedFilePath = path.resolve(resolvedProjectPath, requestedPath);

    if (!isInsideBasePath(resolvedProjectPath, resolvedFilePath)) {
      res.status(400).json({ error: "Path traversal is not allowed" });
      return;
    }

    if (!existsSync(resolvedFilePath) || !statSync(resolvedFilePath).isFile()) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    res.type(getContentType(resolvedFilePath));
    res.sendFile(resolvedFilePath, (error) => {
      if (error && !res.headersSent) {
        res.status(500).json({ error: "Internal error" });
      }
    });
  });

  return router;
}
