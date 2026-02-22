import {
  BotIcon,
  ChartLineData02Icon,
  Chat01Icon,
  Clock01Icon,
  PuzzleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

const ACTIONS = [
  { label: 'New Chat', to: '/chat/new', icon: Chat01Icon },
  { label: 'Spawn Agent', to: '/agent-swarm', icon: BotIcon },
  { label: 'Run Skill', to: '/skills', icon: PuzzleIcon },
  { label: 'View Costs', to: '/costs', icon: ChartLineData02Icon },
  { label: 'Cron Jobs', to: '/cron', icon: Clock01Icon },
] as const

type QuickActionsRowProps = {
  className?: string
}

export function QuickActionsRow({ className }: QuickActionsRowProps) {
  const navigate = useNavigate()

  return (
    <div className={cn('overflow-x-auto px-1 scrollbar-none', className)}>
      <div className="flex min-w-max items-center gap-2 px-0.5 py-0.5">
        {ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => void navigate({ to: action.to as any })}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors',
              'border-neutral-200 bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
              'dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700',
            )}
          >
            <HugeiconsIcon icon={action.icon} size={14} strokeWidth={1.7} />
            <span className="whitespace-nowrap">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
