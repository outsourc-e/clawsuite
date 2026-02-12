import { ArrowRight01Icon, Task01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { DashboardGlassCard } from './dashboard-glass-card'
import type { CronJob } from '@/components/cron-manager/cron-types'
import type { TaskPriority, TaskStatus } from '@/stores/task-store'
import { fetchCronJobs } from '@/lib/cron-api'
import { STATUS_LABELS, STATUS_ORDER } from '@/stores/task-store'
import { cn } from '@/lib/utils'

type TasksWidgetProps = {
  draggable?: boolean
  onRemove?: () => void
}

type DashboardTask = {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
}

const PRIORITY_ORDER: Array<TaskPriority> = ['P0', 'P1', 'P2', 'P3']

function priorityColor(p: TaskPriority): string {
  if (p === 'P0') return 'bg-red-100/70 text-red-700'
  if (p === 'P1') return 'bg-accent-100/70 text-accent-700'
  if (p === 'P2') return 'bg-primary-200/60 text-primary-600'
  return 'bg-primary-100 text-primary-400'
}

function statusDotColor(s: TaskStatus): string {
  if (s === 'in_progress') return 'bg-accent-500'
  if (s === 'review') return 'bg-accent-400'
  if (s === 'done') return 'bg-primary-300'
  return 'bg-primary-300'
}

function toTaskStatus(job: CronJob): TaskStatus {
  if (!job.enabled) return 'backlog'
  const lastRunStatus = job.lastRun?.status
  if (lastRunStatus === 'running' || lastRunStatus === 'queued')
    return 'in_progress'
  if (lastRunStatus === 'error') return 'review'
  if (lastRunStatus === 'success') return 'done'
  return 'backlog'
}

function toTaskPriority(job: CronJob): TaskPriority {
  const lastRunStatus = job.lastRun?.status
  if (lastRunStatus === 'error') return 'P0'
  if (lastRunStatus === 'running' || lastRunStatus === 'queued') return 'P1'
  if (!job.enabled) return 'P3'
  return 'P2'
}

function toDashboardTask(job: CronJob): DashboardTask {
  return {
    id: job.id,
    title: job.name,
    status: toTaskStatus(job),
    priority: toTaskPriority(job),
  }
}

function MiniColumn({
  status,
  tasks,
}: {
  status: TaskStatus
  tasks: Array<DashboardTask>
}) {
  const visible = tasks.slice(0, 3)
  const remaining = tasks.length - visible.length

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-2 flex items-center gap-1.5">
        <span className={cn('size-1.5 rounded-full', statusDotColor(status))} />
        <span className="text-xs font-medium text-primary-600">
          {STATUS_LABELS[status]}
        </span>
        <span className="font-mono text-xs text-primary-400 tabular-nums">
          {tasks.length}
        </span>
      </div>
      {visible.length === 0 ? (
        <div className="rounded border border-dashed border-primary-200 py-3 text-center text-xs text-primary-300">
          —
        </div>
      ) : (
        <div className="space-y-1.5">
          {visible.map((task, index) => (
            <div
              key={task.id}
              className={cn(
                'rounded-md border border-primary-200 px-2 py-2',
                index % 2 === 0 ? 'bg-primary-50/90' : 'bg-primary-100/55',
              )}
            >
              <p className="line-clamp-1 text-sm text-ink">{task.title}</p>
              <span
                className={cn(
                  'mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium',
                  priorityColor(task.priority),
                )}
              >
                {task.priority}
              </span>
            </div>
          ))}
          {remaining > 0 ? (
            <p className="text-center text-xs text-primary-400">
              +{remaining} more
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

export function TasksWidget({ draggable = false, onRemove }: TasksWidgetProps) {
  const navigate = useNavigate()
  const cronJobsQuery = useQuery({
    queryKey: ['cron', 'jobs'],
    queryFn: fetchCronJobs,
    retry: false,
    refetchInterval: 30_000,
  })

  const tasks = useMemo(
    function mapCronJobsToTasks() {
      const jobs = Array.isArray(cronJobsQuery.data) ? cronJobsQuery.data : []
      return jobs.map(function mapJob(job) {
        return toDashboardTask(job)
      })
    },
    [cronJobsQuery.data],
  )

  const byStatus = STATUS_ORDER.reduce(
    (acc, status) => {
      acc[status] = tasks
        .filter((t) => t.status === status)
        .sort((a, b) => {
          return (
            PRIORITY_ORDER.indexOf(a.priority) -
            PRIORITY_ORDER.indexOf(b.priority)
          )
        })
      return acc
    },
    {} as Record<TaskStatus, Array<DashboardTask>>,
  )

  const activeCount = tasks.filter((t) => t.status !== 'done').length
  const doneCount = tasks.filter((t) => t.status === 'done').length
  const errorMessage =
    cronJobsQuery.error instanceof Error ? cronJobsQuery.error.message : null

  return (
    <DashboardGlassCard
      title="Tasks"
      titleAccessory={
        <span className="inline-flex items-center rounded-full border border-primary-200 bg-primary-100/70 px-2 py-0.5 text-[11px] font-medium text-primary-500 tabular-nums">
          {activeCount}
        </span>
      }
      tier="tertiary"
      description=""
      icon={Task01Icon}
      draggable={draggable}
      onRemove={onRemove}
      className="h-full rounded-xl border-primary-200 p-4 shadow-sm [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:normal-case [&_h2]:text-ink"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-primary-600">
          Active
          <span className="ml-1 font-mono text-primary-400 tabular-nums">
            {activeCount}
          </span>
        </span>
        <span className="text-sm text-primary-600">
          Done
          <span className="ml-1 font-mono text-primary-400 tabular-nums">
            {doneCount}
          </span>
        </span>
      </div>

      {cronJobsQuery.isLoading && tasks.length === 0 ? (
        <div className="mb-2 rounded-lg border border-primary-200 bg-primary-100/45 px-3 py-2.5 text-sm text-primary-600 text-pretty">
          Loading tasks...
        </div>
      ) : null}
      {cronJobsQuery.isError ? (
        <div className="mb-2 rounded-lg border border-accent-300 bg-accent-100/65 px-3 py-2.5 text-sm text-accent-700 text-pretty">
          {errorMessage ?? 'Unable to load gateway tasks.'}
        </div>
      ) : null}
      {!cronJobsQuery.isLoading &&
      !cronJobsQuery.isError &&
      tasks.length === 0 ? (
        <div className="mb-2 rounded-lg border border-primary-200 bg-primary-100/45 px-3 py-2.5 text-sm text-primary-600 text-pretty">
          No tasks reported by the Gateway.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {STATUS_ORDER.map((status) => (
          <MiniColumn key={status} status={status} tasks={byStatus[status]} />
        ))}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => void navigate({ to: '/cron' })}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary-400 transition-colors hover:text-accent-600"
        >
          View all
          <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.5} />
        </button>
      </div>
    </DashboardGlassCard>
  )
}
