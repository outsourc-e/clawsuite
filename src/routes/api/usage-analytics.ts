import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '@/server/auth-middleware'
import { gatewayRpc } from '@/server/gateway'

type ModelPricing = {
  input: number
  output: number
}

type NormalizedModelUsage = {
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
}

type NormalizedSessionUsage = {
  sessionKey: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
  lastActiveAt: number | null
}

type UnknownRecord = Record<string, unknown>

const REQUEST_TIMEOUT_MS = 10_000

const FALLBACK_MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { input: 5, output: 15 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 3, output: 15 },
  'gpt-4.1-mini': { input: 0.3, output: 1.2 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  o1: { input: 15, output: 60 },
  'o1-mini': { input: 3, output: 12 },
  'o3-mini': { input: 1.1, output: 4.4 },
  'claude-3.5-sonnet': { input: 3, output: 15 },
  'claude-3.5-haiku': { input: 0.8, output: 4 },
  'claude-3-opus': { input: 15, output: 75 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-opus-4-5': { input: 15, output: 75 },
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-haiku-3.5': { input: 0.8, output: 4 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gpt-5.2-codex': { input: 1.5, output: 6 },
}

function toRecord(value: unknown): UnknownRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as UnknownRecord
  }
  return {}
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return null
    return value < 1_000_000_000_000 ? value * 1000 : value
  }
  if (typeof value === 'string' && value.trim()) {
    const asNum = Number(value)
    if (Number.isFinite(asNum) && asNum > 0) {
      return asNum < 1_000_000_000_000 ? asNum * 1000 : asNum
    }
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId!)
  })
}

function readConfiguredModelPricing(): Map<string, ModelPricing> {
  const pricing = new Map<string, ModelPricing>()
  const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')

  try {
    const raw = fs.readFileSync(configPath, 'utf8')
    const config = JSON.parse(raw) as {
      models?: {
        providers?: Record<
          string,
          { models?: Array<{ id?: string; name?: string; cost?: Record<string, number> }> }
        >
      }
    }

    const providers = config.models?.providers ?? {}
    for (const providerConfig of Object.values(providers)) {
      for (const model of providerConfig.models ?? []) {
        if (!model?.cost) continue
        const next: ModelPricing = {
          input: readNumber(model.cost.input ?? model.cost.prompt ?? model.cost.inputTokens),
          output: readNumber(model.cost.output ?? model.cost.completion ?? model.cost.outputTokens),
        }
        if (next.input <= 0 && next.output <= 0) continue
        const keys = [model.id, model.name]
          .map((v) => readString(v).toLowerCase())
          .filter(Boolean)
        for (const key of keys) pricing.set(key, next)
      }
    }
  } catch {
    // Missing or unreadable local config is fine; fallback pricing will be used.
  }

  return pricing
}

function resolvePricing(
  model: string,
  configuredPricing: Map<string, ModelPricing>,
): ModelPricing | null {
  const key = model.trim().toLowerCase()
  if (!key) return null
  const direct = configuredPricing.get(key)
  if (direct) return direct

  for (const [candidate, price] of configuredPricing.entries()) {
    if (key.includes(candidate) || candidate.includes(key)) return price
  }

  if (FALLBACK_MODEL_PRICING[key]) return FALLBACK_MODEL_PRICING[key]
  for (const [candidate, price] of Object.entries(FALLBACK_MODEL_PRICING)) {
    if (key.includes(candidate) || candidate.includes(key)) return price
  }
  return null
}

function computeModelCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  providedCost: number,
  configuredPricing: Map<string, ModelPricing>,
): number {
  if (providedCost > 0) return providedCost
  const pricing = resolvePricing(model, configuredPricing)
  if (!pricing) return 0
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  )
}

function parseSessionModels(
  usage: UnknownRecord,
  fallbackModel: string,
  configuredPricing: Map<string, ModelPricing>,
): Array<NormalizedModelUsage> {
  const rawModelUsage = Array.isArray(usage.modelUsage) ? usage.modelUsage : []
  const rows = rawModelUsage
    .map((entry) => {
      const row = toRecord(entry)
      const totals = toRecord(row.totals)
      const model = readString(row.model || row.id) || fallbackModel || 'unknown'
      const inputTokens = readNumber(
        totals.input ?? row.input ?? row.inputTokens ?? row.promptTokens,
      )
      const outputTokens = readNumber(
        totals.output ?? row.output ?? row.outputTokens ?? row.completionTokens,
      )
      const costUsd = computeModelCost(
        model,
        inputTokens,
        outputTokens,
        readNumber(totals.totalCost ?? row.costUsd ?? row.cost),
        configuredPricing,
      )
      return {
        model,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        costUsd,
      }
    })
    .filter((row) => row.model || row.totalTokens > 0)

  if (rows.length > 0) return rows

  const inputTokens = readNumber(
    usage.input ?? usage.inputTokens ?? usage.promptTokens ?? usage.prompt_tokens,
  )
  const outputTokens = readNumber(
    usage.output ??
      usage.outputTokens ??
      usage.completionTokens ??
      usage.completion_tokens,
  )
  if (inputTokens <= 0 && outputTokens <= 0) return []

  const model = fallbackModel || 'unknown'
  return [
    {
      model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUsd: computeModelCost(
        model,
        inputTokens,
        outputTokens,
        readNumber(usage.totalCost ?? usage.costUsd ?? usage.cost),
        configuredPricing,
      ),
    },
  ]
}

