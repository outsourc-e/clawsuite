import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { TeamMember } from './team-panel'
import type { HubTask } from './task-board'

type MissionTimelineProps = {
  tasks: HubTask[]
  agentOutputs: Map<string, string[]>
  agentSessionMap?: Record<string, string | null>
  agentStatuses: Map<string, { status: string; lastSeen: number }>
  missionState: string
  missionGoal: string
  teamMembers: TeamMember[]
  elapsedTime?: number
}

function formatElapsed(ms?: number): string {
  if (!ms || ms <= 0) return '0s'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function MissionTimeline({
  tasks,
  agentOutputs,
  agentSessionMap,
  agentStatuses,
  missionState,
  missionGoal: _missionGoal,
  teamMembers,
  elapsedTime,
}: MissionTimelineProps) {
  const [expandedOutputs, setExpandedOutputs] = useState<Record<string, boolean>>({})
  useEffect(() => {
    const activeIds = teamMembers
      .map((m) => m.id)
      .filter((id) => {
        const s = agentStatuses.get(id)
        return s?.status === 'active'
      })
    if (activeIds.length > 0) {
      setExpandedOutputs((prev) => {
        const next = { ...prev }
        for (const id of activeIds) {
          if (!next[id]) next[id] = true
        }
        return next
      })
    }
  }, [agentStatuses, teamMembers])

  const completedTasks = useMemo(
    () => tasks.filter((task) => task.status === 'done' || (task.status as string) === 'completed').length,
    [tasks],
  )
  const totalTasks = tasks.length

  const startedAt = useMemo(() => {
    const fromTasks = tasks.length > 0 ? Math.min(...tasks.map((task) => task.createdAt)) : 0
    if (fromTasks > 0) return fromTasks
    if (elapsedTime && elapsedTime > 0) return Date.now() - elapsedTime
    return Date.now()
  }, [elapsedTime, tasks])

  const hasMissionCompleted =
    (missionState === 'completed' || missionState === 'stopped' || missionState === 'aborted') &&
    totalTasks > 0
  const missionCompletedSuccessfully =
    missionState === 'completed' ||
    (missionState === 'stopped' && totalTasks > 0 && completedTasks === totalTasks)
  const missionCompletionLabel =
    missionCompletedSuccessfully
      ? 'Mission complete'
      : missionState === 'aborted'
        ? 'Mission aborted'
        : 'Mission stopped'
  const missionCardCls =
    'relative overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-4 shadow-sm'

  return (
    <section className={cn('mx-auto w-full max-w-[960px]', missionCardCls)}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-accent-500 via-accent-400/40 to-transparent" />
      <ol className="space-y-4">
        <li className="flex items-start gap-3">
          <span className="mt-1 h-[14px] w-[14px] rounded-full bg-accent-400" />
          <div>
            <p className="text-[16px] font-bold text-[var(--theme-text)]">Mission started</p>
            <p className="text-xs text-[var(--theme-muted)]">{new Date(startedAt).toLocaleString()}</p>
          </div>
        </li>

        {tasks
          .filter((task) => Boolean(task.agentId))
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((task) => {
            const member = teamMembers.find((entry) => entry.id === task.agentId)
            return (
              <li key={`dispatch-${task.id}`} className="flex items-start gap-3">
                <span className="mt-1 h-3 w-3 rounded-full bg-blue-500" />
                <div className="min-w-0">
                  <p className="break-words text-base font-bold text-[var(--theme-text)]">
                    Agent dispatched: {member?.name ?? task.agentId}
                  </p>
                  <p className="break-words text-sm text-[var(--theme-muted)]">
                    {task.title} · {member?.modelId || 'Unknown model'}
                  </p>
                </div>
              </li>
            )
          })}

        {teamMembers.map((member) => {
          const status = agentStatuses.get(member.id)
          const assignedTasks = tasks.filter((task) => task.agentId === member.id)
          const assignedTaskCount = assignedTasks.length
          const outputLines = agentOutputs.get(member.id) ?? agentOutputs.get(member.name) ?? []
          const agentStatus = (status?.status ?? '').toLowerCase()
          const isActive = agentStatus === 'active'
          const normalizedStatusLabel =
            agentStatus === 'active'
              ? 'Active'
              : agentStatus === 'paused'
                ? 'Paused'
                : agentStatus === 'error' || agentStatus === 'failed'
                  ? 'Error'
                  : agentStatus === 'done' || agentStatus === 'complete' || agentStatus === 'completed'
                    ? 'Done'
                    : agentStatus === 'stopped'
                      ? assignedTaskCount > 0
                        ? 'Idle'
                        : 'Not started'
                      : agentStatus === 'idle' || agentStatus === 'ready'
                        ? 'Idle'
                        : !agentStatus || agentStatus === 'spawning' || agentStatus === 'waiting' || agentStatus === 'not-started'
                          ? 'Not started'
                          : 'Not started'
          const statusBadgeClass =
            normalizedStatusLabel === 'Active'
              ? 'bg-emerald-700 text-white'
              : normalizedStatusLabel === 'Paused'
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                : normalizedStatusLabel === 'Not started'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                  : normalizedStatusLabel === 'Done'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                    : normalizedStatusLabel === 'Error'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                      : 'bg-[var(--theme-bg)] text-[var(--theme-muted)]'
          const statusDotClass =
            normalizedStatusLabel === 'Active'
              ? 'bg-emerald-500'
              : normalizedStatusLabel === 'Paused'
                ? 'bg-amber-500'
                : normalizedStatusLabel === 'Not started'
                  ? 'bg-blue-500'
                  : normalizedStatusLabel === 'Done'
                    ? 'bg-emerald-500'
                    : normalizedStatusLabel === 'Error'
                      ? 'bg-red-500'
                      : 'bg-neutral-300'
          const statusTitle =
            normalizedStatusLabel === 'Active'
              ? 'Agent is actively working'
              : normalizedStatusLabel === 'Idle'
                ? 'Agent is connected and waiting for tasks'
                : normalizedStatusLabel === 'Not started'
                  ? 'Agent is starting up'
                  : normalizedStatusLabel === 'Paused'
                    ? 'Mission is paused'
                    : undefined
          const isExpanded = Boolean(expandedOutputs[member.id])

          return (
            <li key={`agent-${member.id}`} className="flex items-start gap-3">
              <span className={cn('mt-2 h-3 w-3 rounded-full', statusDotClass)} />
              <div className={cn('min-w-0 flex-1', missionCardCls)}>
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-accent-500 via-accent-400/40 to-transparent" />
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-base font-bold text-[var(--theme-text)]">{member.name}</p>
                  <span className={cn('rounded-full px-2.5 py-1 text-xs', statusBadgeClass)} title={statusTitle}>
                    {normalizedStatusLabel}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--theme-muted)]">Assigned tasks: {assignedTaskCount}</p>

                {isActive ? (
                  <div className="mt-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 max-w-full">
                    <p className="text-sm font-semibold text-emerald-800">Agent working</p>
                    <p className="mt-0.5 break-words text-xs text-emerald-600">
                      Live stream is active{status?.lastSeen ? ` · last seen ${new Date(status.lastSeen).toLocaleTimeString()}` : ''}
                    </p>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => setExpandedOutputs((prev) => ({ ...prev, [member.id]: !prev[member.id] }))}
                  className="mt-3 text-sm text-neutral-600"
                >
                  {isExpanded ? '▼ Live output' : '▶ Live output'}
                </button>

                {(isExpanded || isActive || outputLines.length > 0) ? (
                  <div className="mt-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] p-2">
                    <div className="max-h-[240px] overflow-y-auto rounded-lg bg-[var(--theme-bg)] p-3 font-mono text-xs text-[var(--theme-text)]">
                      {outputLines.length > 0 ? (
                        <div className="space-y-1">
                          {outputLines.map((line, index) => (
                            <p key={`${member.id}-${index}`} className="break-words whitespace-pre-wrap">
                              {line}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="break-words text-[11px] text-[var(--theme-muted)]">
                          {agentSessionMap?.[member.id] ? 'Live output will appear here shortly...' : 'Waiting for agent session...'}
                        </p>
                      )}
                      {isActive ? <p className="mt-2 text-emerald-600 animate-pulse">● streaming…</p> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </li>
          )
        })}

        {hasMissionCompleted ? (
          <li className="flex items-start gap-3">
            <span className="mt-1 h-3 w-3 rounded-full bg-neutral-300" />
            <div>
              <p className="text-base font-bold text-[var(--theme-text)]">{missionCompletionLabel}</p>
              <p className="text-xs text-[var(--theme-muted)]">
                {completedTasks}/{totalTasks} tasks complete · total time {formatElapsed(elapsedTime)}
              </p>
            </div>
          </li>
        ) : null}
      </ol>
    </section>
  )
}
