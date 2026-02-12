// Data source: GET /api/usage — all-time token counts + cost breakdown by provider
// Note: This shows ALL-TIME totals. Cost Tracker (cost-tracker-widget.tsx) uses
// GET /api/cost which shows BILLING PERIOD spend with daily timeseries.
// The two totals will differ — this is expected, not a bug.
import { ChartLineData02Icon } from '@hugeicons/core-free-icons'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { DashboardGlassCard } from './dashboard-glass-card'
import { cn } from '@/lib/utils'

type ProviderUsageLine = {
  type: 'progress' | 'text' | 'badge'
  label: string
  used?: number
  limit?: number
  format?: 'percent' | 'dollars' | 'tokens'
  value?: string
  color?: string
  resetsAt?: string
}

type ProviderUsageResult = {
  provider: string
  displayName: string
  status: 'ok' | 'missing_credentials' | 'auth_expired' | 'error'
  message?: string
  plan?: string
  lines: Array<ProviderUsageLine>
  updatedAt: number
}

type ProviderUsageApiResponse = {
  ok: boolean
  updatedAt: number
  providers: Array<ProviderUsageResult>
}

type ProviderUsage = {
  provider: string
  total: number
  inputOutput: number
  cached: number
  cost: number
  directCost: number
  percentUsed?: number
}

type UsageMeterData = {
  usagePercent?: number
  totalCost: number
  totalDirectCost: number
  totalUsage: number
  totalInputOutput: number
  totalCached: number
  providers: Array<ProviderUsage>
}

type UsageApiResponse = {
  ok?: boolean
  usage?: unknown
  unavailable?: boolean
  error?: unknown
}

type UsageQueryResult =
  | { kind: 'ok'; data: UsageMeterData }
  | { kind: 'unavailable'; message: string }
  | { kind: 'error'; message: string }

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

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>
  return {}
}

function parseProviderUsage(
  provider: string,
  value: unknown,
): ProviderUsage {
  const source = toRecord(value)
  const input = readNumber(source.input)
  const output = readNumber(source.output)
  const cacheRead = readNumber(source.cacheRead)
  const cacheWrite = readNumber(source.cacheWrite)
  const inputOutput = input + output
  const cached = cacheRead + cacheWrite
  const inputCost = readNumber(source.inputCost)
  const outputCost = readNumber(source.outputCost)
  return {
    provider,
    total: readNumber(source.total),
    inputOutput,
    cached,
    cost: readNumber(source.cost),
    directCost: inputCost + outputCost,
    percentUsed: readNumber(source.percentUsed) || undefined,
  }
}

function parseUsagePayload(payload: unknown): UsageMeterData {
  const root = toRecord(payload)
  const totalSource = toRecord(root.total)
  const byProviderSource = toRecord(root.byProvider)

  const providers = Object.entries(byProviderSource)
    .map(function mapProvider([provider, value]) {
      return parseProviderUsage(provider, value)
    })
    .sort(function sortProvidersByUsage(left, right) {
      return right.total - left.total
    })

  const totalUsageRaw = readNumber(totalSource.total)
  const totalUsage =
    totalUsageRaw > 0
      ? totalUsageRaw
      : providers.reduce(function sumUsage(total, provider) {
          return total + provider.total
        }, 0)

  const totalInputOutput = providers.reduce(function sumIO(total, provider) {
    return total + provider.inputOutput
  }, 0)

  const totalCached = providers.reduce(function sumCached(total, provider) {
    return total + provider.cached
  }, 0)

  const totalCostRaw = readNumber(totalSource.cost)
  const totalCost =
    totalCostRaw > 0
      ? totalCostRaw
      : providers.reduce(function sumCost(total, provider) {
          return total + provider.cost
        }, 0)

  const totalDirectCost = providers.reduce(function sumDirectCost(total, provider) {
    return total + provider.directCost
  }, 0)

  const totalPercent = readNumber(totalSource.percentUsed)
  const maxProviderPercent = providers.reduce(function readMaxPercent(
    currentMax,
    provider,
  ) {
    if (provider.percentUsed === undefined) return currentMax
    return provider.percentUsed > currentMax ? provider.percentUsed : currentMax
  }, 0)
  const usagePercent =
    totalPercent > 0
      ? totalPercent
      : maxProviderPercent > 0
        ? maxProviderPercent
        : undefined

  return {
    usagePercent,
    totalCost,
    totalDirectCost,
    totalUsage,
    totalInputOutput,
    totalCached,
    providers,
  }
}

function parseErrorMessage(payload: UsageApiResponse): string {
  const message = readString(payload.error)
  return message.length > 0 ? message : 'Usage unavailable'
}

