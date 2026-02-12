// Data source: GET /api/cost — billing period spend with daily timeseries
// Provider usage: GET /api/provider-usage — real-time usage from connected providers
import { MoneyBag02Icon } from '@hugeicons/core-free-icons'
import { useQuery } from '@tanstack/react-query'
import { DashboardGlassCard } from './dashboard-glass-card'
import { cn } from '@/lib/utils'

type UsageLine = {
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
  lines: UsageLine[]
  updatedAt: number
}

type ProviderUsageResponse = {
  ok: boolean
  updatedAt: number
  providers: ProviderUsageResult[]
}

type CostMetric = {
  label: string
  amountLabel: string
  changePercent: number
}

type CostPoint = {
  date: string
  amount: number
}

type CostTrackerData = {
  totalAmount: number
  points: Array<CostPoint>
}

type CostApiResponse = {
  ok?: boolean
  cost?: unknown
  unavailable?: boolean
  error?: unknown
}

type CostQueryResult =
  | { kind: 'ok'; data: CostTrackerData }
  | { kind: 'unavailable'; message: string }
  | { kind: 'error'; message: string }

type CostTrackerWidgetProps = {
  draggable?: boolean
  onRemove?: () => void
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

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>
  return {}
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatMonthDay(dateIso: string): string {
  const value = new Date(dateIso)
  if (Number.isNaN(value.getTime())) return 'N/A'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value)
}

function sumAmounts(points: Array<CostPoint>): number {
  return points.reduce(function sum(total, point) {
    return total + point.amount
  }, 0)
}

function calculateChange(current: number, previous: number): number {
  if (previous <= 0) return 0
  return ((current - previous) / previous) * 100
}

function formatChangeLabel(changePercent: number): string {
  const sign = changePercent > 0 ? '+' : ''
  return `${sign}${changePercent.toFixed(1)}%`
}

