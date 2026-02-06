import { MoneyBag02Icon } from '@hugeicons/core-free-icons'
import { DashboardGlassCard } from './dashboard-glass-card'
import type { CostDay } from './dashboard-types'
import { cn } from '@/lib/utils'

type CostTrackerWidgetProps = {
  days: Array<CostDay>
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDayLabel(dateIso: string): string {
  const value = new Date(dateIso)
  if (Number.isNaN(value.getTime())) return 'N/A'
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(value)
}

export function CostTrackerWidget({ days }: CostTrackerWidgetProps) {
  const maxValue = days.reduce(function findMax(current, day) {
    return day.amountUsd > current ? day.amountUsd : current
  }, 0)
  const total = days.reduce(function sum(current, day) {
    return current + day.amountUsd
  }, 0)

  return (
    <DashboardGlassCard
      title="Cost Tracker"
      description="Daily spend for the last seven days."
      icon={MoneyBag02Icon}
      className="h-full"
    >
      <div className="grid grid-cols-7 items-end gap-2">
        {days.map(function mapDay(day) {
          const ratio = maxValue > 0 ? day.amountUsd / maxValue : 0
          const height = Math.max(16, Math.round(ratio * 120))

          return (
            <div key={day.dateIso} className="flex flex-col items-center gap-1">
              <span className="text-[11px] text-primary-600 tabular-nums">
                {formatUsd(day.amountUsd)}
              </span>
              <div className="flex h-32 w-full items-end">
                <div
                  className={cn(
                    'w-full rounded-t-md border border-primary-300/90 bg-linear-to-t from-primary-500 to-primary-300 transition-colors',
                    day.amountUsd === maxValue && 'from-primary-600 to-primary-400',
                  )}
                  style={{ height }}
                />
              </div>
              <span className="text-[11px] text-primary-600 tabular-nums">
                {formatDayLabel(day.dateIso)}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl border border-primary-200 bg-primary-100/50 px-3 py-2.5">
        <span className="text-sm text-primary-700 text-pretty">7-day total</span>
        <span className="text-base font-medium text-ink tabular-nums">{formatUsd(total)}</span>
      </div>
    </DashboardGlassCard>
  )
}
