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
  { label: 'Chat', to: '/chat/new', icon: Chat01Icon },
  { label: 'Agent', to: '/agent-swarm', icon: BotIcon },
  { label: 'Skills', to: '/skills', icon: PuzzleIcon },
  { label: 'Costs', to: '/costs', icon: ChartLineData02Icon },
  { label: 'Cron', to: '/cron', icon: Clock01Icon },
] as const

type QuickActionsRowProps = {
  className?: string
}

export function QuickActionsRow({ className }: QuickActionsRowProps) {
  const navigate = useNavigate()

  return (
    <div className={cn('', className)}>
      <div className="flex items-center justify-between gap-1 px-1">
        {ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => void navigate({ to: action.to as any })}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 transition-colors',
              'text-neutral-600 hover:bg-neutral-100 active:bg-neutral-200',
              'dark:text-neutral-400 dark:hover:bg-neutral-800 dark:active:bg-neutral-700',
            )}
          >
            <div
              className={cn(
                'flex size-9 items-center justify-center rounded-full',
                'bg-neutral-100 dark:bg-neutral-800',
              )}
            >
              <HugeiconsIcon icon={action.icon} size={18} strokeWidth={1.7} />
            </div>
            <span className="text-[10px] font-medium">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
