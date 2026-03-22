import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowRight01Icon,
  CancelCircleHalfDotIcon,
  PlayIcon,
  PlusSignIcon,
  Rocket01Icon,
  Search01Icon,
  TaskDone01Icon,
} from '@hugeicons/core-free-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { CodeBlock } from '@/components/prompt-kit/code-block'
import { cn } from '@/lib/utils'
import { TerminalWorkspace } from '@/components/terminal/terminal-workspace'
import { AgentOutputPanel } from './components/agent-output-panel'
import { useWorkspaceSse } from '@/hooks/use-workspace-sse'
import { getWorkspaceCheckpointDiff } from '@/lib/workspace-checkpoints'
import { useConductorWorkspace, type WorkspaceMissionTask } from './hooks/use-conductor-workspace'
import { formatRelativeTime } from '@/screens/projects/lib/workspace-utils'

// ── Types ────────────────────────────────────────────────────────────────────

type ConductorPhase = 'home' | 'preview' | 'active' | 'complete'
type QuickActionId = 'research' | 'build' | 'review' | 'deploy'

type DecomposedTask = {
  title: string
  description: string
  agent?: string
  enabled: boolean
}

// ── Theme (CSS custom properties — adapts to light/dark) ─────────────────────

const THEME_STYLE: CSSProperties = {
  ['--theme-bg' as string]: 'var(--color-surface)',
  ['--theme-card' as string]: 'var(--color-primary-50)',
  ['--theme-card2' as string]: 'var(--color-primary-100)',
  ['--theme-border' as string]: 'var(--color-primary-200)',
  ['--theme-border2' as string]: 'var(--color-primary-400)',
  ['--theme-text' as string]: 'var(--color-ink)',
  ['--theme-muted' as string]: 'var(--color-primary-700)',
  ['--theme-muted-2' as string]: 'var(--color-primary-600)',
  ['--theme-accent' as string]: 'var(--color-accent-500)',
  ['--theme-accent-strong' as string]: 'var(--color-accent-600)',
  ['--theme-accent-soft' as string]: 'color-mix(in srgb, var(--color-accent-500) 12%, transparent)',
  ['--theme-accent-soft-strong' as string]: 'color-mix(in srgb, var(--color-accent-500) 18%, transparent)',
  ['--theme-accent-glow' as string]: 'color-mix(in srgb, var(--color-accent-500) 60%, transparent)',
  ['--theme-shadow' as string]: 'color-mix(in srgb, var(--color-primary-950) 14%, transparent)',
}

// ── Quick Actions ────────────────────────────────────────────────────────────

