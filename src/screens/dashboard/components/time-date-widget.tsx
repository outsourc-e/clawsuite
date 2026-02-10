import { Clock01Icon } from '@hugeicons/core-free-icons'
import { useEffect, useMemo, useState } from 'react'
import { DashboardGlassCard } from './dashboard-glass-card'
import { useDashboardSettings } from '../hooks/use-dashboard-settings'

function formatClock(date: Date, formatter: Intl.DateTimeFormat): string {
  return formatter.format(date)
}

function formatFullDate(date: Date, formatter: Intl.DateTimeFormat): string {
  return formatter.format(date)
}

type TimeDateWidgetProps = {
  draggable?: boolean
}

export function TimeDateWidget({ draggable = false }: TimeDateWidgetProps) {
  const { settings, update } = useDashboardSettings()
  const is12h = settings.clockFormat === '12h'

  const [now, setNow] = useState(function initializeNow() {
    return new Date()
  })

  const timezone = useMemo(function resolveTimezone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
  }, [])

  const clockFormatter = useMemo(function createClockFormatter() {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: is12h,
    })
  }, [is12h])

  const dateFormatter = useMemo(function createDateFormatter() {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }, [])

  useEffect(function setupClockInterval() {
    const intervalId = window.setInterval(function tick() {
      setNow(new Date())
    }, 1000)

    return function cleanupClockInterval() {
      window.clearInterval(intervalId)
    }
  }, [])

  return (
    <DashboardGlassCard
      title="Time & Date"
      description="Live local clock and calendar date."
      icon={Clock01Icon}
      draggable={draggable}
      className="h-full"
    >
      <div className="rounded-xl border border-primary-200 bg-primary-100/55 p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-primary-600 tabular-nums text-pretty">{timezone}</p>
          <button
            type="button"
            onClick={() => update({ clockFormat: is12h ? '24h' : '12h' })}
            className="rounded-md border border-primary-200 px-2 py-0.5 text-[11px] font-medium text-primary-600 hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-400"
            aria-label={`Switch to ${is12h ? '24-hour' : '12-hour'} format`}
            title={`Switch to ${is12h ? '24h' : '12h'} format`}
          >
            {is12h ? '12h' : '24h'}
          </button>
        </div>
        <p className="mt-2 text-4xl font-medium font-mono text-ink tabular-nums">
          {formatClock(now, clockFormatter)}
        </p>
        <p className="mt-2 text-sm font-medium text-primary-700 text-pretty">
          {formatFullDate(now, dateFormatter)}
        </p>
      </div>
    </DashboardGlassCard>
  )
}