async function fetchUsage(): Promise<UsageQueryResult> {
  try {
    const response = await fetch('/api/usage')
    const payload = (await response
      .json()
      .catch(() => ({}))) as UsageApiResponse

    if (response.status === 501 || payload.unavailable) {
      return {
        kind: 'unavailable',
        message: 'Unavailable on this Gateway version',
      }
    }

    if (!response.ok || payload.ok === false) {
      return {
        kind: 'error',
        message: parseErrorMessage(payload),
      }
    }

    return {
      kind: 'ok',
      data: parseUsagePayload(payload.usage),
    }
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Usage unavailable',
    }
  }
}

function formatTokens(tokens: number): string {
  return `${new Intl.NumberFormat().format(tokens)}`
}

function formatCompactTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return `${tokens}`
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

type UsageMeterWidgetProps = {
  draggable?: boolean
  onRemove?: () => void
}

export function UsageMeterWidget({ draggable = false, onRemove }: UsageMeterWidgetProps) {
  const [view, setView] = useState<'gateway' | 'providers'>('gateway')

  const usageQuery = useQuery({
    queryKey: ['dashboard', 'usage'],
    queryFn: fetchUsage,
    retry: false,
    refetchInterval: 30_000,
  })

  const providerQuery = useQuery({
    queryKey: ['dashboard', 'provider-usage'],
    queryFn: async (): Promise<ProviderUsageApiResponse | null> => {
      try {
        const res = await fetch('/api/provider-usage')
        if (!res.ok) return null
        return (await res.json()) as ProviderUsageApiResponse
      } catch {
        return null
      }
    },
    retry: false,
    refetchInterval: 30_000,
  })

  const activeProviders = providerQuery.data?.providers ?? []

  const [loadingTimedOut, setLoadingTimedOut] = useState(false)
  useEffect(() => {
    if (usageQuery.data) { setLoadingTimedOut(false); return }
    const timer = setTimeout(() => setLoadingTimedOut(true), 5000)
    return () => clearTimeout(timer)
  }, [usageQuery.data])

  const queryResult = usageQuery.data
  const usageData = queryResult?.kind === 'ok' ? queryResult.data : null
  const rows = (usageData?.providers ?? []).slice(0, 4)

  const maxUsage = useMemo(function computeMaxUsage() {
    return rows.reduce(function reduceMax(currentMax, row) {
      return row.inputOutput > currentMax ? row.inputOutput : currentMax
    }, 0)
  }, [rows])

  const radius = 52
  const circumference = 2 * Math.PI * radius
  const usagePercent = usageData?.usagePercent ?? 0
  const progressOffset = circumference * (1 - usagePercent / 100)

  return (
    <DashboardGlassCard
      title="Usage Meter"
      description=""
      icon={ChartLineData02Icon}
      draggable={draggable}
      onRemove={onRemove}
      className="h-full"
      titleAccessory={
        <div className="flex items-center gap-0.5 rounded-full border border-primary-100 bg-primary-50 p-0.5 text-[10px]">
          {(['gateway', 'providers'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={(e) => { e.stopPropagation(); setView(tab) }}
              className={cn(
                'rounded-full px-2 py-0.5 font-medium transition',
                view === tab
                  ? 'bg-primary-50 text-primary-900 shadow-sm dark:bg-primary-100 dark:text-primary-900'
                  : 'text-primary-500 hover:text-primary-700',
              )}
            >
              {tab === 'gateway' ? 'Gateway' : 'Providers'}
            </button>
          ))}
        </div>
      }
    >
      {view === 'providers' ? (
        <div className="space-y-3">
          {activeProviders.length === 0 ? (
            <div className="rounded-xl border border-primary-200 bg-primary-100/45 p-4 text-center">
              <p className="text-[13px] font-medium text-primary-700">No providers connected</p>
              <p className="mt-1 text-[11px] text-primary-500">Run `claude` to authenticate or set API keys.</p>
            </div>
          ) : (
            activeProviders.map((provider) => (
              <div key={provider.provider} className="rounded-xl border border-primary-200 bg-primary-100/45 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium text-ink">{provider.displayName}</span>
                    {provider.plan && (
                      <span className="rounded-full bg-primary-200/60 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">
                        {provider.plan}
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                      provider.status === 'ok'
                        ? 'bg-emerald-100 text-emerald-700'
                        : provider.status === 'auth_expired'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700',
                    )}
                  >
                    {provider.status === 'ok' ? 'Connected' : provider.status === 'auth_expired' ? 'Expired' : 'Error'}
                  </span>
                </div>
                {provider.status === 'ok' && provider.lines.length > 0 && (
                  <div className="mt-2.5 space-y-2">
                    {provider.lines.map((line, i) => {
                      if (line.type === 'progress' && line.used !== undefined && line.limit !== undefined) {
                        const pct = Math.min((line.used / line.limit) * 100, 100)
                        const barColor =
                          pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-emerald-500'
                        return (
                          <div key={`${line.label}-${i}`}>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-primary-600">{line.label}</span>
                              <span className="font-medium text-ink tabular-nums">
                                {line.format === 'dollars'
                                  ? `$${line.used.toFixed(2)} / $${line.limit.toFixed(2)}`
                                  : `${Math.round(line.used)}%`}
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 w-full rounded-full bg-primary-200/60">
                              <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                            </div>
                            {line.resetsAt && (
                              <div className="mt-0.5 text-[10px] text-primary-400">
                                resets {new Date(line.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                          </div>
                        )
                      }
                      if (line.type === 'badge') {
                        return (
                          <div key={`${line.label}-${i}`} className="flex items-center gap-1.5 text-[11px]">
                            <span className="text-primary-600">{line.label}</span>
                            <span className="rounded-full border border-primary-200 bg-primary-100/70 px-1.5 py-0.5 text-[10px] font-medium text-primary-700 dark:border-primary-300 dark:bg-primary-200/50 dark:text-primary-800">
                              {line.value ?? '—'}
                            </span>
                          </div>
                        )
                      }
                      return (
                        <div key={`${line.label}-${i}`} className="flex items-center justify-between text-[11px]">
                          <span className="text-primary-600">{line.label}</span>
                          <span className="font-medium text-ink">{line.value ?? '—'}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
                {provider.status !== 'ok' && provider.message && (
                  <p className="mt-2 text-[11px] text-primary-500">{provider.message}</p>
                )}
              </div>
            ))
          )}
        </div>
      ) : queryResult?.kind === 'unavailable' ? (
        <div className="rounded-xl border border-primary-200 bg-primary-100/45 p-4 text-sm text-primary-700 text-pretty">
          {queryResult.message}
        </div>
      ) : queryResult?.kind === 'error' ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400 text-pretty">
          {queryResult.message}
        </div>
      ) : !usageData ? (
        <div className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-100/45 p-4">
          {loadingTimedOut ? (
            <>
              <span className="text-[13px] text-primary-500">No usage data available</span>
              <button
                type="button"
                onClick={() => { setLoadingTimedOut(false); usageQuery.refetch() }}
                className="text-[13px] font-medium text-primary-600 underline hover:text-ink"
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600" />
              <span className="text-[13px] text-primary-500">Loading usage data…</span>
            </>
          )}
        </div>
      ) : usageData.providers.length === 0 ? (
        <div className="rounded-xl border border-primary-200 bg-primary-100/45 p-4 text-sm text-primary-700 text-pretty">
          No usage data reported by the Gateway yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="flex flex-col items-center justify-center rounded-xl border border-primary-200 bg-primary-100/45 p-3">
            <div className="relative">
              <svg
                viewBox="0 0 140 140"
                className="size-36 -rotate-90"
                role="img"
                aria-label={
                  usageData.usagePercent !== undefined
                    ? `Provider usage ${Math.round(usageData.usagePercent)}%`
                    : `Total usage ${formatTokens(usageData.totalUsage)}`
                }
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
                  className="stroke-primary-500"
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={progressOffset}
                />
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                {usageData.usagePercent !== undefined ? (
                  <span className="text-3xl font-medium text-ink tabular-nums">
                    {Math.round(usageData.usagePercent)}%
                  </span>
                ) : (
                  <span className="text-sm font-medium text-ink tabular-nums">
                    {formatCompactTokens(usageData.totalInputOutput)}
                  </span>
                )}
                <span className="text-xs text-primary-600 text-pretty">
                  {usageData.usagePercent !== undefined ? 'used' : 'in/out tokens'}
                </span>
              </div>
            </div>
            <div className="mt-3 w-full space-y-1.5">
              <div className="rounded-lg border border-primary-200 bg-primary-50/80 px-3 py-2">
                <p className="text-xs text-primary-600 text-pretty">Direct Cost</p>
                <p className="text-lg font-medium text-ink tabular-nums">
                  {formatUsd(usageData.totalDirectCost)}
                </p>
              </div>
              <div className="rounded-lg border border-primary-200 bg-primary-50/60 px-3 py-1.5">
                <p className="text-[11px] text-primary-500 text-pretty">+ Cache Cost</p>
                <p className="text-sm text-primary-600 tabular-nums">
                  {formatUsd(usageData.totalCost - usageData.totalDirectCost)}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {rows.map(function mapRow(row, index) {
              const widthPercent = maxUsage > 0 ? (row.inputOutput / maxUsage) * 100 : 0

              return (
                <div key={row.provider} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm text-primary-800 tabular-nums">
                      {row.provider}
                    </span>
                    <span className="shrink-0 text-xs text-primary-600 tabular-nums">
                      {formatCompactTokens(row.inputOutput)}
                      {row.cached > 0 ? (
                        <span className="ml-1 text-primary-400" title={`${formatTokens(row.cached)} cached`}>
                          +cache
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-primary-200/80">
                    <div
                      className={cn(
                        'h-full rounded-full bg-primary-500 transition-[width] duration-500',
                        index > 1 && 'bg-primary-400',
                      )}
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </DashboardGlassCard>
  )
}
