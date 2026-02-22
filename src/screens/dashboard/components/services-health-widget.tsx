import { Activity01Icon } from '@hugeicons/core-free-icons'
import { WidgetShell } from './widget-shell'
import { useServicesHealth } from '../hooks/use-services-health'
import { cn } from '@/lib/utils'

type ServicesHealthWidgetProps = {
  gatewayConnected: boolean
  onRemove?: () => void
}

function StatusBadge({
  status,
}: {
  status: 'up' | 'down' | 'checking'
}) {
  if (status === 'checking') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
        <span className="size-1.5 animate-pulse rounded-full bg-neutral-500" />
        CHK
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        status === 'up'
          ? 'border-emerald-700/60 bg-emerald-950/70 text-emerald-300'
          : 'border-red-700/60 bg-red-950/70 text-red-300',
      )}
    >
      {status === 'up' ? 'UP' : 'DOWN'}
    </span>
  )
}

export function ServicesHealthWidget({
  gatewayConnected,
  onRemove,
}: ServicesHealthWidgetProps) {
  const { services } = useServicesHealth(gatewayConnected)
  const upCount = services.filter((service) => service.status === 'up').length
  const totalCount = services.length

  return (
    <WidgetShell
      size="medium"
      title="Services"
      icon={Activity01Icon}
      onRemove={onRemove}
      action={
        <span className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900/90 px-2 py-0.5 font-mono text-[11px] text-neutral-300">
          {upCount}/{totalCount}
        </span>
      }
      className="h-full border-neutral-800/90 bg-neutral-950/95 shadow-[0_6px_20px_rgba(0,0,0,0.25)]"
    >
      <div className="space-y-1.5">
        {services.map((service) => {
          const dotClass =
            service.status === 'up'
              ? 'bg-emerald-500'
              : service.status === 'down'
                ? 'bg-red-500'
                : 'bg-amber-400'

          return (
            <div
              key={service.name}
              className="flex items-center gap-2 rounded-lg border border-neutral-800/70 bg-neutral-900/60 px-2.5 py-1.5"
            >
              <span className={cn('size-2 shrink-0 rounded-full', dotClass)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-neutral-100">
                  {service.name}
                </p>
                {typeof service.latencyMs === 'number' ? (
                  <p className="font-mono text-[10px] text-neutral-500">
                    {service.latencyMs}ms
                  </p>
                ) : null}
              </div>
              <StatusBadge status={service.status} />
            </div>
          )
        })}
      </div>
    </WidgetShell>
  )
}