function normalizeSessionsUsage(
  payload: unknown,
  configuredPricing: Map<string, ModelPricing>,
): {
  sessions: Array<NormalizedSessionUsage>
  models: Array<NormalizedModelUsage>
  totals: { inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number }
} {
  const root = toRecord(payload)
  const rawSessions = Array.isArray(root.sessions) ? root.sessions : []

  const sessions: Array<NormalizedSessionUsage> = []
  const perModelMap = new Map<string, NormalizedModelUsage>()
  let totalInput = 0
  let totalOutput = 0
  let totalCost = 0

  for (const entry of rawSessions) {
    const row = toRecord(entry)
    const usage = toRecord(row.usage)
    const sessionKey =
      readString(
        row.key ?? row.sessionKey ?? row.id ?? row.sessionId ?? row.friendlyId,
      ) || 'session'
    const fallbackModel = readString(
      row.model ?? row.modelOverride ?? row.providerModel ?? row.modelName,
    )
    const modelRows = parseSessionModels(usage, fallbackModel, configuredPricing)

    const inputTokens =
      modelRows.length > 0
        ? modelRows.reduce((sum, m) => sum + m.inputTokens, 0)
        : readNumber(usage.input ?? usage.inputTokens)
    const outputTokens =
      modelRows.length > 0
        ? modelRows.reduce((sum, m) => sum + m.outputTokens, 0)
        : readNumber(usage.output ?? usage.outputTokens)

    const providedSessionCost = readNumber(
      usage.totalCost ?? usage.costUsd ?? usage.cost ?? row.costUsd ?? row.cost,
    )
    const computedSessionCost =
      modelRows.length > 0
        ? modelRows.reduce((sum, m) => sum + m.costUsd, 0)
        : computeModelCost(
            fallbackModel || 'unknown',
            inputTokens,
            outputTokens,
            providedSessionCost,
            configuredPricing,
          )

    const primaryModel =
      modelRows.sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens)[0]
        ?.model ||
      fallbackModel ||
      'unknown'

    for (const modelRow of modelRows) {
      const existing = perModelMap.get(modelRow.model)
      if (existing) {
        existing.inputTokens += modelRow.inputTokens
        existing.outputTokens += modelRow.outputTokens
        existing.totalTokens += modelRow.totalTokens
        existing.costUsd += modelRow.costUsd
      } else {
        perModelMap.set(modelRow.model, { ...modelRow })
      }
    }

    const lastActiveAt =
      toTimestampMs(row.updatedAt) ??
      toTimestampMs(row.lastUpdated) ??
      toTimestampMs(row.lastActiveAt) ??
      toTimestampMs(row.createdAt) ??
      null

    sessions.push({
      sessionKey,
      model: primaryModel,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUsd: computedSessionCost,
      lastActiveAt,
    })

    totalInput += inputTokens
    totalOutput += outputTokens
    totalCost += computedSessionCost
  }

  const models = Array.from(perModelMap.values()).sort(
    (a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens,
  )

  return {
    sessions,
    models,
    totals: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      totalTokens: totalInput + totalOutput,
      costUsd: totalCost,
    },
  }
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return String(error)
}

export const Route = createFileRoute('/api/usage-analytics')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const [sessionsPayload, costPayload] = await withTimeout(
            Promise.all([
              gatewayRpc<Record<string, unknown>>('sessions.usage', {
                limit: 1000,
                includeContextWeight: true,
              }),
              gatewayRpc<Record<string, unknown>>('usage.cost', {}),
            ]),
            REQUEST_TIMEOUT_MS,
            'Usage analytics request timed out',
          )

          const configuredPricing = readConfiguredModelPricing()
          const parsed = normalizeSessionsUsage(sessionsPayload, configuredPricing)

          return json({
            ok: true,
            sessions: parsed.sessions,
            cost: costPayload,
            models: {
              rows: parsed.models,
              totals: parsed.totals,
            },
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error: readErrorMessage(error),
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
