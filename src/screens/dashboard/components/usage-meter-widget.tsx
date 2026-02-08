import { ChartLineData02Icon } from '@hugeicons/core-free-icons'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { DashboardGlassCard } from './dashboard-glass-card'
import { cn } from '@/lib/utils'

type UsageModel = {
  model: string
  tokens: number
}

type UsageMeterData = {
  usagePercent: number
  costTodayUsd: number
  models: Array<UsageModel>
}

type UsageApiResponse = {
  payload?: unknown
  data?: unknown
  models?: unknown
}

const demoUsageData: UsageMeterData = {
  usagePercent: 79,
  costTodayUsd: 143.82,
  models: [
    { model: 'gpt-5-codex', tokens: 980_000 },
    { model: 'gpt-5', tokens: 620_000 },
    { model: 'gpt-5-mini', tokens: 274_000 },
    { model: 'gpt-4.1-mini', tokens: 90_000 },
  ],
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

function parseModelUsageEntry(item: unknown): UsageModel | null {
  if (!item || typeof item !== 'object') return null
  const record = item as Record<string, unknown>
  const model =
    readString(record.model) || readString(record.name) || readString(record.id)
  const tokens =
    readNumber(record.tokens) ||
    readNumber(record.tokenCount) ||
    readNumber(record.totalTokens) ||
    readNumber(record.usage)
  if (!model || tokens <= 0) return null
  return { model, tokens }
}

function parseUsagePayload(payload: unknown): UsageMeterData | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>

  const modelsSource = Array.isArray(root.models)
    ? root.models
    : Array.isArray(root.usageByModel)
      ? root.usageByModel
      : Array.isArray(root.byModel)
        ? root.byModel
        : []
  const models = modelsSource
    .map(parseModelUsageEntry)
    .filter(function filterModel(entry): entry is UsageModel {
      return entry !== null
    })
    .sort(function sortByTokensDesc(a, b) {
      return b.tokens - a.tokens
    })

  const usagePercentRaw =
    readNumber(root.usagePercent) ||
    readNumber(root.totalUsagePercent) ||
    readNumber(root.percentUsed)
  const usageLimit =
    readNumber(root.usageLimitTokens) ||
    readNumber(root.tokenLimit) ||
    readNumber(root.totalAvailableTokens)
  const usageTotal =
    readNumber(root.usedTokens) ||
    readNumber(root.totalUsedTokens) ||
    models.reduce(function sumTokens(current, model) {
      return current + model.tokens
    }, 0)
  const usagePercentFromTotals =
    usageLimit > 0 ? (usageTotal / usageLimit) * 100 : 0
  const usagePercent = Math.min(
    100,
    Math.max(0, usagePercentRaw || usagePercentFromTotals),
  )
  const costTodayUsd =
    readNumber(root.costTodayUsd) ||
    readNumber(root.costToday) ||
    readNumber(root.todayCostUsd) ||
    readNumber(root.dailyCostUsd)

  const isValid = models.length > 0
  if (!isValid) return null

  return {
    usagePercent,
    costTodayUsd,
    models,
  }
}

async function fetchProviderUsage(): Promise<UsageMeterData | null> {
  try {
    const response = await fetch('/api/provider-usage')
    if (!response.ok) return null
    const json = (await response.json()) as UsageApiResponse
    return (
      parseUsagePayload(json.payload) ||
      parseUsagePayload(json.data) ||
      parseUsagePayload(json)
    )
  } catch {
    return null
  }
}

function formatTokens(tokens: number): string {
  return `${new Intl.NumberFormat().format(tokens)} tok`
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function UsageMeterWidget() {
  const usageQuery = useQuery({
    queryKey: ['dashboard', 'provider-usage'],
    queryFn: fetchProviderUsage,
    retry: false,
    refetchInterval: 30_000,
  })

  const isDemo = !usageQuery.data
  const data = usageQuery.data ?? demoUsageData
  const rows = data.models.slice(0, 4)
  const maxTokens = useMemo(function computeMaxTokens() {
    return rows.reduce(function reduceMax(currentMax, row) {
      return row.tokens > currentMax ? row.tokens : currentMax
    }, 0)
  }, [rows])

  const radius = 52
  const circumference = 2 * Math.PI * radius
  const progressOffset = circumference * (1 - data.usagePercent / 100)

  return (
    <DashboardGlassCard
      title="Usage Meter"
      description="Token utilization and per-model usage today."
      icon={ChartLineData02Icon}
      badge={isDemo ? 'Demo' : undefined}
      className="h-full"
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="flex flex-col items-center justify-center rounded-xl border border-primary-200 bg-primary-100/45 p-3">
          <div className="relative">
            <svg
              viewBox="0 0 140 140"
              className="size-36 -rotate-90"
              role="img"
              aria-label={`Token usage ${data.usagePercent}%`}
            >
              <circle
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                className="stroke-primary-200"
                strokeWidth="14"
              />
              <circle
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                className="stroke-amber-500"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={progressOffset}
              />
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-medium text-ink tabular-nums">
                {data.usagePercent}%
              </span>
              <span className="text-xs text-primary-600 text-pretty">used</span>
            </div>
          </div>
          <div className="mt-3 w-full rounded-lg border border-primary-200 bg-primary-50/80 px-3 py-2">
            <p className="text-xs text-primary-600 text-pretty">Cost Today</p>
            <p className="text-lg font-medium text-ink tabular-nums">
              {formatUsd(data.costTodayUsd)}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {rows.map(function mapRow(row, index) {
            const widthPercent = maxTokens > 0 ? (row.tokens / maxTokens) * 100 : 0

            return (
              <div key={row.model} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm text-primary-800 tabular-nums">
                    {row.model}
                  </span>
                  <span className="shrink-0 text-xs text-primary-600 tabular-nums">
                    {formatTokens(row.tokens)}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-primary-200/80">
                  <div
                    className={cn(
                      'h-full rounded-full bg-linear-to-r from-amber-600 to-amber-400 transition-[width] duration-500',
                      index > 1 && 'from-amber-500 to-amber-300',
                    )}
                    style={{ width: `${widthPercent}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </DashboardGlassCard>
  )
}
