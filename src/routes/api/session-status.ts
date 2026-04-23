import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../server/gateway'
import { isAuthenticated } from '@/server/auth-middleware'

const SESSION_STATUS_METHODS = [
  // Order: cheapest first. 'sessions.usage' is on the gateway backoff
  // list and often fast-fails immediately when the gateway is stalled —
  // that's fine, we just want the first method that actually answers.
  'session.status',
  'sessions.status',
  'sessions.usage',
]

// Per-method budget. Each individual gateway RPC is already capped at 30s
// inside the gateway client, but the /api/session-status endpoint itself
// should never take more than ~5s to answer — it feeds a polling UI.
const PER_METHOD_TIMEOUT_MS = 4_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    }),
  ])
}

async function trySessionStatus(sessionKey?: string): Promise<unknown> {
  let lastError: unknown = null
  const params: Record<string, unknown> = {}
  if (sessionKey) params.sessionKey = sessionKey
  for (const method of SESSION_STATUS_METHODS) {
    try {
      return await withTimeout(
        gatewayRpc(method, params),
        PER_METHOD_TIMEOUT_MS,
        method,
      )
    } catch (error) {
      lastError = error
      // Don't spam the next method if the whole gateway is clearly down
      // with a connection-level error. Otherwise keep trying.
      const msg =
        error instanceof Error ? error.message.toLowerCase() : String(error)
      if (msg.includes('gateway client is shut down')) break
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Session status unavailable')
}

// Known model context windows
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4-6': 200_000,
  'claude-opus-4-5': 200_000,
  'claude-sonnet-4-5': 200_000,
  'claude-sonnet-4': 200_000,
  'claude-haiku-3.5': 200_000,
  'gpt-5.2-codex': 1_000_000,
  'gpt-4.1': 1_000_000,
  'gpt-4o': 128_000,
  'gemini-2.5-flash': 1_000_000,
}

function getContextWindow(model: string): number {
  if (MODEL_CONTEXT_WINDOWS[model]) return MODEL_CONTEXT_WINDOWS[model]
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (model.includes(key) || key.includes(model)) return value
  }
  return 200_000
}

export const Route = createFileRoute('/api/session-status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const url = new URL(request.url)
          const requestedKey = url.searchParams.get('sessionKey')?.trim() || ''
          // Default to main session so agent hub model changes don't bleed into main chat
          const sessionKey = requestedKey || 'main'

          // Fetch both status and usage data in parallel, each with a hard
          // cap so this endpoint never blocks a polling UI for more than a
          // few seconds. Prior behaviour: could hang 90s+ while serially
          // trying 3 methods at 30s each. See gateway-stall reports.
          const [statusResult, usageResult] = await Promise.allSettled([
            trySessionStatus(sessionKey),
            withTimeout(
              gatewayRpc<any>('sessions.usage', {
                limit: 200,
                includeContextWeight: true,
              }),
              PER_METHOD_TIMEOUT_MS,
              'sessions.usage',
            ),
          ])

          const payload =
            statusResult.status === 'fulfilled' ? statusResult.value : {}
          const usageData =
            usageResult.status === 'fulfilled' ? usageResult.value : null

          // Find main session usage
          const mainUsage = usageData?.sessions?.find((s: any) =>
            s.key?.includes(':main'),
          )

          // Enrich payload with session usage data
          const enriched: Record<string, unknown> = {
            ...(payload && typeof payload === 'object' ? payload : {}),
          }

          if (mainUsage?.usage) {
            const u = mainUsage.usage
            const model = mainUsage.model ?? mainUsage.modelOverride ?? ''
            const maxTokens = mainUsage.contextTokens ?? mainUsage.contextWindow ?? getContextWindow(model)

            // Calculate context % from cache data
            const cacheRead = u.cacheRead ?? 0
            const turnCount =
              u.latency?.count ?? u.messageCounts?.assistant ?? 1
            let estimatedContext = 0
            if (cacheRead > 0 && turnCount > 0) {
              estimatedContext = Math.ceil((cacheRead / turnCount) * 1.2)
            }
            const contextPercent =
              maxTokens > 0
                ? Math.min((estimatedContext / maxTokens) * 100, 100)
                : 0

            enriched.inputTokens = u.input ?? 0
            enriched.outputTokens = u.output ?? 0
            enriched.totalTokens = (u.input ?? 0) + (u.output ?? 0)
            enriched.cacheRead = u.cacheRead ?? 0
            enriched.cacheWrite = u.cacheWrite ?? 0
            enriched.contextPercent = Math.round(contextPercent * 10) / 10
            enriched.dailyCost = u.totalCost ?? 0
            enriched.costUsd = u.totalCost ?? 0
            enriched.model = model
            enriched.modelProvider = mainUsage.modelProvider ?? ''
            enriched.sessionKey = mainUsage.key ?? ''
            enriched.sessionLabel = mainUsage.label ?? mainUsage.name ?? ''
            enriched.messageCounts = u.messageCounts ?? {}
            enriched.latency = u.latency ?? {}

            // Model breakdown
            if (u.modelUsage) {
              enriched.models = u.modelUsage.map((m: any) => ({
                model: m.model,
                provider: m.provider,
                inputTokens: m.totals?.input ?? 0,
                outputTokens: m.totals?.output ?? 0,
                costUsd: m.totals?.totalCost ?? 0,
                count: m.count ?? 0,
              }))
            }
          }

          // Include all sessions for dashboard aggregation (dailyModelUsage, dailyBreakdown, etc.)
          const allSessions = Array.isArray(usageData?.sessions) ? usageData.sessions : []
          enriched.sessions = allSessions.map((s: any) => ({
            key: s.key,
            agentId: s.agentId ?? s.key,
            label: s.label ?? s.friendlyId ?? '',
            model: s.model ?? '',
            modelProvider: s.modelProvider ?? '',
            updatedAt: s.updatedAt ?? 0,
            usage: s.usage ?? {},
          }))

          return json({ ok: true, payload: enriched })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