const QUICK_ACTIONS: Array<{
  id: QuickActionId
  label: string
  icon: typeof Search01Icon
  prompt: string
}> = [
  {
    id: 'research',
    label: 'Research',
    icon: Search01Icon,
    prompt: 'Research the problem space, gather constraints, compare approaches, and propose the most viable plan.',
  },
  {
    id: 'build',
    label: 'Build',
    icon: PlayIcon,
    prompt: 'Build the requested feature end-to-end, including implementation, validation, and a concise delivery summary.',
  },
  {
    id: 'review',
    label: 'Review',
    icon: TaskDone01Icon,
    prompt: 'Review the current implementation for correctness, regressions, missing tests, and release risks.',
  },
  {
    id: 'deploy',
    label: 'Deploy',
    icon: Rocket01Icon,
    prompt: 'Prepare the work for deployment, verify readiness, and summarize any operational follow-ups.',
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatElapsedTime(startIso: string | null | undefined, now: number): string {
  if (!startIso) return '0s'
  const startMs = new Date(startIso).getTime()
  if (!Number.isFinite(startMs)) return '0s'
  const totalSeconds = Math.max(0, Math.floor((now - startMs) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function getTaskStatusDot(status: string): { dotClass: string; label: string } {
  if (status === 'completed' || status === 'done') return { dotClass: 'bg-emerald-400', label: 'Done' }
  if (status === 'running' || status === 'active') return { dotClass: 'bg-sky-400 animate-pulse', label: 'Running' }
  if (status === 'failed' || status === 'stopped') return { dotClass: 'bg-red-400', label: 'Failed' }
  if (status === 'paused') return { dotClass: 'bg-amber-400', label: 'Paused' }
  return { dotClass: 'bg-[var(--theme-border2)]', label: 'Pending' }
}

function getCodeLanguage(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase()
  switch (extension) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'json':
    case 'html':
    case 'css':
    case 'md':
    case 'sql':
    case 'yml':
    case 'yaml':
      return extension
    default:
      return 'text'
  }
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

// ── Component ────────────────────────────────────────────────────────────────

export function Conductor() {
  // ── Workspace connection ──────────────────────────────────────────────────
  const { connected } = useWorkspaceSse({ silent: true })

  // ── Local state ───────────────────────────────────────────────────────────
  const [goalDraft, setGoalDraft] = useState('')
  const [selectedAction, setSelectedAction] = useState<QuickActionId>('build')
  const [decomposedTasks, setDecomposedTasks] = useState<DecomposedTask[] | null>(null)
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [terminalExpanded, setTerminalExpanded] = useState(false)
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [liveOutputTick, setLiveOutputTick] = useState(0)

  // ── Workspace hook ────────────────────────────────────────────────────────
  const workspace = useConductorWorkspace({
    missionId: activeMissionId,
    projectId: activeProjectId,
    enabled: true,
  })

  const missionStatus = workspace.missionStatus.data
  const taskRuns = workspace.taskRuns.data ?? []
  const checkpoints = workspace.checkpoints.data ?? []

  // ── Phase ─────────────────────────────────────────────────────────────────
  const phase: ConductorPhase = useMemo(() => {
    if (!activeMissionId) {
      return decomposedTasks ? 'preview' : 'home'
    }
    const status = missionStatus?.mission.status
    if (status === 'completed' || status === 'done' || status === 'failed') return 'complete'
    return 'active'
  }, [activeMissionId, decomposedTasks, missionStatus])

  // ── Timer for elapsed display ─────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active') return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    const liveId = window.setInterval(() => setLiveOutputTick((t) => t + 1), 2000)
    return () => {
      window.clearInterval(id)
      window.clearInterval(liveId)
    }
  }, [phase])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleDecompose = useCallback(async () => {
    const trimmed = goalDraft.trim()
    if (!trimmed) return
    setLaunchError(null)
    try {
      const result = await workspace.decompose.mutateAsync(trimmed)
      setDecomposedTasks(result.tasks.map((t) => ({ ...t, enabled: true })))
    } catch {
      // Fallback: single task if decompose fails (daemon offline)
      setDecomposedTasks([{ title: trimmed, description: '', enabled: true }])
    }
  }, [goalDraft, workspace.decompose])

  const handleLaunch = useCallback(async () => {
    if (!decomposedTasks) return
    const enabled = decomposedTasks.filter((t) => t.enabled)
    if (enabled.length === 0) return
    setLaunchError(null)
    try {
      const result = await workspace.launchMission({
        goal: goalDraft.trim(),
        tasks: enabled,
      })
      setActiveMissionId(result.missionId)
      setActiveProjectId(result.projectId)
      setDecomposedTasks(null)
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : 'Failed to launch mission')
      console.error('Launch failed:', err)
    }
  }, [decomposedTasks, goalDraft, workspace])

  const handlePause = useCallback(() => {
    if (activeMissionId) void workspace.pauseMission.mutateAsync(activeMissionId)
  }, [activeMissionId, workspace.pauseMission])

  const handleResume = useCallback(() => {
    if (activeMissionId) void workspace.resumeMission.mutateAsync(activeMissionId)
  }, [activeMissionId, workspace.resumeMission])

  const handleStop = useCallback(async () => {
    if (activeMissionId) {
      await workspace.stopMission.mutateAsync(activeMissionId)
    }
  }, [activeMissionId, workspace.stopMission])

  const handleNewMission = useCallback(() => {
    setActiveMissionId(null)
    setActiveProjectId(null)
    setDecomposedTasks(null)
    setGoalDraft('')
    setSelectedAction('build')
    setSelectedTaskId(null)
    setLaunchError(null)
  }, [])

  const handleBackToHome = useCallback(async () => {
    if (activeMissionId) {
      try { await workspace.stopMission.mutateAsync(activeMissionId) } catch { /* ignore */ }
    }
    handleNewMission()
  }, [activeMissionId, handleNewMission, workspace.stopMission])

  // ── Derived data ──────────────────────────────────────────────────────────
  const tasks: WorkspaceMissionTask[] = missionStatus?.task_breakdown ?? []
  const missionName = missionStatus?.mission.name ?? goalDraft.trim()
  const missionStatusLabel = missionStatus?.mission.status ?? 'pending'
  const completedCount = missionStatus?.completed_count ?? 0
  const totalCount = missionStatus?.total_count ?? 0
  const progress = missionStatus?.mission.progress ?? 0
  const runningAgents = missionStatus?.running_agents ?? []

  // Find earliest task start for elapsed time
  const earliestStart = useMemo(() => {
    const starts = tasks.map((t) => t.started_at).filter(Boolean) as string[]
    if (starts.length === 0) return null
    return starts.sort()[0]
  }, [tasks])

  const pendingCheckpoints = useMemo(
    () => checkpoints.filter((c) => c.status === 'pending' || c.status === 'awaiting_review'),
    [checkpoints],
  )
  const failedTaskRuns = useMemo(
    () =>
      taskRuns.filter(
        (run) => run.status === 'failed' && typeof run.error === 'string' && run.error.trim().length > 0,
      ),
    [taskRuns],
  )

  // ── Live output from workspace SSE (task_run.output events) ───────────────
  const queryClient = useQueryClient()
  const runningRuns = useMemo(
    () => taskRuns.filter((r) => r.status === 'running' || r.status === 'active'),
    [taskRuns],
  )
  const liveOutputByRunId = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const run of runningRuns) {
      const cached = queryClient.getQueryData<string[]>(['workspace', 'task-run-live-output', run.id])
      if (cached && cached.length > 0) {
        map.set(run.id, cached.slice(-8))
      }
    }
    return map
  }, [liveOutputTick, runningRuns, queryClient])

  const recentMissions = useMemo(() => {
    return [...(workspace.recentMissions.data ?? [])]
      .sort((left, right) => {
        const leftTime = new Date(left.updated_at ?? left.created_at ?? 0).getTime()
        const rightTime = new Date(right.updated_at ?? right.created_at ?? 0).getTime()
        return rightTime - leftTime
      })
      .slice(0, 10)
  }, [workspace.recentMissions.data])

  const handleOpenHtmlPreview = useCallback((content: string) => {
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }, [])

  // Map task_id → run for quick lookup
  const runByTaskId = useMemo(
    () => new Map(taskRuns.map((r) => [r.task_id, r] as const)),
    [taskRuns],
  )

  // ── Checkpoint diff expansion ─────────────────────────────────────────────
  const [missionsPage, setMissionsPage] = useState(0)
  const [expandedCheckpointId, setExpandedCheckpointId] = useState<string | null>(null)
  const checkpointDiffQuery = useQuery({
    queryKey: ['workspace', 'checkpoint-diff', expandedCheckpointId],
    enabled: Boolean(expandedCheckpointId),
    queryFn: async () => {
      if (!expandedCheckpointId) return { diff: '' }
      return getWorkspaceCheckpointDiff(expandedCheckpointId)
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  })

  // ════════════════════════════════════════════════════════════════════════════
  // ── HOME PHASE ─────────────────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════════

  if (phase === 'home') {
    const PAGE_SIZE = 3
    const totalPages = Math.ceil(recentMissions.length / PAGE_SIZE)
    const pageStart = missionsPage * PAGE_SIZE
    const pageMissions = recentMissions.slice(pageStart, pageStart + PAGE_SIZE)
    const canPrev = missionsPage > 0
    const canNext = missionsPage < totalPages - 1

    return (
      <div className="flex h-full min-h-full flex-col bg-[var(--theme-bg)] text-[var(--theme-text)]" style={THEME_STYLE}>
        {/* Hero — always vertically centered */}
        <main className="mx-auto flex min-h-0 flex-1 max-w-[720px] flex-col items-center justify-center px-6">
          <div className="w-full space-y-8">
            <div className="space-y-3 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-muted)]">
                Conductor
                <span className={cn('size-2 rounded-full', connected ? 'bg-emerald-400' : 'bg-amber-400')} />
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--theme-text)] md:text-4xl">
                What should the team do next?
              </h1>
              <p className="text-sm text-[var(--theme-muted-2)]">
                Describe your goal. The workspace daemon will decompose it into tasks and assign agents.
              </p>
            </div>

            <section className="overflow-hidden rounded-3xl border border-[var(--theme-border2)] bg-[var(--theme-card)] shadow-[0_24px_80px_var(--theme-shadow)]">
              <textarea
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
                placeholder="Describe the mission, constraints, and desired outcome."
                className="min-h-[180px] w-full resize-none bg-[var(--theme-card)] px-6 py-5 text-base text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted-2)]"
              />
              <div className="flex flex-col gap-3 border-t border-[var(--theme-border)] px-4 py-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => { setSelectedAction(action.id); setGoalDraft(action.prompt) }}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                        selectedAction === action.id
                          ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft-strong)] text-[var(--theme-accent-strong)]'
                          : 'border-[var(--theme-border2)] bg-[var(--theme-card)] text-[var(--theme-muted)] hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]',
                      )}
                    >
                      <HugeiconsIcon icon={action.icon} size={14} strokeWidth={1.7} />
                      {action.label}
                    </button>
                  ))}
                </div>
                <Button
                  onClick={() => void handleDecompose()}
                  disabled={!connected || !goalDraft.trim() || workspace.decompose.isPending}
                  className="min-w-[140px] rounded-xl bg-[var(--theme-accent)] text-white hover:bg-[var(--theme-accent-strong)]"
                >
                  {!connected ? 'Connecting...' : workspace.decompose.isPending ? 'Planning...' : 'Plan Mission'}
                  <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.7} />
                </Button>
              </div>
            </section>
          </div>
        </main>

        {/* Recent missions — compact footer with arrow pagination */}
        {recentMissions.length > 0 && (
          <footer className="mx-auto w-full max-w-[720px] shrink-0 px-6 pb-4">
            <div className="flex items-center justify-between pb-2">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">
                Recent Missions
              </h2>
              <div className="flex items-center gap-1">
                <span className="mr-2 text-[10px] text-[var(--theme-muted-2)]">
                  {missionsPage + 1}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={!canPrev}
                  onClick={() => setMissionsPage((p) => p - 1)}
                  className={cn(
                    'flex size-7 items-center justify-center rounded-lg border border-[var(--theme-border)] text-[var(--theme-muted)] transition-colors',
                    canPrev ? 'hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]' : 'opacity-30',
                  )}
                >
                  <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.7} className="rotate-180" />
                </button>
                <button
                  type="button"
                  disabled={!canNext}
                  onClick={() => setMissionsPage((p) => p + 1)}
                  className={cn(
                    'flex size-7 items-center justify-center rounded-lg border border-[var(--theme-border)] text-[var(--theme-muted)] transition-colors',
                    canNext ? 'hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]' : 'opacity-30',
                  )}
                >
                  <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.7} />
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              {pageMissions.map((mission) => {
                const statusDot = getTaskStatusDot(mission.status)
                const timeValue = mission.updated_at ?? mission.created_at
                return (
                  <button
                    key={mission.id}
                    type="button"
                    onClick={() => {
                      setActiveMissionId(mission.id)
                      setActiveProjectId(mission.project_id ?? null)
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2.5 text-left transition-colors hover:border-[var(--theme-accent)] hover:bg-[var(--theme-accent-soft)]"
                  >
                    <span className={cn('size-2 shrink-0 rounded-full', statusDot.dotClass)} />
                    <p className="min-w-0 flex-1 truncate text-sm text-[var(--theme-text)]">
                      {mission.name}
                    </p>
                    <span className="shrink-0 text-[10px] text-[var(--theme-muted-2)]">
                      {statusDot.label}
                    </span>
                    <span className="shrink-0 text-[10px] text-[var(--theme-muted-2)]">
                      {timeValue ? formatRelativeTime(timeValue) : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          </footer>
        )}
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ── PREVIEW PHASE (task decomposition review) ──────────────────────────────
  // ════════════════════════════════════════════════════════════════════════════

  if (phase === 'preview' && decomposedTasks) {
    const enabledCount = decomposedTasks.filter((t) => t.enabled).length
    return (
      <div className="h-full min-h-full bg-[var(--theme-bg)] text-[var(--theme-text)]" style={THEME_STYLE}>
        <main className="mx-auto flex min-h-full max-w-[720px] flex-col items-center justify-center px-6 py-12">
          <div className="w-full space-y-6">
            <div className="space-y-2 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-accent)]">Mission Plan</p>
              <h1 className="text-2xl font-semibold tracking-tight">{goalDraft.length > 80 ? `${goalDraft.slice(0, 77)}…` : goalDraft}</h1>
              <p className="text-sm text-[var(--theme-muted-2)]">{decomposedTasks.length} tasks decomposed — toggle any off before launch.</p>
            </div>

            <div className="space-y-2">
              {decomposedTasks.map((task, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setDecomposedTasks((prev) =>
                      prev ? prev.map((t, j) => j === i ? { ...t, enabled: !t.enabled } : t) : prev
                    )
                  }}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                    task.enabled
                      ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)]'
                      : 'border-[var(--theme-border)] bg-[var(--theme-card)] opacity-50',
                  )}
                >
                  <span className={cn('mt-1 flex size-5 shrink-0 items-center justify-center rounded-md border text-xs', task.enabled ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)] text-white' : 'border-[var(--theme-border2)]')}>
                    {task.enabled ? '✓' : ''}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--theme-text)]">{task.title}</p>
                    {task.description && <p className="mt-0.5 text-xs text-[var(--theme-muted)]">{task.description}</p>}
                    {task.agent && <span className="mt-1 inline-block rounded-full border border-[var(--theme-border)] px-2 py-0.5 text-[10px] text-[var(--theme-muted-2)]">{task.agent}</span>}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setDecomposedTasks(null)}
                className="rounded-xl border border-[var(--theme-border)] px-4 py-2 text-sm font-medium text-[var(--theme-text)] transition-colors hover:border-[var(--theme-accent)]"
              >
                ← Back
              </button>
              <Button
                onClick={() => void handleLaunch()}
                disabled={!connected || enabledCount === 0 || workspace.createMission.isPending || workspace.startMission.isPending}
                className="min-w-[160px] rounded-xl bg-[var(--theme-accent)] text-white hover:bg-[var(--theme-accent-strong)]"
              >
                {!connected
                  ? 'Connecting...'
                  : workspace.createMission.isPending || workspace.startMission.isPending
                    ? 'Launching...'
                    : `Launch ${enabledCount} Task${enabledCount !== 1 ? 's' : ''}`}
                <HugeiconsIcon icon={Rocket01Icon} size={16} strokeWidth={1.7} />
              </Button>
            </div>
            {launchError && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {launchError}
              </div>
            )}
          </div>
        </main>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ── COMPLETE PHASE ─────────────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════════

  if (phase === 'complete') {
    const failed = missionStatusLabel === 'failed'
    return (
      <div className="h-full min-h-full bg-[var(--theme-bg)] text-[var(--theme-text)]" style={THEME_STYLE}>
        <main className="grid h-full min-h-0 grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="flex min-h-0 flex-col overflow-y-auto px-6 py-8 lg:px-10">
            <div className="mx-auto w-full max-w-3xl space-y-6">
              <div className="space-y-2">
                <p className={cn('text-xs font-semibold uppercase tracking-[0.24em]', failed ? 'text-red-400' : 'text-emerald-400')}>
                  {failed ? 'Mission Failed' : 'Mission Complete'}
                </p>
                <h1 className="text-3xl font-semibold tracking-tight">{missionName}</h1>
              </div>

              {/* Task results */}
              <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Tasks</h2>
                <div className="mt-4 space-y-2">
                  {tasks.map((task) => {
                    const td = getTaskStatusDot(task.status)
                    return (
                      <div key={task.id} className="flex items-center gap-3">
                        <span className={cn('size-2.5 rounded-full', td.dotClass)} />
                        <span className="flex-1 text-sm text-[var(--theme-text)]">{task.name}</span>
                        <span className="text-xs text-[var(--theme-muted-2)]">{td.label}</span>
                      </div>
                    )
                  })}
                  {tasks.length === 0 && <p className="text-sm text-[var(--theme-muted)]">No task data available.</p>}
                </div>
              </div>

              {failed && failedTaskRuns.length > 0 && (
                <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-red-300">Failure Details</h2>
                  <div className="mt-4 space-y-3">
                    {failedTaskRuns.map((run) => (
                      <div key={run.id} className="rounded-2xl bg-red-950/10 px-4 py-3">
                        <p className="text-sm font-medium text-[var(--theme-text)]">
                          {run.task_name ?? 'Task'}{run.agent_name ? ` · ${run.agent_name}` : ''}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-red-200">{run.error}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Checkpoints */}
              {checkpoints.length > 0 && (
                <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Checkpoints</h2>
                  <div className="mt-4 space-y-2">
                    {checkpoints.map((cp) => (
                      <div key={cp.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--theme-card2)] px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm text-[var(--theme-text)]">{cp.diff_summary ?? `Checkpoint ${cp.id.slice(0, 8)}`}</p>
                          <p className="text-xs text-[var(--theme-muted-2)]">
                            {cp.files_changed != null && `${cp.files_changed} files`}
                            {cp.additions != null && ` +${cp.additions}`}
                            {cp.deletions != null && ` -${cp.deletions}`}
                          </p>
                        </div>
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          cp.status === 'approved' ? 'bg-emerald-500/15 text-emerald-400' :
                          cp.status === 'rejected' ? 'bg-red-500/15 text-red-400' :
                          'bg-amber-500/15 text-amber-400',
                        )}>
                          {cp.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {workspace.projectFiles.data && (
                <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">
                        Output Files
                      </h2>
                      <p className="mt-1 text-xs text-[var(--theme-muted-2)]">
                        {workspace.projectFiles.data.projectPath}
                      </p>
                    </div>
                    <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1 text-xs text-[var(--theme-muted)]">
                      {workspace.projectFiles.data.files.length} files
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {workspace.projectFiles.data.files.map((file) => (
                      <details
                        key={file.relativePath}
                        className="overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)]"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[var(--theme-text)]">
                              {file.relativePath}
                            </p>
                            <p className="text-xs text-[var(--theme-muted-2)]">
                              {formatFileSize(file.size)} · {file.isText ? 'Text' : 'Binary'}
                            </p>
                          </div>
                          {file.relativePath.endsWith('.html') && file.content ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault()
                                handleOpenHtmlPreview(file.content!)
                              }}
                              className="rounded-full border border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] px-3 py-1 text-xs font-medium text-[var(--theme-accent-strong)] transition-colors hover:bg-[var(--theme-accent-soft-strong)]"
                            >
                              Open Preview
                            </button>
                          ) : (
                            <span className="text-xs text-[var(--theme-muted-2)]">Expand</span>
                          )}
                        </summary>
                        {file.isText && file.content ? (
                          <div className="border-t border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
                            <CodeBlock
                              content={file.content}
                              language={getCodeLanguage(file.relativePath)}
                              className="border-[var(--theme-border)]"
                            />
                          </div>
                        ) : (
                          <div className="border-t border-[var(--theme-border)] px-4 py-3 text-sm text-[var(--theme-muted)]">
                            Preview unavailable for this file.
                          </div>
                        )}
                      </details>
                    ))}
                    {workspace.projectFiles.data.files.length === 0 && (
                      <p className="text-sm text-[var(--theme-muted)]">No output files found.</p>
                    )}
                  </div>
                </div>
              )}

              <Button
                onClick={handleNewMission}
                className="inline-flex w-fit rounded-xl bg-[var(--theme-accent)] text-white hover:bg-[var(--theme-accent-strong)]"
              >
                <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={1.7} />
                New Mission
              </Button>
            </div>
          </section>

          {/* Right sidebar — stats */}
          <aside className="border-t border-[var(--theme-border)] bg-[var(--theme-card)] px-5 py-6 lg:border-l lg:border-t-0">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Progress</p>
                <p className="mt-2 text-3xl font-semibold text-[var(--theme-text)]">{completedCount}/{totalCount}</p>
              </div>
              <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-4">
                <p className="text-xs text-[var(--theme-muted)]">Status</p>
                <p className="mt-1 text-xl font-semibold capitalize text-[var(--theme-text)]">{missionStatusLabel}</p>
              </div>
              <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-4">
                <p className="text-xs text-[var(--theme-muted)]">Checkpoints</p>
                <p className="mt-1 text-xl font-semibold text-[var(--theme-text)]">{checkpoints.length}</p>
              </div>
            </div>
          </aside>
        </main>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ── ACTIVE PHASE ───────────────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════════

  const isPaused = missionStatusLabel === 'paused'
  const selectedTask = tasks.find((t) => t.id === selectedTaskId)


  return (
    <div className="flex h-full min-h-full flex-col overflow-hidden bg-[var(--theme-bg)] text-[var(--theme-text)]" style={THEME_STYLE}>
      <div className={cn('grid min-h-0 flex-1', rightSidebarCollapsed ? 'grid-cols-[220px_minmax(0,1fr)_28px]' : 'grid-cols-[220px_minmax(0,1fr)_340px]')}>

        {/* ── Left sidebar: tasks ──────────────────────────────────────── */}
        <aside className="flex min-h-0 flex-col border-r border-[var(--theme-border)] bg-[var(--theme-bg)]">
          <div className="border-b border-[var(--theme-border)] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted-2)]">Tasks</p>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
            {tasks.map((task) => {
              const td = getTaskStatusDot(task.status)
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setSelectedTaskId(task.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors',
                    selectedTaskId === task.id
                      ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)]'
                      : 'border-transparent hover:border-[var(--theme-border)] hover:bg-[var(--theme-card)]',
                  )}
                >
                  <span className={cn('size-2 shrink-0 rounded-full', td.dotClass)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[var(--theme-text)]">{task.name}</p>
                    {task.agent_id && <p className="truncate text-[10px] text-[var(--theme-muted-2)]">{task.agent_id}</p>}
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--theme-muted-2)]">{td.label}</span>
                </button>
              )
            })}
            {tasks.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-[var(--theme-muted)]">
                Waiting for daemon…
              </div>
            )}
          </div>

          {/* Running agents */}
          {runningAgents.length > 0 && (
            <div className="border-t border-[var(--theme-border)] px-3 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted-2)]">Agents</p>
              {runningAgents.map((agent) => (
                <div key={agent} className="flex items-center gap-2 px-2 py-1">
                  <span className="relative flex size-2.5">
                    <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
                  </span>
                  <span className="truncate text-xs text-[var(--theme-text)]">{agent}</span>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* ── Center: mission stream ───────────────────────────────────── */}
        <section className="flex min-h-0 flex-col overflow-hidden">
          {/* Header */}
          <header className="border-b border-[var(--theme-border)] bg-[var(--theme-card)]/70 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted-2)]">
                <button
                  type="button"
                  onClick={() => void handleBackToHome()}
                  className="rounded-full border border-[var(--theme-border)] px-2.5 py-1 transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]"
                >
                  Back to Home
                </button>
                <span>Conductor</span>
                <span className="text-[var(--theme-border2)]">&gt;</span>
                <span className="max-w-[420px] truncate text-[var(--theme-text)]">{missionName}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1 text-xs font-medium text-[var(--theme-muted)]">
                  Elapsed: {formatElapsedTime(earliestStart, now)}
                </span>
                {/* Progress */}
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                  {completedCount}/{totalCount} · {progress}%
                </span>
                <button
                  type="button"
                  onClick={isPaused ? handleResume : handlePause}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1 text-xs font-medium text-[var(--theme-text)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]"
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleStop()}
                  className="inline-flex items-center gap-2 rounded-full border border-red-400/35 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/15"
                >
                  <HugeiconsIcon icon={CancelCircleHalfDotIcon} size={14} strokeWidth={1.7} />
                  Stop
                </button>
              </div>
            </div>
          </header>

          {/* Center content — task detail or overview */}
          <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
            {selectedTask ? (() => {
              const run = runByTaskId.get(selectedTask.id)
              const liveLines = run ? liveOutputByRunId.get(run.id) ?? [] : []
              return (
                <div className="flex min-h-0 flex-1 flex-col space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Task Detail</p>
                      <p className="text-sm font-medium text-[var(--theme-text)]">{selectedTask.name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedTaskId(null)}
                      className="rounded-full border border-[var(--theme-border)] px-3 py-1 text-xs font-medium text-[var(--theme-text)] transition-colors hover:border-[var(--theme-accent)]"
                    >
                      Back to overview
                    </button>
                  </div>
                  {/* Status bar */}
                  <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={cn('size-3 rounded-full', getTaskStatusDot(selectedTask.status).dotClass)} />
                      <span className="text-sm capitalize text-[var(--theme-text)]">{selectedTask.status}</span>
                      {selectedTask.agent_id && (
                        <span className="rounded-full bg-[var(--theme-card2)] px-2 py-0.5 text-[10px] text-[var(--theme-muted)]">{selectedTask.agent_id}</span>
                      )}
                      {run?.agent_name && run.agent_name !== selectedTask.agent_id && (
                        <span className="rounded-full bg-[var(--theme-card2)] px-2 py-0.5 text-[10px] text-[var(--theme-muted)]">{run.agent_name}</span>
                      )}
                      {selectedTask.started_at && (
                        <span className="text-[10px] text-[var(--theme-muted-2)]">Started {new Date(selectedTask.started_at).toLocaleTimeString()}</span>
                      )}
                      {run && (
                        <span className="text-[10px] text-[var(--theme-muted-2)]">Run: {run.status}</span>
                      )}
                    </div>
                  </div>

                  {/* Live output terminal */}
                  {liveLines.length > 0 && (
                    <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)]">
                      <div className="border-b border-[var(--theme-border)] px-4 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Live Output</p>
                      </div>
                      <div className="max-h-48 overflow-y-auto px-4 py-3 font-mono text-xs leading-relaxed text-[var(--theme-muted-2)]">
                        {liveLines.map((line, i) => (
                          <div key={i} className="whitespace-pre-wrap">{line}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Agent output panel — full session history */}
                  {run?.session_id && (
                    <div className="min-h-0 flex-1 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] overflow-hidden">
                      <AgentOutputPanel
                        agentName={run.agent_name ?? run.session_label ?? selectedTask.agent_id ?? 'Agent'}
                        sessionKey={run.session_id}
                        tasks={[]}
                        onClose={() => setSelectedTaskId(null)}
                        compact
                        outputLines={liveLines.length > 0 ? liveLines : undefined}
                      />
                    </div>
                  )}

                  {/* No session yet */}
                  {!run?.session_id && (selectedTask.status === 'pending' || selectedTask.status === 'ready') && (
                    <div className="rounded-2xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-8 text-center text-sm text-[var(--theme-muted)]">
                      Waiting for agent to pick up this task…
                    </div>
                  )}
                </div>
              )
            })() : (
              <div className="space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Mission Overview</p>

                {/* Task summary cards with live output preview */}
                <div className="grid gap-2 sm:grid-cols-2">
                  {tasks.slice(0, 8).map((task) => {
                    const td = getTaskStatusDot(task.status)
                    const run = runByTaskId.get(task.id)
                    const liveLines = run ? liveOutputByRunId.get(run.id) ?? [] : []
                    const lastLine = liveLines[liveLines.length - 1]
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => setSelectedTaskId(task.id)}
                        className="flex flex-col gap-1.5 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-3 text-left transition-colors hover:border-[var(--theme-accent)]"
                      >
                        <div className="flex items-center gap-3">
                          <span className={cn('size-2.5 shrink-0 rounded-full', td.dotClass)} />
                          <span className="min-w-0 flex-1 truncate text-sm text-[var(--theme-text)]">{task.name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-[var(--theme-muted-2)]">
                          <span>{run?.agent_name ?? task.agent_id ?? 'Unassigned'}</span>
                          <span>·</span>
                          <span>{td.label}</span>
                        </div>
                        {lastLine && (
                          <p className="truncate font-mono text-[10px] text-[var(--theme-muted-2)] opacity-70">{lastLine}</p>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Pending checkpoints inline — with expandable diffs */}
                {pendingCheckpoints.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-400">Checkpoints Awaiting Review</p>
                    {pendingCheckpoints.map((cp) => {
                      const isExpanded = expandedCheckpointId === cp.id
                      const diffText = isExpanded ? checkpointDiffQuery.data?.diff ?? '' : ''
                      return (
                        <div key={cp.id} className="rounded-2xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                          <div className="flex items-center justify-between gap-3 px-4 py-3">
                            <button
                              type="button"
                              onClick={() => setExpandedCheckpointId(isExpanded ? null : cp.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="text-sm text-[var(--theme-text)]">{cp.diff_summary ?? `Checkpoint ${cp.id.slice(0, 8)}`}</p>
                              <p className="text-[10px] text-[var(--theme-muted-2)]">
                                {cp.files_changed != null && `${cp.files_changed} files`}
                                {cp.additions != null && ` +${cp.additions}`}
                                {cp.deletions != null && ` -${cp.deletions}`}
                                {' · Click to '}{isExpanded ? 'collapse' : 'view diff'}
                              </p>
                            </button>
                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                onClick={() => void workspace.approveCheckpoint.mutateAsync({ id: cp.id, action: 'merge' })}
                                className="rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25"
                              >
                                Approve & Merge
                              </button>
                              <button
                                type="button"
                                onClick={() => void workspace.approveCheckpoint.mutateAsync({ id: cp.id, action: 'pr' })}
                                className="rounded-full bg-sky-500/10 px-3 py-1 text-[11px] font-medium text-sky-300 transition-colors hover:bg-sky-500/20"
                              >
                                Open PR
                              </button>
                              <button
                                type="button"
                                onClick={() => void workspace.rejectCheckpoint.mutateAsync(cp.id)}
                                className="rounded-full bg-red-500/10 px-3 py-1 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-500/20"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                          {/* Expandable diff view */}
                          {isExpanded && (
                            <div className="border-t border-amber-500/20 bg-[var(--theme-bg)]">
                              {checkpointDiffQuery.isPending ? (
                                <div className="px-4 py-6 text-center text-xs text-[var(--theme-muted)]">Loading diff…</div>
                              ) : diffText ? (
                                <pre className="max-h-80 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed">
                                  {diffText.split('\n').map((line, i) => (
                                    <div
                                      key={i}
                                      className={cn(
                                        line.startsWith('+') && !line.startsWith('+++') ? 'text-emerald-400' :
                                        line.startsWith('-') && !line.startsWith('---') ? 'text-red-400' :
                                        line.startsWith('@@') ? 'text-sky-400' :
                                        'text-[var(--theme-muted-2)]',
                                      )}
                                    >
                                      {line}
                                    </div>
                                  ))}
                                </pre>
                              ) : (
                                <div className="px-4 py-6 text-center text-xs text-[var(--theme-muted)]">No diff available</div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Right sidebar ────────────────────────────────────────────── */}
        <aside className="relative flex min-h-0 flex-col overflow-hidden border-l border-[var(--theme-border)] bg-[var(--theme-bg)]">
          <button
            type="button"
            onClick={() => setRightSidebarCollapsed((c) => !c)}
            className="absolute left-0 top-20 z-10 flex h-10 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-muted)] shadow-lg transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.7} className={cn('transition-transform', rightSidebarCollapsed ? 'rotate-180' : '')} />
          </button>
          {rightSidebarCollapsed ? (
            <div className="flex h-full items-start justify-center pt-36">
              <span className="-rotate-90 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--theme-muted-2)]">Insights</span>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
              {/* Progress */}
              <section className="space-y-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Progress</h2>
                <div className="rounded-2xl bg-[var(--theme-card)] px-3 py-3">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-[var(--theme-muted)]">Tasks</span>
                    <span className="font-medium text-[var(--theme-text)]">{completedCount}/{totalCount}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--theme-card2)]">
                    <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </section>

              {/* Task list (compact) */}
              <section className="space-y-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Task Status</h2>
                <div className="space-y-2">
                  {tasks.slice(0, 6).map((task) => {
                    const td = getTaskStatusDot(task.status)
                    return (
                      <div key={task.id} className="flex items-center gap-2 rounded-2xl bg-[var(--theme-card)] px-3 py-2.5">
                        <span className={cn('size-2 shrink-0 rounded-full', td.dotClass)} />
                        <span className="min-w-0 flex-1 truncate text-sm text-[var(--theme-text)]">{task.name}</span>
                        <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-[var(--theme-muted-2)]">{td.label}</span>
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* Agents */}
              {runningAgents.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Active Agents</h2>
                  <div className="space-y-2">
                    {runningAgents.map((agent) => (
                      <div key={agent} className="flex items-center gap-2 rounded-2xl bg-[var(--theme-card)] px-3 py-2.5">
                        <span className="relative flex size-2.5">
                          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
                          <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
                        </span>
                        <span className="text-sm text-[var(--theme-text)]">{agent}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Checkpoints count */}
              <section className="space-y-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Checkpoints</h2>
                <div className="rounded-2xl bg-[var(--theme-card)] px-3 py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--theme-muted)]">Total</span>
                    <span className="font-medium text-[var(--theme-text)]">{checkpoints.length}</span>
                  </div>
                  {pendingCheckpoints.length > 0 && (
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span className="text-amber-400">Pending review</span>
                      <span className="font-medium text-amber-400">{pendingCheckpoints.length}</span>
                    </div>
                  )}
                </div>
              </section>

              {/* Mission controls */}
              <section className="space-y-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Controls</h2>
                <button
                  type="button"
                  onClick={handleNewMission}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-3 text-sm text-[var(--theme-text)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]"
                >
                  <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={1.7} />
                  New Mission
                </button>
              </section>
            </div>
          )}
        </aside>
      </div>

      {/* ── Terminal workspace ────────────────────────────────────────── */}
      <section className="border-t border-[var(--theme-border)] bg-[var(--theme-card)]">
        <button
          type="button"
          onClick={() => setTerminalExpanded((c) => !c)}
          className="flex w-full items-center justify-between px-4 py-2 text-left"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Terminal Workspace</p>
            <p className="text-xs text-[var(--theme-muted-2)]">{terminalExpanded ? 'Collapse terminal' : 'Expand terminal'}</p>
          </div>
          <HugeiconsIcon icon={terminalExpanded ? ArrowRight01Icon : PlusSignIcon} size={16} strokeWidth={1.7} className={cn('transition-transform', terminalExpanded && 'rotate-90')} />
        </button>
        <div className={cn('overflow-hidden transition-[max-height] duration-200', terminalExpanded ? 'max-h-[340px]' : 'max-h-0')}>
          <div className="h-[320px]">
            <TerminalWorkspace
              mode="panel"
              panelVisible={terminalExpanded}
              onMinimizePanel={() => setTerminalExpanded(false)}
              onMaximizePanel={() => setTerminalExpanded(true)}
              onClosePanel={() => setTerminalExpanded(false)}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
