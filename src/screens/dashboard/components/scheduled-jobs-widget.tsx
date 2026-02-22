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
        <span className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900/90 px-2 py-0.5 font-mono text-[11px] text-neutral-300">
          {jobs.length}
        </span>
      }
      className="h-full border-neutral-800/90 bg-neutral-950/95 shadow-[0_6px_20px_rgba(0,0,0,0.25)]"
    >
      <div className="flex h-full flex-col gap-2">
        <div className="space-y-1.5">
          {visibleJobs.length === 0 ? (
            <div className="rounded-lg border border-neutral-800/70 bg-neutral-900/60 px-3 py-3 text-xs text-neutral-400">
              No scheduled jobs found.
            </div>
          ) : (
            visibleJobs.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => void navigate({ to: '/cron' })}
                className="flex w-full items-center gap-2 rounded-lg border border-neutral-800/70 bg-neutral-900/60 px-2.5 py-1.5 text-left transition-colors hover:border-neutral-700 hover:bg-neutral-900"
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
                    <p className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-100">
                      {job.name}
                    </p>
                    <span className="shrink-0 font-mono text-[10px] text-neutral-400">
                      {job.schedule}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 font-mono text-[10px] text-neutral-500">
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
            className="text-xs font-medium text-accent-400 transition-colors hover:text-accent-300"
          >
            View all →
          </button>
        </div>
      </div>
    </WidgetShell>
  )
}
