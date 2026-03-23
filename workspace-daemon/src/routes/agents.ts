import { Router } from "express";
import { Tracker } from "../tracker";
import type { UpdateAgentInput } from "../types";

export function createAgentsRouter(tracker: Tracker): Router {
  const router = Router();

  // Static fallback list — used when gateway is unreachable
  const FALLBACK_MODELS = [
    { id: 'auto', name: 'Auto (best available)', provider: null, free: true, description: 'Orchestrator picks the best model for the task type' },
    { id: 'codex', name: 'Codex (GPT-5.4)', provider: 'openai-codex', free: true, description: 'Best for coding — multi-file edits, builds, refactors' },
    { id: 'sonnet46-coding', name: 'Claude Sonnet 4.6', provider: 'anthropic-oauth', free: true, description: 'Strong reasoning — reviews, planning, complex analysis' },
    { id: 'minimax-fast', name: 'MiniMax Lightning', provider: 'minimax', free: false, description: 'Fast and cheap — research, synthesis, drafts' },
    { id: 'nemotron-super', name: 'Nemotron 120B', provider: 'openrouter', free: true, description: 'Free via OpenRouter — good general purpose' },
  ];

  // Dynamic model list — tries gateway first, falls back to static
  router.get("/models", async (_req, res) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL ?? "http://127.0.0.1:18789";
      const response = await fetch(`${gatewayUrl}/api/models`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timer);

      if (response.ok) {
        const data = (await response.json()) as { models?: Array<{ id: string; name?: string; provider?: string }> };
        if (Array.isArray(data?.models) && data.models.length > 0) {
          const gatewayModels = data.models.map((m) => ({
            id: m.id,
            name: m.name ?? m.id,
            provider: m.provider ?? null,
            free: false,
            description: null,
          }));
          // Prepend "auto" + merge with known free flags
          const freeIds = new Set(FALLBACK_MODELS.filter((m) => m.free).map((m) => m.id));
          res.json({
            source: "gateway",
            models: [
              FALLBACK_MODELS[0], // auto
              ...gatewayModels.map((m) => ({ ...m, free: freeIds.has(m.id) || m.free })),
            ],
          });
          return;
        }
      }
    } catch {
      // Gateway unreachable — fall through to static
    }

    res.json({ source: "static", models: FALLBACK_MODELS });
  });

  // Legacy endpoint — backward compat
  router.get("/available", (_req, res) => {
    res.json(FALLBACK_MODELS);
  });

  router.get("/", (_req, res) => {
    const agents = tracker.listAgentDirectory().map((agent) => ({
      ...agent,
      model: agent.model ?? (agent.adapter_type === "codex" ? "gpt-5.4-codex" : agent.adapter_type === "claude" ? "claude-sonnet-4-6" : "unknown"),
      status: agent.status === "away" ? "online" : agent.status,
    }));
    res.json({ agents });
  });

  router.get("/:id/stats", (req, res) => {
    const stats = tracker.getAgentDirectoryStats(req.params.id);
    if (!stats) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json({ stats });
  });

  router.post("/", (req, res) => {
    const { name, role, adapter_type, adapter_config, model, capabilities } = req.body as {
      name?: string;
      role?: string;
      adapter_type?: "codex" | "claude" | "openclaw" | "ollama";
      adapter_config?: Record<string, unknown>;
      model?: string | null;
      capabilities?: Record<string, unknown>;
    };
    if (!name || name.trim().length === 0) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const agent = tracker.registerAgent({
      name: name.trim(),
      role,
      adapter_type,
      adapter_config,
      model,
      capabilities,
    });
    res.status(201).json(agent);
  });

  router.patch("/:id", (req, res) => {
    const body = (req.body ?? {}) as UpdateAgentInput;
    const updates: UpdateAgentInput = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length === 0) {
        res.status(400).json({ error: "name must be a non-empty string" });
        return;
      }
      updates.name = body.name.trim();
    }

    if (body.status !== undefined) {
      if (typeof body.status !== "string" || body.status.trim().length === 0) {
        res.status(400).json({ error: "status must be a non-empty string" });
        return;
      }
      updates.status = body.status;
    }

    if (body.model !== undefined) {
      if (body.model !== null && typeof body.model !== "string") {
        res.status(400).json({ error: "model must be a string or null" });
        return;
      }
      updates.model = typeof body.model === "string" ? body.model.trim() : body.model;
    }

    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description !== "string") {
        res.status(400).json({ error: "description must be a string or null" });
        return;
      }
      updates.description =
        typeof body.description === "string" ? body.description.trim() : body.description;
    }

    if (body.system_prompt !== undefined) {
      if (body.system_prompt !== null && typeof body.system_prompt !== "string") {
        res.status(400).json({ error: "system_prompt must be a string or null" });
        return;
      }
      updates.system_prompt = body.system_prompt;
    }

    const agent = tracker.updateAgent(req.params.id, updates);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    res.json(agent);
  });

  router.delete("/:id", (req, res) => {
    const agent = tracker.getAgent(req.params.id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    tracker.deleteAgent(req.params.id);
    res.json({ ok: true });
  });

  router.get("/:id/status", (req, res) => {
    const status = tracker.getAgentStatus(req.params.id);
    if (!status) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json(status);
  });

  return router;
}
