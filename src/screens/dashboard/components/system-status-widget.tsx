import { Activity01Icon } from '@hugeicons/core-free-icons'
import { useNavigate } from '@tanstack/react-router'
import { DashboardGlassCard } from './dashboard-glass-card'
import type { SystemStatus } from './dashboard-types'
import { Button } from '@/components/ui/button'

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
      description="Live gateway health and workspace runtime details."
      icon={Activity01Icon}
      draggable={draggable}
      className="h-full"
    >
      <div className="space-y-2.5 text-sm">
        <div className="flex items-center justify-between rounded-xl border border-primary-200 bg-primary-100/50 px-3 py-2.5">
          <span className="text-primary-700 text-pretty">Gateway connection</span>
          <span className="inline-flex items-center gap-2 tabular-nums">
            <span
              className={status.gateway.connected ? 'size-2 rounded-full bg-emerald-500' : 'size-2 rounded-full bg-red-500'}
              aria-hidden="true"
            />
            <span className="font-medium text-ink">
              {status.gateway.connected ? 'Connected' : 'Disconnected'}
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-primary-200 bg-primary-100/50 px-3 py-2.5">
          <span className="text-primary-700 text-pretty">Uptime</span>
          <span className="font-medium text-ink tabular-nums">
            {status.uptimeSeconds > 0 ? formatUptime(status.uptimeSeconds) : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-primary-200 bg-primary-100/50 px-3 py-2.5">
          <span className="text-primary-700 text-pretty">Current model</span>
          <span className="font-medium text-ink tabular-nums">
            {status.currentModel === 'sonnet' ? 'Default (Sonnet)' : status.currentModel || '—'}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-primary-200 bg-primary-100/50 px-3 py-2.5">
          <span className="text-primary-700 text-pretty">Session count</span>
          <span className="font-medium text-ink tabular-nums">{status.sessionCount}</span>
        </div>
      </div>
      <p className="mt-3 text-xs text-primary-500 tabular-nums">
        Last check {formatCheckedAt(status.gateway.checkedAtIso)}
      </p>
      <div className="mt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenDebugConsole}
          className="h-8 px-3 text-xs tabular-nums focus:ring-2 focus:ring-primary-400 focus:ring-offset-1"
          aria-label="Open Debug Console"
        >
          Open Debug Console
        </Button>
      </div>
    </DashboardGlassCard>
  )
}
