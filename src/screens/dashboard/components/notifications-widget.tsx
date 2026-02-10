// Data source: GET /api/sessions — derives notifications from session start/update times.
// Distinct from Activity Log (activity-log-widget.tsx) which uses SSE /api/events for
// real-time gateway events. This widget focuses on session lifecycle events only.
import { Notification03Icon } from '@hugeicons/core-free-icons'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { DashboardGlassCard } from './dashboard-glass-card'
import type { DashboardNotification } from './dashboard-types'
import { cn } from '@/lib/utils'

type SessionsApiResponse = {
  sessions?: Array<Record<string, unknown>>
}

type NotificationsWidgetProps = {
  draggable?: boolean
  onRemove?: () => void
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 1_000_000_000_000) return value * 1000
    return value
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return Date.now()
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Math.max(0, Date.now() - timestamp)
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

async function fetchSessionsForNotifications(): Promise<Array<Record<string, unknown>>> {
  const response = await fetch('/api/sessions')
  if (!response.ok) throw new Error('Unable to load notifications')
  const payload = (await response.json()) as SessionsApiResponse
  return Array.isArray(payload.sessions) ? payload.sessions : []
}

function toNotifications(rows: Array<Record<string, unknown>>): Array<DashboardNotification> {
  return rows
    .map(function mapSession(session, index) {
      const key = readString(session.friendlyId) || readString(session.key) || `session-${index + 1}`
      const updatedAt = normalizeTimestamp(
        session.updatedAt ?? session.startedAt ?? session.createdAt,
      )
      const status = readString(session.status).toLowerCase()
      const kind = readString(session.kind).toLowerCase()
      const task = readString(session.task).toLowerCase()
      const label =
        readString(session.label) ||
        readString(session.title) ||
        readString(session.derivedTitle) ||
        key

      if (status.includes('error')) {
        return {
          id: `${key}-error-${index}`,
          label: 'Error',
          detail: `${label} reported an error`,
          occurredAt: updatedAt,
        }
      }

      if (kind.includes('cron') || task.includes('cron')) {
        return {
          id: `${key}-cron-${index}`,
          label: 'Cron',
          detail: `Cron job ran for ${label}`,
          occurredAt: updatedAt,
        }
      }

      return {
        id: `${key}-started-${index}`,
        label: 'Session',
        detail: `Session started: ${label}`,
        occurredAt: updatedAt,
      }
    })
    .sort(function sortByRecent(a, b) {
      return b.occurredAt - a.occurredAt
    })
}

export function NotificationsWidget({ draggable = false, onRemove }: NotificationsWidgetProps) {
  const notificationsQuery = useQuery({
    queryKey: ['dashboard', 'notifications'],
    queryFn: fetchSessionsForNotifications,
    refetchInterval: 20_000,
  })

  const notifications = useMemo(function buildNotifications() {
    const rows = Array.isArray(notificationsQuery.data) ? notificationsQuery.data : []
    return toNotifications(rows)
  }, [notificationsQuery.data])

  return (
    <DashboardGlassCard
      title="Notifications"
      description="Session lifecycle events — starts, stops, and errors."
      icon={Notification03Icon}
      draggable={draggable}
      onRemove={onRemove}
      className="h-full"
    >
      {notifications.length === 0 ? (
        <div className="flex h-[150px] items-center justify-center rounded-xl border border-primary-200 bg-primary-100/50 text-sm text-primary-600 text-pretty">
          No recent activity
        </div>
      ) : (
        <div className="max-h-[190px] space-y-1.5 overflow-y-auto pr-1">
          {notifications.map(function mapNotification(item) {
            return (
              <article
                key={item.id}
                className="rounded-lg border border-primary-200 bg-primary-50/80 px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'text-xs font-medium',
                      item.label === 'Error' ? 'text-red-600' : 'text-primary-700',
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="text-[11px] text-primary-600 tabular-nums">
                    {formatRelativeTime(item.occurredAt)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-primary-700 text-pretty">
                  {item.detail}
                </p>
              </article>
            )
          })}
        </div>
      )}
    </DashboardGlassCard>
  )
}
