import { Clock01Icon } from '@hugeicons/core-free-icons'
import { useNavigate } from '@tanstack/react-router'
import { WidgetShell } from './widget-shell'
import { useScheduledJobs } from '../hooks/use-scheduled-jobs'
import { cn } from '@/lib/utils'

type Props = {
  onRemove?: () => void
}

export function ScheduledJobsWidget({ onRemove }: Props) {
  const navigate = useNavigate()
  const jobsQuery = useScheduledJobs()
  const jobs = jobsQuery.data ?? []
  const visibleJobs = jobs.slice(0, 5)

  return (
    <WidgetShell
      size="medium"
      title="Scheduled"
      icon={Clock01Icon}
      onRemove={onRemove}
      loading={jobsQuery.isLoading}
      error={jobsQuery.error instanceof Error ? jobsQuery.error.message : undefined}
      action={
        <span className="inline-flex items-center rounded-full border border-primary-200 dark:border-neutral-800 bg-primary-50 dark:bg-neutral-950 px-2 py-0.5 font-mono text-[11px] tabular-nums text-primary-800 dark:text-neutral-200">
          {jobs.length}
        </span>
      }
      className="h-full rounded-xl border border-neutral-200 dark:border-neutral-700 border-l-4 border-l-orange-500 bg-white dark:bg-neutral-900 p-4 sm:p-5 shadow-[0_6px_20px_rgba(0,0,0,0.25)] [&_svg]:text-orange-500"
    >
      <div className="flex h-full flex-col gap-2">
        <div className="space-y-1.5">
          {visibleJobs.length === 0 ? (
            <div className="rounded-lg border border-primary-200 dark:border-neutral-800 bg-primary-50 dark:bg-neutral-950 px-3 py-3 text-xs text-primary-500 dark:text-neutral-400">
              No scheduled jobs found.
            </div>
          ) : (
            visibleJobs.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => void navigate({ to: '/cron' })}
                className="flex w-full items-center gap-2 rounded-lg border border-primary-200 dark:border-neutral-800 bg-primary-50 dark:bg-neutral-950 px-2.5 py-1.5 text-left transition-colors hover:border-primary-300 dark:hover:border-neutral-700 hover:bg-primary-100 dark:hover:bg-primary-800"
              >
                <span
                  className={cn(
                    'mt-0.5 size-2 shrink-0 rounded-full',
                    job.enabled ? 'bg-emerald-500' : 'bg-neutral-500',
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs font-medium text-primary-900 dark:text-neutral-100">
                      {job.name}
                    </p>
                    <span className="shrink-0 font-mono text-[10px] text-primary-500 dark:text-neutral-400">
                      {job.schedule}
                    </span>
                  </div>
                    <div className="mt-0.5 flex items-center gap-3 font-mono text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400">
                      <span>Next {job.nextRelative}</span>
                      <span>Last {job.lastRelative}</span>
                    </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="mt-auto pt-0.5">
          <button
            type="button"
            onClick={() => void navigate({ to: '/cron' })}
            className="text-xs font-medium text-primary-500 dark:text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            View all →
          </button>
        </div>
      </div>
    </WidgetShell>
  )
}