function buildSparklinePath(
  values: Array<number>,
  width: number,
  height: number,
  inset = 8,
): string {
  if (values.length === 0) return ''

  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const drawableWidth = width - inset * 2
  const drawableHeight = height - inset * 2
  const range = maxValue - minValue || 1

  return values
    .map(function mapPoint(value, index) {
      const x = inset + (index / Math.max(values.length - 1, 1)) * drawableWidth
      const normalized = (value - minValue) / range
      const y = inset + (1 - normalized) * drawableHeight
      const command = index === 0 ? 'M' : 'L'
      return `${command} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function parseCostPayload(payload: unknown): CostTrackerData {
  const root = toRecord(payload)
  const total = toRecord(root.total)
  const timeseries = Array.isArray(root.timeseries) ? root.timeseries : []
  const points = timeseries
    .map(function mapPoint(entry) {
      const row = toRecord(entry)
      return {
        date: readString(row.date),
        amount: readNumber(row.amount),
      }
    })
    .filter(function hasDate(point) {
      return point.date.length > 0
    })
    .sort(function sortByDate(left, right) {
      return new Date(left.date).getTime() - new Date(right.date).getTime()
    })

  const totalAmountRaw = readNumber(total.amount)
  const totalAmount =
    totalAmountRaw > 0 ? totalAmountRaw : sumAmounts(points)

  return {
    totalAmount,
    points,
  }
}

function parseErrorMessage(payload: CostApiResponse): string {
  const message = readString(payload.error)
  return message.length > 0 ? message : 'Cost unavailable'
}

async function fetchCost(): Promise<CostQueryResult> {
  try {
    const response = await fetch('/api/cost')
    const payload = (await response
      .json()
      .catch(() => ({}))) as CostApiResponse

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
      data: parseCostPayload(payload.cost),
    }
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Cost unavailable',
    }
  }
}

function getMetricsFromPoints(points: Array<CostPoint>): Array<CostMetric> {
  if (points.length === 0) {
    return [
      { label: 'Daily', amountLabel: formatUsd(0), changePercent: 0 },
      { label: 'Weekly', amountLabel: formatUsd(0), changePercent: 0 },
      { label: 'Monthly', amountLabel: formatUsd(0), changePercent: 0 },
    ]
  }

  const dailyCurrent = points.at(-1)?.amount ?? 0
  const dailyPrevious = points.at(-2)?.amount ?? 0

  const weeklyCurrentPoints = points.slice(-7)
  const weeklyPreviousPoints = points.slice(-14, -7)

  const monthlyCurrentPoints = points.slice(-30)
  const monthlyPreviousPoints = points.slice(-60, -30)

  const weeklyCurrent = sumAmounts(weeklyCurrentPoints)
  const weeklyPrevious = sumAmounts(weeklyPreviousPoints)

  const monthlyCurrent = sumAmounts(monthlyCurrentPoints)
  const monthlyPrevious = sumAmounts(monthlyPreviousPoints)

  return [
    {
      label: 'Daily',
      amountLabel: formatUsd(dailyCurrent),
      changePercent: calculateChange(dailyCurrent, dailyPrevious),
    },
    {
      label: 'Weekly',
      amountLabel: formatUsd(weeklyCurrent),
      changePercent: calculateChange(weeklyCurrent, weeklyPrevious),
    },
    {
      label: 'Monthly',
      amountLabel: formatUsd(monthlyCurrent),
      changePercent: calculateChange(monthlyCurrent, monthlyPrevious),
    },
  ]
}

function getSparklinePoints(points: Array<CostPoint>): {
  values: Array<number>
  labels: Array<string>
} {
  if (points.length === 0) {
    return {
      values: [],
      labels: ['N/A', 'N/A'],
    }
  }

  const selected = points.slice(-14)
  const firstLabel = formatMonthDay(selected[0]?.date ?? '')
  const lastLabel = formatMonthDay(selected[selected.length - 1]?.date ?? '')

  return {
    values: selected.map(function mapValue(point) {
      return point.amount
    }),
    labels: [firstLabel, lastLabel],
  }
}

export function CostTrackerWidget({ draggable = false, onRemove }: CostTrackerWidgetProps) {
  const costQuery = useQuery({
    queryKey: ['dashboard', 'cost'],
    queryFn: fetchCost,
    retry: false,
    refetchInterval: 30_000,
  })

  const providerQuery = useQuery({
    queryKey: ['dashboard', 'provider-usage'],
    queryFn: async (): Promise<ProviderUsageResponse | null> => {
      try {
        const res = await fetch('/api/provider-usage')
        if (!res.ok) return null
        return (await res.json()) as ProviderUsageResponse
      } catch {
        return null
      }
    },
    retry: false,
    refetchInterval: 30_000,
  })

  const providers = providerQuery.data?.providers ?? []

  const queryResult = costQuery.data
  const costData = queryResult?.kind === 'ok' ? queryResult.data : null
  const metrics = getMetricsFromPoints(costData?.points ?? [])
  const sparkline = getSparklinePoints(costData?.points ?? [])

  const chartWidth = 520
  const chartHeight = 120
  const pathData = buildSparklinePath(sparkline.values, chartWidth, chartHeight)

  return (
    <DashboardGlassCard
      title="Cost Tracker"
      tier="primary"
      description=""
      icon={MoneyBag02Icon}
      draggable={draggable}
      onRemove={onRemove}
      className="h-full"
    >
      {queryResult?.kind === 'unavailable' ? (
        <div className="rounded-lg border border-primary-200 bg-primary-100/40 p-4 text-sm text-primary-700 text-pretty">
          {queryResult.message}
        </div>
      ) : queryResult?.kind === 'error' ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400 text-pretty">
          {queryResult.message}
        </div>
      ) : !costData ? (
        <div className="rounded-lg border border-primary-200 bg-primary-100/40 p-4 text-sm text-primary-700 text-pretty">
          Loading cost data...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-primary-200 bg-primary-100/40 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-primary-500">Period Spend</p>
            <p className="text-2xl font-bold text-ink tabular-nums">
              {formatUsd(costData.totalAmount)}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {metrics.map(function mapMetric(metric) {
              const isPositive = metric.changePercent >= 0

              return (
                <div
                  key={metric.label}
                  className="rounded-lg border border-primary-200 bg-primary-100/40 px-3 py-2.5"
                >
                  <p className="text-[11px] text-primary-600 text-balance">{metric.label}</p>
                  <p className="mt-1 text-lg font-medium text-ink tabular-nums">{metric.amountLabel}</p>
                  <span
                    className={cn(
                      'mt-2 inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums',
                      isPositive
                        ? 'border-green-500/30 bg-green-500/12 text-green-600'
                        : 'border-red-500/30 bg-red-500/12 text-red-600',
                    )}
                  >
                    {formatChangeLabel(metric.changePercent)}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="rounded-lg border border-primary-200 bg-primary-100/40 p-3">
            {sparkline.values.length === 0 ? (
              <div className="h-28 rounded-lg border border-primary-200 bg-primary-50/60 p-3 text-sm text-primary-700 text-pretty">
                No cost history reported by the Gateway yet.
              </div>
            ) : (
              <>
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="h-28 w-full"
                  role="img"
                  aria-label="Daily cost trend"
                  preserveAspectRatio="none"
                >
                  <path
                    d={pathData}
                    fill="none"
                    className="stroke-amber-500"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="mt-1 flex items-center justify-between text-[11px] text-primary-600 tabular-nums">
                  <span className="text-pretty">{sparkline.labels[0]}</span>
                  <span className="text-pretty">{sparkline.labels[1]}</span>
                </div>
              </>
            )}
          </div>

          {/* Provider Usage */}
          {providers.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-primary-500">
                Providers
              </p>
              {providers.map((provider) => (
                <div
                  key={provider.provider}
                  className="rounded-lg border border-primary-200 bg-primary-100/40 px-3 py-2.5"
                >
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
                    <div className="mt-2 space-y-2">
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </DashboardGlassCard>
  )
}
