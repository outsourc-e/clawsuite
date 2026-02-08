import { MoneyBag02Icon } from '@hugeicons/core-free-icons'
import { DashboardGlassCard } from './dashboard-glass-card'
import type { CostDay } from './dashboard-types'
import { cn } from '@/lib/utils'

type CostTrackerWidgetProps = {
  days: Array<CostDay>
}

type CostMetric = {
  label: string
  amountLabel: string
  changePercent: number
}

const DEMO_METRICS: Array<CostMetric> = [
  { label: 'Daily', amountLabel: '$143.82', changePercent: 8.2 },
  { label: 'Weekly', amountLabel: '$874.34', changePercent: 3.1 },
  { label: 'Monthly', amountLabel: '$3,942', changePercent: -1.4 },
]

const DEMO_SPARKLINE_VALUES = [132, 148, 124, 167, 144, 176, 153, 189, 171, 158, 182, 164, 196, 174]
const DEMO_SPARKLINE_LABELS = ['Feb 1', 'Feb 14']

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

function sumAmounts(days: Array<CostDay>): number {
  return days.reduce(function sum(total, day) {
    return total + day.amountUsd
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

function buildSparklinePath(values: Array<number>, width: number, height: number, inset = 8): string {
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

function getMetricsFromDays(days: Array<CostDay>): Array<CostMetric> {
  const orderedDays = [...days].sort(function sortByDate(left, right) {
    return new Date(left.dateIso).getTime() - new Date(right.dateIso).getTime()
  })

  const dailyCurrent = orderedDays.at(-1)?.amountUsd ?? 0
  const dailyPrevious = orderedDays.at(-2)?.amountUsd ?? 0

  const weeklyCurrentDays = orderedDays.slice(-7)
  const weeklyPreviousDays = orderedDays.slice(-14, -7)

  const monthlyCurrentDays = orderedDays.slice(-30)
  const monthlyPreviousDays = orderedDays.slice(-60, -30)

  const weeklyCurrent = sumAmounts(weeklyCurrentDays)
  const weeklyPrevious = sumAmounts(weeklyPreviousDays)

  const monthlyCurrent = sumAmounts(monthlyCurrentDays)
  const monthlyPrevious = sumAmounts(monthlyPreviousDays)

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

function getSparklineFromDays(days: Array<CostDay>): { values: Array<number>; labels: Array<string> } {
  const orderedDays = [...days].sort(function sortByDate(left, right) {
    return new Date(left.dateIso).getTime() - new Date(right.dateIso).getTime()
  })

  const selectedDays = orderedDays.slice(-14)
  if (selectedDays.length === 0) {
    return { values: DEMO_SPARKLINE_VALUES, labels: DEMO_SPARKLINE_LABELS }
  }

  const firstLabel = formatMonthDay(selectedDays[0].dateIso)
  const lastLabel = formatMonthDay(selectedDays[selectedDays.length - 1].dateIso)

  return {
    values: selectedDays.map(function mapValue(day) {
      return day.amountUsd
    }),
    labels: [firstLabel, lastLabel],
  }
}

export function CostTrackerWidget({ days }: CostTrackerWidgetProps) {
  const hasLiveData = days.length > 0
  const isDemo = !hasLiveData
  const metrics = hasLiveData ? getMetricsFromDays(days) : DEMO_METRICS
  const sparkline = hasLiveData ? getSparklineFromDays(days) : { values: DEMO_SPARKLINE_VALUES, labels: DEMO_SPARKLINE_LABELS }

  const chartWidth = 520
  const chartHeight = 120
  const pathData = buildSparklinePath(sparkline.values, chartWidth, chartHeight)

  return (
    <DashboardGlassCard
      title="Cost Tracker"
      description="Cost metrics and recent daily spend trend."
      icon={MoneyBag02Icon}
      badge={isDemo ? 'Demo' : undefined}
      className="h-full"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {metrics.map(function mapMetric(metric) {
            const isPositive = metric.changePercent >= 0

            return (
              <div
                key={metric.label}
                className="rounded-xl border border-primary-200 bg-primary-100/50 px-3 py-2.5"
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

        <div className="rounded-xl border border-primary-200 bg-primary-100/45 p-3">
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
        </div>
      </div>
    </DashboardGlassCard>
  )
}
