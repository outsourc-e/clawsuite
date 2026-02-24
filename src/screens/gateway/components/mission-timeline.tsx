import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { TeamMember } from './team-panel'
import type { HubTask } from './task-board'
import { AgentOutputPanel } from './agent-output-panel'

type MissionTimelineProps = {
  tasks: HubTask[]
  agentOutputs: Map<string, string[]>
  agentSessionMap?: Record<string, string>
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

function stateBadgeClass(state: string): string {
  if (state === 'running') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
  if (state === 'paused') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
  if (state === 'completed' || state === 'stopped') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
  return 'bg-neutral-100 text-neutral-700 dark:bg-slate-700 dark:text-slate-300'
}

function sessionBadgeClass(status: string): string {
  if (status === 'active') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
  if (status === 'idle') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
  if (status === 'error') return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
  if (status === 'stopped') return 'bg-neutral-100 text-neutral-700 dark:bg-slate-700 dark:text-slate-300'
  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
}

export function MissionTimeline({
  tasks,
  agentOutputs,
  agentSessionMap,
  agentStatuses,
  missionState,
  missionGoal,
  teamMembers,
  elapsedTime,
}: MissionTimelineProps) {
  const completedTasks = useMemo(
    () => tasks.filter((task) => task.status === 'done' || (task.status as string) === 'completed').length,
    [tasks],
  )
  const totalTasks = tasks.length
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const startedAt = useMemo(() => {
    const fromTasks = tasks.length > 0 ? Math.min(...tasks.map((task) => task.createdAt)) : 0
    if (fromTasks > 0) return fromTasks
    if (elapsedTime && elapsedTime > 0) return Date.now() - elapsedTime
    return Date.now()
  }, [elapsedTime, tasks])

  const doneByAgent = useMemo(() => {
    const map = new Map<string, HubTask[]>()
    tasks.forEach((task) => {
      if (!task.agentId) return
      if (task.status !== 'done' && (task.status as string) !== 'completed') return
      const prev = map.get(task.agentId) ?? []
      prev.push(task)
      map.set(task.agentId, prev)
    })
    return map
  }, [tasks])

  const hasMissionCompleted = (missionState === 'completed' || missionState === 'stopped') && totalTasks > 0

  return (
    <div className="mx-auto w-full max-w-5xl space-y-3 md:space-y-4">
      <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">Mission Goal</p>
            <p className="mt-1 break-words text-sm text-neutral-900 dark:text-white md:text-base">{missionGoal || 'No active mission goal.'}</p>
          </div>
          <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold capitalize', stateBadgeClass(missionState))}>
            {missionState === 'stopped' ? 'completed' : missionState || 'idle'}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex -space-x-2">
            {teamMembers.map((member) => (
              <div
                key={member.id}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white bg-neutral-900 text-[10px] font-semibold text-white dark:border-slate-800 dark:bg-slate-600"
                title={member.name}
              >
                {initials(member.name)}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-slate-400">
            <span>{completedTasks} / {totalTasks} tasks</span>
            <span>{formatElapsed(elapsedTime)} elapsed</span>
          </div>
        </div>

        <div className="mt-3 h-2 rounded-full bg-neutral-100 dark:bg-slate-700">
          <div
            className="h-2 rounded-full bg-orange-500 transition-all"
            style={{ width: `${Math.max(totalTasks > 0 ? 6 : 0, progressPct)}%` }}
          />
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 md:p-5">
        <ol className="space-y-4">
          <li className="relative pl-6 md:pl-8">
            <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full bg-orange-500" />
            <p className="text-sm font-semibold text-neutral-900 dark:text-white md:text-base">Mission started</p>
            <p className="text-xs text-neutral-500 dark:text-slate-400">{new Date(startedAt).toLocaleString()}</p>
          </li>

          {tasks
            .filter((task) => Boolean(task.agentId))
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((task) => {
              const member = teamMembers.find((entry) => entry.id === task.agentId)
              return (
                <li key={`dispatch-${task.id}`} className="relative min-w-0 border-l border-neutral-200 pl-6 dark:border-slate-700 md:pl-8">
                  <span className="absolute -left-[6px] top-2.5 h-3 w-3 rounded-full bg-blue-500" />
                  <p className="break-words text-sm font-medium text-neutral-900 dark:text-white md:text-base">
                    Agent dispatched: {member?.name ?? task.agentId}
                  </p>
                  <p className="break-words text-xs text-neutral-500 dark:text-slate-400">
                    {task.title} · {member?.modelId || 'Unknown model'}
                  </p>
                </li>
              )
            })}

          {teamMembers.map((member) => {
            const status = agentStatuses.get(member.id)
            const outputs = agentOutputs.get(member.id) ?? []
            const doneTasks = doneByAgent.get(member.id) ?? []
            const estTokens = outputs.join(' ').trim().length > 0
              ? Math.ceil(outputs.join(' ').length / 4)
              : 0

            return (
              <li key={`agent-${member.id}`} className="relative min-w-0 border-l border-neutral-200 pl-6 dark:border-slate-700 md:pl-8">
                <span className={cn(
                  'absolute -left-[6px] top-3 h-3 w-3 rounded-full',
                  status?.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400 dark:bg-slate-500',
                )} />

                <div className="min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white md:text-base">{member.name}</p>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize', sessionBadgeClass(status?.status ?? 'pending'))}>
                      {status?.status ?? (missionState === 'running' ? 'pending' : 'idle')}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600 dark:text-slate-300">Assigned tasks: {tasks.filter((task) => task.agentId === member.id).length}</p>

                  {status?.status === 'active' ? (
                    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-2 dark:border-emerald-900/50 dark:bg-emerald-900/20">
                      <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Agent working</p>
                      <p className="mt-1 text-xs text-emerald-700/90 dark:text-emerald-200/90">Live stream is active{status.lastSeen ? ` · last seen ${new Date(status.lastSeen).toLocaleTimeString()}` : ''}</p>
                    </div>
                  ) : null}

                  {agentSessionMap?.[member.id] ? (
                    <div className="mt-2 overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                      <AgentOutputPanel
                        compact
                        agentName={member.name}
                        sessionKey={agentSessionMap[member.id]}
                        tasks={tasks.filter((t) => t.agentId === member.id)}
                        onClose={() => {}}
                      />
                    </div>
                  ) : (
                    <div className="mt-2 rounded-lg border border-neutral-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
                      <p className="text-[11px] text-neutral-400">Waiting for agent session...</p>
                    </div>
                  )}

                  {doneTasks.length > 0 ? (
                    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/60 px-2.5 py-2 dark:border-blue-900/50 dark:bg-blue-900/20">
                      <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">Agent completed</p>
                      <p className="mt-1 text-xs text-blue-700/90 dark:text-blue-200/90">
                        {doneTasks.length} task{doneTasks.length === 1 ? '' : 's'} complete
                        {estTokens > 0 ? ` · ~${estTokens.toLocaleString()} tokens` : ''}
                      </p>
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}

          {hasMissionCompleted ? (
            <li className="relative border-l border-neutral-200 pl-6 dark:border-slate-700 md:pl-8">
              <span className="absolute -left-[6px] top-2.5 h-3 w-3 rounded-full bg-violet-500" />
              <p className="text-sm font-semibold text-neutral-900 dark:text-white md:text-base">Mission completed</p>
              <p className="text-xs text-neutral-500 dark:text-slate-400">
                {completedTasks}/{totalTasks} tasks complete · total time {formatElapsed(elapsedTime)}
              </p>
            </li>
          ) : null}
        </ol>
      </section>
    </div>
  )
}
