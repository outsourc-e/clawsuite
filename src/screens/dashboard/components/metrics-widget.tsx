import { RefreshIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { WidgetShell } from './widget-shell'
import type { DashboardIcon } from './dashboard-types'
import { cn } from '@/lib/utils'

type MetricAccent = 'cyan' | 'orange' | 'emerald' | 'violet' | 'purple' | 'red'
type TimeRange = '7d' | '14d' | '28d'

type MetricsWidgetProps = {
  title: string
  value: string | number
  subtitle: string
  icon: DashboardIcon
  accent?: MetricAccent
  isError?: boolean
  onRetry?: () => void
  className?: string
  trendPct?: number
  trendLabel?: string
  /** When true, upward trend is bad (amber) — used for Cost */
  trendInverted?: boolean
  description: string
  rawValue?: string
  /** Optional timeseries for micro bar chart */
  chartData?: Array<{ date: string; value: number }>
  /** Accent bar color class for the latest bar in the chart */
  chartAccentClass?: string
}

const METRIC_COLOR_CLASSES: Record<
  NonNullable<MetricsWidgetProps['accent']>,
  string
> = {
  cyan: 'border-neutral-800 bg-neutral-900',
  orange: 'border-neutral-800 bg-neutral-900',
  emerald: 'border-neutral-800 bg-neutral-900',
  violet: 'border-neutral-800 bg-neutral-900',
  purple: 'border-neutral-800 bg-neutral-900',
  red: 'border-neutral-800 bg-neutral-900',
}

const MOBILE_ACCENT_BORDER: Record<MetricAccent, string> = {
  cyan: 'border-neutral-800',
  orange: 'border-neutral-800',
  emerald: 'border-neutral-800',
  violet: 'border-neutral-800',
  purple: 'border-neutral-800',
  red: 'border-neutral-800',
}

const CHART_ACCENT_DEFAULTS: Record<MetricAccent, string> = {
  cyan: 'bg-blue-500',
  orange: 'bg-purple-500',
  emerald: 'bg-emerald-500',
  violet: 'bg-purple-500',
  purple: 'bg-purple-500',
  red: 'bg-blue-500',
}

function toMetricId(title: string): string {
  return `metric-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function formatMetricValue(value: string | number): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Intl.NumberFormat().format(value)
  }
  return `${value}`
}

function getTrendUi(
  trendPct?: number,
  inverted = false,
): { label: string; className: string } | null {
  if (typeof trendPct !== 'number' || Number.isNaN(trendPct)) return null
  const rounded = Math.round(Math.abs(trendPct))
  if (rounded <= 0) {
    return {
      label: '0%',
      className: 'text-neutral-400',
    }
  }

  const isUp = trendPct > 0
  // For normal metrics: up = green; for inverted (cost): up = amber
  const isGood = inverted ? !isUp : isUp

  return {
    label: `${isUp ? '↑' : '↓'} ${rounded}%`,
    className: isGood
      ? 'text-emerald-400'
      : 'text-red-400',
  }
}

// ─── Micro Bar Chart ──────────────────────────────────────────────────────────

type MicroBarChartProps = {
  data: Array<{ date: string; value: number }>
  days: number
  accentClass: string
}

function MicroBarChart({ data, days, accentClass }: MicroBarChartProps) {
  const slice = data.slice(-days)
  if (slice.length === 0) return null
  const maxVal = Math.max(...slice.map((d) => d.value), 1)

  return (
    <div className="flex items-end gap-[2px]" style={{ height: 28 }}>
      {slice.map((point, i) => {
        const rawHeightPx = Math.round((point.value / maxVal) * 28)
        const heightPx = point.value > 0 ? Math.max(2, rawHeightPx) : 0
        const isLatest = i === slice.length - 1
        return (
          <div
            key={point.date}
            className={cn(
              'flex-1 rounded-sm transition-[height] duration-300',
              isLatest
                ? accentClass
                : 'bg-neutral-800',
              point.value === 0 && 'opacity-40',
            )}
            style={{ height: `${heightPx}px` }}
            title={`${point.date}: ${point.value}`}
          />
        )
      })}
    </div>
  )
}

// ─── Time range pills ─────────────────────────────────────────────────────────

type TimeRangePillsProps = {
  value: TimeRange
  onChange: (r: TimeRange) => void
}

function TimeRangePills({ value, onChange }: TimeRangePillsProps) {
  return (
    <div className="flex items-center gap-0.5">
      {(['7d', '14d', '28d'] as const).map((r) => (
        <button
          key={r}
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange(r) }}
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase transition-colors',
            value === r
              ? 'bg-neutral-800 text-neutral-100'
              : 'text-neutral-500 hover:text-neutral-300',
          )}
        >
          {r.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

// ─── Mobile card ──────────────────────────────────────────────────────────────

type MetricCardProps = {
  label: string
  value: string | number
  trendPct?: number
  trendLabel?: string
  trendInverted?: boolean
  accent: MetricAccent
  description: string
  rawValue?: string
  chartData?: Array<{ date: string; value: number }>
  chartAccentClass?: string
  onPress: () => void
  anchorRef: RefObject<HTMLButtonElement | null>
}

function MetricCard({
  label,
  value,
  trendPct,
  trendLabel,
  trendInverted,
  accent,
  description,
  rawValue,
  chartData,
  chartAccentClass,
  onPress,
  anchorRef,
}: MetricCardProps) {
  const trend = getTrendUi(trendPct, trendInverted)

  return (
    <button
      type="button"
      ref={anchorRef}
      onClick={onPress}
      className={cn(
        'relative flex min-h-[92px] w-full flex-col justify-between rounded-xl border bg-neutral-900 p-4 text-left shadow-sm transition-transform duration-150 active:scale-[0.97]',
        MOBILE_ACCENT_BORDER[accent],
      )}
      aria-label={`${label} details`}
      aria-description={`${description}${rawValue ? ` Raw value: ${rawValue}` : ''}`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </p>

      <p className="mt-1 truncate font-mono text-2xl sm:text-3xl font-semibold leading-none tabular-nums text-neutral-100">
        {formatMetricValue(value)}
      </p>

      {chartData && chartData.length > 0 ? (
        <div className="mt-2">
          <MicroBarChart
            data={chartData}
            days={7}
            accentClass={chartAccentClass ?? CHART_ACCENT_DEFAULTS[accent]}
          />
        </div>
      ) : (
        <div className="mt-2 flex items-end gap-2">
          {trend ? (
            <p className={cn('truncate text-xs font-medium', trend.className)}>
              {trend.label}
              {trendLabel ? ` ${trendLabel}` : ''}
            </p>
          ) : null}
          <span className="ml-auto text-lg leading-none text-neutral-500">
            ›
          </span>
        </div>
      )}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MetricsWidget({
  title,
  value,
  subtitle,
  icon,
  accent = 'cyan',
  isError = false,
  onRetry,
  className,
  trendPct,
  trendLabel,
  trendInverted = false,
  description,
  rawValue,
  chartData,
  chartAccentClass,
}: MetricsWidgetProps) {
  const metricId = useMemo(() => toMetricId(title), [title])
  const cardRef = useRef<HTMLButtonElement>(null)
  const [selectedMetricId, setSelectedMetricId] = useState<string | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('7d')
  const mobilePopoverOpen = selectedMetricId === metricId

  const days = timeRange === '7d' ? 7 : timeRange === '14d' ? 14 : 28

  const popoverTop = useMemo(() => {
    if (!anchorRect || typeof window === 'undefined') return 96
    return Math.max(96, Math.min(window.innerHeight - 220, anchorRect.bottom + 8))
  }, [anchorRect])

  useEffect(() => {
    if (!mobilePopoverOpen) return

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSelectedMetricId(null)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [mobilePopoverOpen])

  const openMobilePopover = () => {
    setAnchorRect(cardRef.current?.getBoundingClientRect() ?? null)
    setSelectedMetricId(metricId)
  }

  const closeMobilePopover = () => {
    setSelectedMetricId(null)
  }

  const displayValue = isError ? '—' : value
  const rawMetricValue = rawValue ?? formatMetricValue(value)
  const metricDescription = description
  const accentBarClass = chartAccentClass ?? CHART_ACCENT_DEFAULTS[accent]
  const trend = getTrendUi(trendPct, trendInverted)

  return (
    <>
      {/* Mobile */}
      <div className={cn('md:hidden', className)}>
        <MetricCard
          label={title}
          value={displayValue}
          trendPct={trendPct}
          trendLabel={trendLabel}
          trendInverted={trendInverted}
          accent={accent}
          description={metricDescription}
          rawValue={rawMetricValue}
          chartData={chartData}
          chartAccentClass={chartAccentClass}
          onPress={openMobilePopover}
          anchorRef={cardRef}
        />

        {mobilePopoverOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-50 bg-black/20 md:hidden"
              onClick={closeMobilePopover}
              aria-label={`Close ${title} details`}
            />
            <div
              className="fixed left-4 right-4 top-24 z-50 rounded-xl border border-neutral-800 bg-neutral-900 p-4 shadow-lg md:hidden"
              style={{ top: `${popoverTop}px` }}
            >
              <button
                type="button"
                onClick={closeMobilePopover}
                className="absolute right-3 top-2 text-xl leading-none text-neutral-500"
                aria-label={`Dismiss ${title} details`}
              >
                ×
              </button>
              <p className="pr-8 text-sm font-semibold text-neutral-100">
                {title}
              </p>
              <p className="mt-1 text-sm text-neutral-400">
                {metricDescription}
              </p>
              <p className="mt-3 text-sm text-neutral-300">
                Raw value: <span className="font-mono font-medium tabular-nums">{rawMetricValue}</span>
              </p>
              {isError && onRetry ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRetry()
                    closeMobilePopover()
                  }}
                  className="mt-3 rounded-lg border border-red-900 bg-red-950/40 px-2 py-1 text-xs font-medium text-red-300"
                >
                  Retry
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {/* Desktop */}
      <WidgetShell
        size="small"
        title={title}
        icon={icon}
        className={cn(
          'hidden h-full rounded-xl border bg-neutral-900 p-4 sm:p-5 md:flex [&_h2]:text-[11px] [&_h2]:font-medium [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:text-neutral-500 [&_svg]:text-neutral-500',
          METRIC_COLOR_CLASSES[accent],
          className,
        )}
        action={
          isError && onRetry ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onRetry()
              }}
              className="inline-flex size-5 items-center justify-center rounded-md text-red-400 transition-colors hover:bg-red-950/40"
              aria-label={`Retry ${title}`}
              title={`Retry ${title}`}
            >
              <HugeiconsIcon icon={RefreshIcon} size={12} strokeWidth={1.5} />
            </button>
          ) : chartData && chartData.length > 0 ? (
            <TimeRangePills value={timeRange} onChange={setTimeRange} />
          ) : undefined
        }
      >
        <div className="flex h-full flex-col justify-between">
          <div>
            <p
              className={cn(
                'truncate font-mono text-2xl font-semibold leading-none tabular-nums',
                isError ? 'text-neutral-500' : 'text-neutral-100',
              )}
            >
              {isError ? '—' : value}
            </p>
            <p className="mt-1 text-[11px] leading-tight text-neutral-400">
              {isError ? value : subtitle}
            </p>
            {trend && !chartData ? (
              <p className={cn('mt-1.5 text-[11px] font-medium', trend.className)}>
                {trend.label}
                {trendLabel ? ` ${trendLabel}` : ''}
              </p>
            ) : null}
          </div>

          {chartData && chartData.length > 0 ? (
            <div className="mt-2">
              <MicroBarChart
                data={chartData}
                days={days}
                accentClass={accentBarClass}
              />
              {trend ? (
                <p className={cn('mt-1 text-[11px] font-medium', trend.className)}>
                  {trend.label}
                  {trendLabel ? ` ${trendLabel}` : ''}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </WidgetShell>
    </>
  )
}
