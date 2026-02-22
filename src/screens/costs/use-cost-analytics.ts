import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

type ApiSessionRow = {
  sessionKey?: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  costUsd?: number
  lastActiveAt?: number | null
}

type ApiModelRow = {
  model?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  costUsd?: number
}

type ApiCostPoint = {
  date?: string
  amount?: number
  totalCost?: number
}

type ApiPayload = {
  ok: boolean
  sessions?: Array<ApiSessionRow>
  cost?: {
    daily?: Array<ApiCostPoint>
    timeseries?: Array<ApiCostPoint>
    totals?: Record<string, unknown>
    [key: string]: unknown
  }
  models?: {
    rows?: Array<ApiModelRow>
    totals?: Record<string, unknown>
  }
  error?: string
}

export type CostKpis = {
  todaySpend: number
  yesterdaySpend: number
  todayDelta: number
  todayDeltaPct: number | null
  monthToDate: number
  projectedEom: number
  activeSessions: number
}

export type CostModelRow = {
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
}

export type CostDayRow = {
  date: string
  label: string
  amount: number
}

export type CostSessionRow = {
  sessionKey: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
  lastActiveAt: number | null
}

type DerivedCostAnalytics = {
  kpis: CostKpis
  models: Array<CostModelRow>
  daily: Array<CostDayRow>
  sessions: Array<CostSessionRow>
  topSessions: Array<CostSessionRow>
  totals: {
    tokens: number
    costUsd: number
  }
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function toTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return null
    return value < 1_000_000_000_000 ? value * 1000 : value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed
    }
    const iso = Date.parse(value)
    return Number.isFinite(iso) ? iso : null
  }
  return null
}

function formatDayLabel(dateKey: string) {
  const dt = new Date(`${dateKey}T00:00:00`)
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function buildDailySeries(rawCost: ApiPayload['cost']): Array<CostDayRow> {
  const entries = Array.isArray(rawCost?.daily)
    ? rawCost.daily
    : Array.isArray(rawCost?.timeseries)
      ? rawCost.timeseries
      : []

  const amountByDay = new Map<string, number>()
  for (const row of entries) {
    const date = typeof row?.date === 'string' ? row.date.slice(0, 10) : ''
    if (!date) continue
    const amount = readNumber(row.amount ?? row.totalCost)
    amountByDay.set(date, (amountByDay.get(date) ?? 0) + amount)
  }

  const today = new Date()
  const result: Array<CostDayRow> = []
  for (let i = 29; i >= 0; i -= 1) {
    const dt = new Date(today)
    dt.setHours(0, 0, 0, 0)
    dt.setDate(dt.getDate() - i)
    const key = dt.toISOString().slice(0, 10)
    result.push({
      date: key,
      label: formatDayLabel(key),
      amount: amountByDay.get(key) ?? 0,
    })
  }
  return result
}

function normalizeModels(payload: ApiPayload['models']): Array<CostModelRow> {
  const rows = Array.isArray(payload?.rows) ? payload.rows : []
  return rows
    .map((row) => {
      const model = typeof row?.model === 'string' ? row.model : 'unknown'
      const inputTokens = readNumber(row?.inputTokens)
      const outputTokens = readNumber(row?.outputTokens)
      const totalTokens =
        readNumber(row?.totalTokens) || inputTokens + outputTokens
      const costUsd = readNumber(row?.costUsd)
      return { model, inputTokens, outputTokens, totalTokens, costUsd }
    })
    .sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens)
}

function normalizeSessions(payload: Array<ApiSessionRow> | undefined) {
  const rows = Array.isArray(payload) ? payload : []
  return rows
    .map((row) => {
      const sessionKey =
        typeof row?.sessionKey === 'string' && row.sessionKey.length > 0
          ? row.sessionKey
          : 'session'
      const inputTokens = readNumber(row?.inputTokens)
      const outputTokens = readNumber(row?.outputTokens)
      const totalTokens =
        readNumber(row?.totalTokens) || inputTokens + outputTokens
      return {
        sessionKey,
        model:
          typeof row?.model === 'string' && row.model.length > 0
            ? row.model
            : 'unknown',
        inputTokens,
        outputTokens,
        totalTokens,
        costUsd: readNumber(row?.costUsd),
        lastActiveAt: toTimestampMs(row?.lastActiveAt),
      } satisfies CostSessionRow
    })
    .sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens)
}

function buildKpis(
  daily: Array<CostDayRow>,
  sessions: Array<CostSessionRow>,
  modelRows: Array<CostModelRow>,
): CostKpis {
  const today = new Date()
  const todayKey = today.toISOString().slice(0, 10)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const yesterdayKey = yesterday.toISOString().slice(0, 10)

  const todaySpend = daily.find((d) => d.date === todayKey)?.amount ?? 0
  const yesterdaySpend = daily.find((d) => d.date === yesterdayKey)?.amount ?? 0
  const todayDelta = todaySpend - yesterdaySpend
  const todayDeltaPct =
    yesterdaySpend > 0 ? (todayDelta / yesterdaySpend) * 100 : null

  const year = today.getFullYear()
  const month = today.getMonth()
  const monthToDate = daily
    .filter((d) => {
      const dt = new Date(`${d.date}T00:00:00`)
      return dt.getFullYear() === year && dt.getMonth() === month
    })
    .reduce((sum, d) => sum + d.amount, 0)

  const dayOfMonth = today.getDate()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const projectedEom = dayOfMonth > 0 ? (monthToDate / dayOfMonth) * daysInMonth : 0

  const activeSessions = sessions.filter((s) => s.totalTokens > 0 || s.costUsd > 0).length
  const fallbackActive = modelRows.length > 0 ? modelRows.length : 0

  return {
    todaySpend,
    yesterdaySpend,
    todayDelta,
    todayDeltaPct,
    monthToDate,
    projectedEom,
    activeSessions: activeSessions || fallbackActive,
  }
}

function derive(payload: ApiPayload): DerivedCostAnalytics {
  const models = normalizeModels(payload.models)
  const sessions = normalizeSessions(payload.sessions)
  const daily = buildDailySeries(payload.cost)
  const kpis = buildKpis(daily, sessions, models)
  const totalTokens = models.reduce((sum, m) => sum + m.totalTokens, 0)
  const totalCostUsd = models.reduce((sum, m) => sum + m.costUsd, 0)

  return {
    kpis,
    models,
    daily,
    sessions,
    topSessions: sessions.slice(0, 10),
    totals: {
      tokens: totalTokens,
      costUsd: totalCostUsd,
    },
  }
}

export function useCostAnalytics() {
  const query = useQuery({
    queryKey: ['usage-analytics', 'costs'],
    queryFn: async () => {
      const res = await fetch('/api/usage-analytics')
      const json = (await res.json()) as ApiPayload
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`)
      }
      return json
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  })

  const derived = useMemo(() => derive(query.data ?? { ok: true }), [query.data])

  return {
    ...query,
    analytics: derived,
  }
}

