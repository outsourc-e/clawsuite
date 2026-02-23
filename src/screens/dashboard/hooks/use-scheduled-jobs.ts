import { useQuery } from '@tanstack/react-query'

type CronApiJob = Record<string, unknown>

type CronApiResponse = {
  jobs?: Array<CronApiJob>
}

export type ScheduledJobItem = {
  id: string
  name: string
  schedule: string
  enabled: boolean
  nextRunAt: string | null
  lastRunAt: string | null
  nextRelative: string
  lastRelative: string
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function readBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'enabled', 'active', 'on'].includes(normalized)) return true
    if (['0', 'false', 'disabled', 'inactive', 'off'].includes(normalized)) return false
  }
  return fallback
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString()
    return null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 1_000_000_000_000 ? value : value * 1000
    return new Date(milliseconds).toISOString()
  }
  return null
}

function formatRelativePast(timestamp: string | null): string {
  if (!timestamp) return '—'
  const parsed = Date.parse(timestamp)
  if (Number.isNaN(parsed)) return '—'
  const diffMs = Date.now() - parsed
  if (diffMs <= 0) return 'just now'
  const totalMinutes = Math.floor(diffMs / 60_000)
  if (totalMinutes < 1) return 'just now'
  if (totalMinutes < 60) return `${totalMinutes}m ago`
  const hours = Math.floor(totalMinutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatRelativeFuture(timestamp: string | null): string {
  if (!timestamp) return '—'
  const parsed = Date.parse(timestamp)
  if (Number.isNaN(parsed)) return '—'
  const diffMs = parsed - Date.now()
  if (diffMs <= 0) return 'due'

  const totalMinutes = Math.floor(diffMs / 60_000)
  if (totalMinutes < 1) return '<1m'
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  return `${minutes}m`
}

function compareNextRun(a: ScheduledJobItem, b: ScheduledJobItem): number {
  const aTime = a.nextRunAt ? Date.parse(a.nextRunAt) : Number.POSITIVE_INFINITY
  const bTime = b.nextRunAt ? Date.parse(b.nextRunAt) : Number.POSITIVE_INFINITY
  return aTime - bTime
}

function mapJob(row: CronApiJob, index: number): ScheduledJobItem {
  const state = asRecord(row.state)
  const lastRun = asRecord(row.lastRun)
  const id = readString(row.id ?? row.jobId ?? row.key, `job-${index}`)
  const name = readString(row.name ?? row.title, `Cron Job ${index + 1}`)
  const schedule = readString(row.schedule ?? row.cron ?? row.expression, '* * * * *')
  const enabled = readBoolean(
    row.enabled ?? row.isEnabled ?? row.active,
    typeof row.status === 'string' ? row.status !== 'disabled' : true,
  )
  const nextRunAt = normalizeTimestamp(
    row.nextRunAt ?? row.nextRunTime ?? state.nextRunAt ?? state.nextRunAtMs,
  )
  const lastRunAt = normalizeTimestamp(
    (lastRun.startedAt ?? lastRun.started_at) ??
      row.lastRunAt ??
      row.lastRunTime ??
      state.lastRunAt ??
      state.lastRunAtMs ??
      state.lastRunAtMs,
  )

  return {
    id,
    name,
    schedule,
    enabled,
    nextRunAt,
    lastRunAt,
    nextRelative: formatRelativeFuture(nextRunAt),
    lastRelative: formatRelativePast(lastRunAt),
  }
}

async function fetchScheduledJobs(): Promise<Array<ScheduledJobItem>> {
  const response = await fetch('/api/cron')
  if (!response.ok) {
    throw new Error(`Failed to load cron jobs (${response.status})`)
  }
  const payload = (await response.json()) as CronApiResponse
  const rows = Array.isArray(payload.jobs) ? payload.jobs : []
  return rows.map(mapJob).sort(compareNextRun)
}

export function useScheduledJobs() {
  return useQuery({
    queryKey: ['dashboard', 'scheduled-jobs'],
    queryFn: fetchScheduledJobs,
    refetchInterval: 60_000,
  })
}
