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
      <span className="inline-flex items-center gap-1 rounded-full border border-primary-300 dark:border-neutral-700 bg-white dark:bg-neutral-900/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-500 dark:text-neutral-400">
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
          ? 'border-emerald-900 bg-emerald-950/60 text-emerald-400'
          : 'border-red-900 bg-red-950/60 text-red-400',
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
        <span className="inline-flex items-center rounded-full border border-primary-200 dark:border-neutral-800 bg-primary-50 dark:bg-neutral-950 px-2 py-0.5 font-mono text-[11px] tabular-nums text-primary-800 dark:text-neutral-200">
          {upCount}/{totalCount}
        </span>
      }
      className="h-full rounded-xl border border-neutral-200 dark:border-neutral-700 border-l-4 border-l-emerald-500 bg-white dark:bg-neutral-900 p-4 sm:p-5 shadow-[0_6px_20px_rgba(0,0,0,0.25)] [&_svg]:text-emerald-500"
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
              className="flex items-center gap-2 rounded-lg border border-primary-200 dark:border-neutral-800 bg-primary-50 dark:bg-neutral-950 px-2.5 py-1.5"
            >
              <span className={cn('size-2 shrink-0 rounded-full', dotClass)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-primary-900 dark:text-neutral-100">
                  {service.name}
                </p>
                {typeof service.latencyMs === 'number' ? (
                  <p className="font-mono text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400">
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
