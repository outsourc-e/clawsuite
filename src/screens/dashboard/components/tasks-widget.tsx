import { Task01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useNavigate } from '@tanstack/react-router'
import { DashboardGlassCard } from './dashboard-glass-card'
import { useTaskStore, STATUS_ORDER, STATUS_LABELS, type Task, type TaskStatus } from '@/stores/task-store'
import { cn } from '@/lib/utils'

type TasksWidgetProps = {
  draggable?: boolean
  onRemove?: () => void
}

function priorityColor(p: string): string {
  if (p === 'P0') return 'bg-red-500/15 text-red-600 dark:text-red-400'
  if (p === 'P1') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  if (p === 'P2') return 'bg-primary-200/60 text-primary-600'
  return 'bg-primary-100 text-primary-400'
}

function statusDotColor(s: TaskStatus): string {
  if (s === 'in_progress') return 'bg-emerald-500'
  if (s === 'review') return 'bg-blue-500'
  if (s === 'done') return 'bg-primary-300'
  return 'bg-primary-300'
}

function MiniColumn({ status, tasks }: { status: TaskStatus; tasks: Task[] }) {
  const visible = tasks.slice(0, 3)
  const remaining = tasks.length - visible.length

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-2 flex items-center gap-1.5">
        <span className={cn('size-1.5 rounded-full', statusDotColor(status))} />
        <span className="text-[11px] font-medium text-primary-500">{STATUS_LABELS[status]}</span>
        <span className="text-[11px] text-primary-400 tabular-nums">{tasks.length}</span>
      </div>
      {visible.length === 0 ? (
        <div className="rounded border border-dashed border-primary-200 py-3 text-center text-[10px] text-primary-300">
          —
        </div>
      ) : (
        <div className="space-y-1">
          {visible.map((task) => (
            <div
              key={task.id}
              className="rounded-md border border-primary-200 bg-primary-50/90 px-2 py-1.5"
            >
              <p className="line-clamp-1 text-[11px] font-medium text-ink">{task.title}</p>
              <span className={cn('mt-0.5 inline-block rounded px-1 py-px text-[9px] font-medium', priorityColor(task.priority))}>
                {task.priority}
              </span>
            </div>
          ))}
          {remaining > 0 ? (
            <p className="text-center text-[10px] text-primary-400">+{remaining} more</p>
          ) : null}
        </div>
      )}
    </div>
  )
}

export function TasksWidget({ draggable = false, onRemove }: TasksWidgetProps) {
  const navigate = useNavigate()
  const tasks = useTaskStore((s) => s.tasks)

  const byStatus = STATUS_ORDER.reduce(
    (acc, status) => {
      acc[status] = tasks
        .filter((t) => t.status === status)
        .sort((a, b) => {
          const p = ['P0', 'P1', 'P2', 'P3']
          return p.indexOf(a.priority) - p.indexOf(b.priority)
        })
      return acc
    },
    {} as Record<TaskStatus, Task[]>,
  )

  const activeCount = tasks.filter((t) => t.status !== 'done').length
  const doneCount = tasks.filter((t) => t.status === 'done').length

  return (
    <DashboardGlassCard
      title="Tasks"
      titleAccessory={
        <span className="text-[11px] text-primary-400 tabular-nums">
          {activeCount} active · {doneCount} done
        </span>
      }
      description=""
      icon={Task01Icon}
      draggable={draggable}
      onRemove={onRemove}
      className="h-full"
    >
      {/* Mini kanban — 4 columns */}
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {STATUS_ORDER.map((status) => (
          <MiniColumn key={status} status={status} tasks={byStatus[status]} />
        ))}
      </div>

      {/* View all link */}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => void navigate({ to: '/tasks' })}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-400 transition-colors hover:text-primary-600"
        >
          View all
          <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={1.5} />
        </button>
      </div>
    </DashboardGlassCard>
  )
}
