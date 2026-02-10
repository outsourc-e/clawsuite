import { Activity01Icon } from '@hugeicons/core-free-icons'
import { useNavigate } from '@tanstack/react-router'
import { DashboardGlassCard } from './dashboard-glass-card'
import type { SystemStatus } from './dashboard-types'

type SystemStatusWidgetProps = {
  status: SystemStatus
  draggable?: boolean
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatCheckedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function SystemStatusWidget({
  status,
  draggable = false,
}: SystemStatusWidgetProps) {
  const navigate = useNavigate()

  function handleOpenDebugConsole() {
    void navigate({ to: '/debug' })
  }

  return (
    <DashboardGlassCard
      title="System Status"
      icon={Activity01Icon}
      draggable={draggable}
      className="h-full"
    >
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between rounded-lg border border-primary-200 bg-primary-100/40 px-2.5 py-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-primary-500">Gateway</span>
          <span className="inline-flex items-center gap-2">
            <span
              className={status.gateway.connected ? 'size-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]' : 'size-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]'}
              aria-hidden="true"
            />
            <span className="font-semibold text-ink">
              {status.gateway.connected ? 'Connected' : 'Disconnected'}
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-primary-200 bg-primary-100/40 px-2.5 py-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-primary-500">Model</span>
          <span className="font-semibold text-ink tabular-nums">
            {status.currentModel === 'sonnet' ? 'Sonnet (default)' : status.currentModel || '—'}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-primary-200 bg-primary-100/40 px-2.5 py-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-primary-500">Uptime</span>
          <span className="font-semibold text-ink tabular-nums">
            {status.uptimeSeconds > 0 ? formatUptime(status.uptimeSeconds) : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-primary-200 bg-primary-100/40 px-2.5 py-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-primary-500">Sessions</span>
          <span className="font-semibold text-ink tabular-nums">{status.sessionCount}</span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-[11px] text-primary-400 tabular-nums">
          Checked {formatCheckedAt(status.gateway.checkedAtIso)}
        </p>
        <button
          type="button"
          onClick={handleOpenDebugConsole}
          className="text-[11px] font-medium text-primary-400 underline-offset-2 hover:text-primary-600 hover:underline"
          aria-label="Open Debug Console"
        >
          Debug →
        </button>
      </div>
    </DashboardGlassCard>
  )
}
