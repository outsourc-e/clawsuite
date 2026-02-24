import { useSystemMetrics } from '@/hooks/use-system-metrics'
import { useSettings } from '@/hooks/use-settings'
import { cn } from '@/lib/utils'

function usageColorClass(value: number): string {
  if (value > 85) return 'bg-red-500'
  if (value >= 60) return 'bg-amber-400'
  return 'bg-emerald-500'
}

function textColorClass(value: number): string {
  if (value > 85) return 'text-red-400'
  if (value >= 60) return 'text-amber-300'
  return 'text-emerald-400'
}

function MetricDot({ className }: { className: string }) {
  return <span className={cn('inline-block size-1.5 rounded-full', className)} />
}

export function SystemMetricsFooter() {
  const { settings } = useSettings()
  const { metrics } = useSystemMetrics()

  if (!settings.showSystemMetricsFooter) return null

  const cpuDot = usageColorClass(metrics?.cpu ?? 0)
  const ramDot = usageColorClass(metrics?.ramPercent ?? 0)
  const diskDot = usageColorClass(metrics?.diskPercent ?? 0)
  const gatewayDot = metrics?.gatewayConnected === false ? 'bg-red-500' : 'bg-emerald-500'
  const uptimeDot = 'bg-sky-400'

  return (
    <footer className="pointer-events-none fixed inset-x-0 z-30 hidden h-6 border-t border-neutral-800 bg-neutral-950 md:block md:bottom-0">
      <div className="flex h-full items-center justify-between px-2 md:px-3">
        <div className="flex items-center gap-2 md:hidden" aria-label="System status indicators">
          <MetricDot className={cpuDot} />
          <MetricDot className={ramDot} />
          <MetricDot className={diskDot} />
          <MetricDot className={gatewayDot} />
          <MetricDot className={uptimeDot} />
        </div>

        <div className="hidden h-full items-center gap-2 text-[10px] text-neutral-400 md:flex">
          <span className="inline-flex items-center gap-1">
            <MetricDot className={cpuDot} />
            <span>CPU</span>
            <span className={cn('font-mono', textColorClass(metrics?.cpu ?? 0))}>
              {metrics?.cpuLabel ?? '...'}
            </span>
          </span>
          <span className="text-neutral-700">|</span>
          <span className="inline-flex items-center gap-1">
            <MetricDot className={ramDot} />
            <span>RAM</span>
            <span className={cn('font-mono', textColorClass(metrics?.ramPercent ?? 0))}>
              {metrics?.ramLabel ?? '...'}
            </span>
          </span>
          <span className="text-neutral-700">|</span>
          <span className="inline-flex items-center gap-1">
            <MetricDot className={diskDot} />
            <span>Disk</span>
            <span className={cn('font-mono', textColorClass(metrics?.diskPercent ?? 0))}>
              {metrics?.diskLabel ?? '...'}
            </span>
          </span>
          <span className="text-neutral-700">|</span>
          <span className="inline-flex items-center gap-1">
            <MetricDot className={gatewayDot} />
            <span>Gateway:</span>
            <span
              className={cn(
                'font-mono',
                metrics?.gatewayConnected === false ? 'text-red-400' : 'text-emerald-400',
              )}
            >
              {metrics?.gatewayLabel ?? '...'}
            </span>
          </span>
          <span className="text-neutral-700">|</span>
          <span className="inline-flex items-center gap-1">
            <MetricDot className={uptimeDot} />
            <span>Uptime</span>
            <span className="font-mono text-neutral-300">
              {metrics?.uptimeLabel ?? '...'}
            </span>
          </span>
        </div>
      </div>
    </footer>
  )
}

