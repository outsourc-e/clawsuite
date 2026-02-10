import { Task01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DashboardGlassCard } from './dashboard-glass-card'
import type { QuickAction } from './dashboard-types'
import { Button } from '@/components/ui/button'

type QuickActionsWidgetProps = {
  actions: Array<QuickAction>
  onNavigate: (to: QuickAction['to']) => void
  draggable?: boolean
}

export function QuickActionsWidget({
  actions,
  onNavigate,
  draggable = false,
}: QuickActionsWidgetProps) {
  return (
    <DashboardGlassCard
      title="Quick Actions"
      description="Jump into the most common OpenClaw Studio workflows."
      icon={Task01Icon}
      draggable={draggable}
      className="h-full"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {actions.map(function mapAction(action) {
          return (
            <Button
              key={action.id}
              variant="secondary"
              className="h-auto min-h-16 items-start justify-start rounded-xl border border-primary-200 bg-primary-100/55 px-3 py-3 text-left hover:bg-primary-100 focus:ring-2 focus:ring-primary-400 focus:ring-offset-1"
              aria-label={action.label}
              onClick={function onActionClick() {
                onNavigate(action.to)
              }}
            >
              <span className="mt-0.5 text-primary-700">
                <HugeiconsIcon icon={action.icon} size={20} strokeWidth={1.5} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink text-balance">
                  {action.label}
                </span>
                <span className="mt-0.5 block line-clamp-2 text-xs text-primary-600 text-pretty">
                  {action.description}
                </span>
              </span>
            </Button>
          )
        })}
      </div>
    </DashboardGlassCard>
  )
}
