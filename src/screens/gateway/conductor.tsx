import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowRight01Icon,
  PlayIcon,
  PlusSignIcon,
  Rocket01Icon,
  Search01Icon,
  TaskDone01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TeamPanel, TEAM_TEMPLATES, type TeamMember } from './components/team-panel'
import { RunConsole } from './components/run-console'
import { KanbanBoard, type KanbanBoardProps } from './components/kanban-board'
import { ApprovalsBell } from './components/approvals-bell'
import { CostAnalyticsDashboard } from './components/cost-analytics'
import { TerminalWorkspace } from '@/components/terminal/terminal-workspace'
import { useMissionStore } from '@/stores/mission-store'
import { loadApprovals, saveApprovals, type ApprovalRequest } from './lib/approvals-store'
import { buildStoredMissionReportFromCheckpoint, loadStoredMissionReports } from './components/hub-utils'
import type { StoredMissionReport } from './components/hub-constants'
import type { HubTask } from './components/task-board'
import { useMissionOrchestrator } from './hooks/use-mission-orchestrator'

type ConductorPhase = 'home' | 'active' | 'complete'
type QuickActionId = 'research' | 'build' | 'review' | 'deploy'

type RecentMissionEntry = {
  id: string
  title: string
  subtitle: string
  status: 'active' | 'done' | 'idle'
  timestamp: number
}

/* Theme uses existing CSS custom properties from styles.css.
   --color-surface, --color-ink, --color-primary-*, --color-accent-*
   adapt automatically to light / dark mode. The aliases below map
   the conductor's internal names to the app-wide tokens so every
   panel respects the user's current preference. */
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

const QUICK_ACTIONS: Array<{
  id: QuickActionId
  label: string
  icon: typeof Search01Icon
  prompt: string
  templateId: (typeof TEAM_TEMPLATES)[number]['id']
}> = [
  {
    id: 'research',
    label: 'Research',
    icon: Search01Icon,
    prompt: 'Research the problem space, gather constraints, compare approaches, and propose the most viable plan.',
    templateId: 'research',
  },
  {
    id: 'build',
    label: 'Build',
    icon: PlayIcon,
    prompt: 'Build the requested feature end-to-end, including implementation, validation, and a concise delivery summary.',
    templateId: 'coding',
  },
  {
    id: 'review',
    label: 'Review',
    icon: TaskDone01Icon,
    prompt: 'Review the current implementation for correctness, regressions, missing tests, and release risks.',
    templateId: 'coding',
  },
  {
    id: 'deploy',
    label: 'Deploy',
    icon: Rocket01Icon,
    prompt: 'Prepare the work for deployment, verify readiness, and summarize any operational follow-ups.',
    templateId: 'content',
  },
]

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createTeamFromTemplate(templateId: (typeof TEAM_TEMPLATES)[number]['id']): TeamMember[] {
  const template = TEAM_TEMPLATES.find((entry) => entry.id === templateId) ?? TEAM_TEMPLATES[1]
  return template.agents.map((name, index) => ({
    id: createId(`agent-${index + 1}`),
    name,
    modelId: index === 0 ? 'codex' : 'auto',
    roleDescription: `${name} drives ${template.name.toLowerCase()} work.`,
    goal: '',
    backstory: '',
    status: 'available',
  }))
}

function createInitialTasks(goal: string, team: TeamMember[]): HubTask[] {
  const taskTitles = [
    'Clarify mission scope',
    'Execute primary workstream',
    'Review and finalize output',
  ]
  const now = Date.now()
  return taskTitles.map((title, index) => ({
    id: createId(`task-${index + 1}`),
    title,
    description: `${title} for: ${goal}`,
    priority: index === 1 ? 'high' : 'normal',
    status: index === 0 ? 'in_progress' : 'inbox',
    agentId: team[index]?.id,
    createdAt: now + index,
    updatedAt: now + index,
  }))
}

function formatRelativeTime(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp)
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getPhase(activeMission: ReturnType<typeof useMissionStore.getState>['activeMission']): ConductorPhase {
  if (!activeMission) return 'home'
  if (activeMission.state === 'completed' || activeMission.state === 'aborted') return 'complete'
  return 'active'
}

function buildRecentMissionEntries(
  activeMission: ReturnType<typeof useMissionStore.getState>['activeMission'],
  historyReports: ReturnType<typeof useMissionStore.getState>['missionHistory']['reports'],
  storedReports: StoredMissionReport[],
): RecentMissionEntry[] {
  const items: RecentMissionEntry[] = []

  if (activeMission) {
    items.push({
      id: activeMission.id,
      title: activeMission.name || activeMission.goal || 'Untitled mission',
      subtitle: activeMission.goal || `${activeMission.team.length} active agents`,
      status: activeMission.state === 'completed' ? 'done' : 'active',
      timestamp: activeMission.startedAt,
    })
  }

  historyReports.forEach((checkpoint) => {
    items.push({
      id: checkpoint.id,
      title: checkpoint.name || checkpoint.label || checkpoint.goal || 'Untitled mission',
      subtitle: checkpoint.goal || `${checkpoint.team.length} agents`,
      status: checkpoint.status === 'completed' ? 'done' : 'idle',
      timestamp: checkpoint.completedAt ?? checkpoint.updatedAt,
    })
  })

  storedReports.forEach((report) => {
    items.push({
      id: report.missionId ?? report.id,
      title: report.name || report.goal || 'Untitled mission',
      subtitle: report.goal || report.teamName,
      status: 'done',
      timestamp: report.completedAt,
    })
  })

  const deduped = new Map<string, RecentMissionEntry>()
  items
    .sort((left, right) => right.timestamp - left.timestamp)
    .forEach((item) => {
      if (!deduped.has(item.id)) deduped.set(item.id, item)
    })

  return Array.from(deduped.values()).slice(0, 6)
}

function buildSummary(activeMission: NonNullable<ReturnType<typeof useMissionStore.getState>['activeMission']>): string[] {
  const totalTasks = activeMission.tasks.length
  const completedTasks = activeMission.tasks.filter((task) => task.status === 'done').length
  return [
    `${activeMission.team.length} agents participated in this mission.`,
    `${completedTasks} of ${totalTasks} tasks reached done state.`,
    activeMission.artifacts.length > 0
      ? `${activeMission.artifacts.length} artifacts were captured during execution.`
      : 'No artifacts were captured for this run.',
  ]
}

export function Conductor() {
  const activeMission = useMissionStore((s) => s.activeMission)
  const missionHistory = useMissionStore((s) => s.missionHistory)
  const startMission = useMissionStore((s) => s.startMission)
  const completeMission = useMissionStore((s) => s.completeMission)
  const resetMission = useMissionStore((s) => s.resetMission)
  const setMissionTasks = useMissionStore((s) => s.setMissionTasks)
  const { dispatchMission, agentSessionStatus, isDispatching, retryAgent, abortMission } = useMissionOrchestrator()

  const [goalDraft, setGoalDraft] = useState('')
  const [selectedAction, setSelectedAction] = useState<QuickActionId>('build')
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [storedReports, setStoredReports] = useState<StoredMissionReport[]>([])
  const [terminalExpanded, setTerminalExpanded] = useState(false)

  const phase = getPhase(activeMission)

  useEffect(() => {
    const syncLocalState = () => {
      setApprovals(loadApprovals())
      setStoredReports(loadStoredMissionReports())
    }

    syncLocalState()
    window.addEventListener('storage', syncLocalState)
    const intervalId = window.setInterval(syncLocalState, 3000)
    return () => {
      window.removeEventListener('storage', syncLocalState)
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (!activeMission || activeMission.state !== 'running') return
    if (activeMission.tasks.length === 0) return
    const allDone = activeMission.tasks.every((task) => task.status === 'done')
    if (allDone) {
      completeMission()
      setStoredReports(loadStoredMissionReports())
    }
  }, [activeMission, completeMission])

  const recentMissions = useMemo(
    () => buildRecentMissionEntries(activeMission, missionHistory.reports, storedReports),
    [activeMission, missionHistory.reports, storedReports],
  )

  const pendingApprovals = useMemo(
    () => approvals.filter((entry) => entry.status === 'pending'),
    [approvals],
  )

  const missionReports = useMemo(() => {
    const fromHistory = missionHistory.reports
      .map((checkpoint) => buildStoredMissionReportFromCheckpoint(checkpoint))
      .filter((entry): entry is StoredMissionReport => Boolean(entry))
    const merged = new Map<string, StoredMissionReport>()

    ;[...storedReports, ...fromHistory].forEach((entry) => {
      const key = entry.missionId ?? entry.id
      if (!merged.has(key)) merged.set(key, entry)
    })

    return Array.from(merged.values()).sort((left, right) => right.completedAt - left.completedAt)
  }, [missionHistory.reports, storedReports])

  const activeReport = useMemo(() => {
    if (!activeMission) return null
    return missionReports.find((entry) => (entry.missionId ?? entry.id) === activeMission.id) ?? null
  }, [activeMission, missionReports])

  const agentCards = useMemo(
    () =>
      activeMission?.team.map((member) => ({
        id: member.id,
        name: member.name,
        modelId: member.modelId,
        status: agentSessionStatus[member.id]?.status ?? 'idle',
      })) ?? [],
    [activeMission, agentSessionStatus],
  )

  const rightSidebarMissionReports = useMemo(
    () => (activeReport ? [activeReport] : missionReports.slice(0, 6)),
    [activeReport, missionReports],
  )

  const handleStartMission = () => {
    const trimmedGoal = goalDraft.trim()
    if (!trimmedGoal) return

    const action = QUICK_ACTIONS.find((entry) => entry.id === selectedAction) ?? QUICK_ACTIONS[1]
    const team = createTeamFromTemplate(action.templateId)
    const tasks = createInitialTasks(trimmedGoal, team)
    const startedAt = Date.now()
    const missionId = createId('mission')
    startMission({
      id: missionId,
      goal: trimmedGoal,
      name: trimmedGoal.length > 64 ? `${trimmedGoal.slice(0, 61)}...` : trimmedGoal,
      team,
      tasks,
      processType: 'parallel',
      budgetLimit: '',
      startedAt,
    })
    const mission = useMissionStore.getState().activeMission
    if (mission && mission.id === missionId) {
      void dispatchMission(mission)
    }
  }

  const handleApprovalAction = (approvalId: string, nextStatus: 'approved' | 'denied') => {
    const nextApprovals = approvals.map((entry) =>
      entry.id === approvalId
        ? { ...entry, status: nextStatus, resolvedAt: Date.now() }
        : entry,
    )
    saveApprovals(nextApprovals)
    setApprovals(nextApprovals)
  }

  const handleTaskUpdate: KanbanBoardProps['onUpdateTask'] = (updatedTask) => {
    setMissionTasks((current) =>
      current.map((task) => (task.id === updatedTask.id ? { ...updatedTask, updatedAt: Date.now() } : task)),
    )
  }

  const handleTaskDelete: KanbanBoardProps['onDeleteTask'] = (taskId) => {
    setMissionTasks((current) => current.filter((task) => task.id !== taskId))
  }

  const handleAssignAgent: NonNullable<KanbanBoardProps['onAssignAgent']> = (taskId, agentId) => {
    setMissionTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              agentId,
              status: task.status === 'inbox' ? 'assigned' : task.status,
              updatedAt: Date.now(),
            }
          : task,
      ),
    )
  }

  const handleNewMission = () => {
    resetMission()
    setGoalDraft('')
    setSelectedAction('build')
  }

  if (phase === 'home') {
    return (
      <div className="h-full min-h-full bg-[var(--theme-bg)] text-[var(--theme-text)]" style={THEME_STYLE}>
        <main className="mx-auto flex min-h-full max-w-[720px] flex-col items-center justify-center px-6 py-12">
          <div className="w-full space-y-8">
            <div className="space-y-3 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-muted)]">
                Conductor
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--theme-text)] md:text-4xl">
                What should the team do next?
              </h1>
              <p className="text-sm text-[var(--theme-muted-2)]">
                Start a mission, keep the workspace focused, and expand only when execution is live.
              </p>
            </div>

            <section className="overflow-hidden rounded-3xl border border-[var(--theme-border2)] bg-[var(--theme-card)] shadow-[0_24px_80px_var(--theme-shadow)]">
              <textarea
                value={goalDraft}
                onChange={(event) => setGoalDraft(event.target.value)}
                placeholder="Describe the mission, constraints, and desired outcome."
                className="min-h-[180px] w-full resize-none bg-[var(--theme-card)] px-6 py-5 text-base text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted-2)]"
              />
              <div className="flex flex-col gap-3 border-t border-[var(--theme-border)] px-4 py-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => {
                        setSelectedAction(action.id)
                        setGoalDraft(action.prompt)
                      }}
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
                  onClick={handleStartMission}
                  disabled={!goalDraft.trim() || isDispatching}
                  className="min-w-[140px] rounded-xl bg-[var(--theme-accent)] text-white hover:bg-[var(--theme-accent-strong)]"
                >
                  {isDispatching ? 'Launching…' : 'Launch Mission'}
                  <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.7} />
                </Button>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted-2)]">
                Recent Missions
              </div>
              <div className="space-y-2">
                {recentMissions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-5 text-sm text-[var(--theme-muted)]">
                    No recent missions yet.
                  </div>
                ) : (
                  recentMissions.map((mission) => (
                    <div
                      key={mission.id}
                      className="flex items-center gap-3 rounded-2xl border border-transparent px-4 py-3 transition-colors hover:border-[var(--theme-border)] hover:bg-[var(--theme-card)]"
                    >
                      <span
                        className={cn(
                          'size-2.5 rounded-full',
                          mission.status === 'done'
                            ? 'bg-emerald-400'
                            : mission.status === 'active'
                              ? 'bg-[var(--theme-accent)] shadow-[0_0_12px_var(--theme-accent-glow)]'
                              : 'bg-[var(--theme-border2)]',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[var(--theme-text)]">{mission.title}</div>
                        <div className="truncate text-xs text-[var(--theme-muted)]">{mission.subtitle}</div>
                      </div>
                      <div className="text-xs text-[var(--theme-muted-2)]">{formatRelativeTime(mission.timestamp)}</div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    )
  }

  if (!activeMission) return null

  if (phase === 'complete') {
    const summaryLines = buildSummary(activeMission)
    const costEstimate = activeReport?.costEstimate ?? 0
    const tokenCount = activeReport?.tokenCount ?? 0

    return (
      <div className="h-full min-h-full bg-[var(--theme-bg)] text-[var(--theme-text)]" style={THEME_STYLE}>
        <main className="grid h-full min-h-0 grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="flex min-h-0 flex-col overflow-y-auto px-6 py-8 lg:px-10">
            <div className="mx-auto w-full max-w-3xl space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-400">Mission Complete</p>
                <h1 className="text-3xl font-semibold tracking-tight">{activeMission.name || activeMission.goal}</h1>
                <p className="text-sm text-[var(--theme-muted)]">{activeMission.goal}</p>
              </div>

              <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Summary</h2>
                <div className="mt-4 space-y-3">
                  {summaryLines.map((line) => (
                    <p key={line} className="text-sm leading-6 text-[var(--theme-text)]">
                      {line}
                    </p>
                  ))}
                </div>
              </div>

              {activeReport?.report ? (
                <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Report</h2>
                  <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-6 text-[var(--theme-text)]">
                    {activeReport.report}
                  </pre>
                </div>
              ) : null}

              <Button
                onClick={handleNewMission}
                className="inline-flex w-fit rounded-xl bg-[var(--theme-accent)] text-white hover:bg-[var(--theme-accent-strong)]"
              >
                <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={1.7} />
                New Mission
              </Button>
            </div>
          </section>

          <aside className="border-t border-[var(--theme-border)] bg-[var(--theme-card)] px-5 py-6 lg:border-l lg:border-t-0">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Final Cost</p>
                <p className="mt-2 text-3xl font-semibold text-[var(--theme-text)]">${costEstimate.toFixed(2)}</p>
              </div>
              <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-4">
                <p className="text-xs text-[var(--theme-muted)]">Tokens</p>
                <p className="mt-1 text-xl font-semibold text-[var(--theme-text)]">{tokenCount.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-4">
                <p className="text-xs text-[var(--theme-muted)]">Artifacts</p>
                <p className="mt-1 text-xl font-semibold text-[var(--theme-text)]">{activeMission.artifacts.length}</p>
              </div>
            </div>
          </aside>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-full flex-col overflow-hidden bg-[var(--theme-bg)] text-[var(--theme-text)]" style={THEME_STYLE}>
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_340px]">
        <aside className="flex min-h-0 flex-col border-r border-[var(--theme-border)] bg-[var(--theme-bg)]">
          <div className="border-b border-[var(--theme-border)] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted-2)]">Missions</p>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {recentMissions.map((mission) => (
              <button
                key={mission.id}
                type="button"
                className={cn(
                  'flex w-full flex-col items-start gap-1 rounded-xl border px-3 py-3 text-left transition-colors',
                  mission.id === activeMission.id
                    ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)]'
                    : 'border-transparent hover:border-[var(--theme-border)] hover:bg-[var(--theme-card)]',
                )}
              >
                <span className="text-sm font-medium text-[var(--theme-text)]">{mission.title}</span>
                <span className="text-[11px] text-[var(--theme-muted)]">{formatRelativeTime(mission.timestamp)}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-[var(--theme-border)] px-3 py-3">
            <div className="space-y-2">
              {agentCards.map((agent) => (
                <div key={agent.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      agent.status === 'active' ? 'bg-emerald-400' : agent.status === 'waiting_for_input' ? 'bg-amber-400' : 'bg-[var(--theme-border2)]',
                    )}
                  />
                  <span className="truncate text-xs text-[var(--theme-text)]">{agent.name}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden">
          <RunConsole
            runId={activeMission.id}
            runTitle={activeMission.name || activeMission.goal}
            runStatus="running"
            agents={agentCards}
            pendingApprovals={pendingApprovals.map((entry) => ({
              id: entry.id,
              tool: entry.action,
              args: entry.context,
              agentName: entry.agentName,
            }))}
            startedAt={activeMission.startedAt}
            tokenCount={activeReport?.tokenCount}
            costEstimate={activeReport?.costEstimate}
            sessionKeys={Object.values(activeMission.agentSessionMap)}
            agentNameMap={Object.fromEntries(
              Object.entries(activeMission.agentSessionMap).map(([agentId, sessionKey]) => [
                sessionKey,
                activeMission.team.find((member) => member.id === agentId)?.name ?? agentId,
              ]),
            )}
            artifacts={activeMission.artifacts.map((artifact) => ({
              id: artifact.id,
              type: artifact.type === 'code' ? 'file' : 'output',
              name: artifact.title,
              content: artifact.content,
              timestamp: artifact.timestamp,
            }))}
            onStopMission={() => void abortMission()}
            onApprove={(approvalId) => handleApprovalAction(approvalId, 'approved')}
            onDeny={(approvalId) => handleApprovalAction(approvalId, 'denied')}
          />
        </section>

        <aside className="flex min-h-0 flex-col overflow-y-auto border-l border-[var(--theme-border)] bg-[var(--theme-bg)]">
          <section className="border-b border-[var(--theme-border)] p-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Board</h2>
            </div>
            <div className="h-[260px] overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)]">
              <KanbanBoard
                tasks={activeMission.tasks}
                onUpdateTask={handleTaskUpdate}
                onDeleteTask={handleTaskDelete}
                agents={activeMission.team.map((member) => ({ id: member.id, name: member.name }))}
                missionId={activeMission.id}
                onAssignAgent={handleAssignAgent}
                compact
              />
            </div>
          </section>

          <section className="border-b border-[var(--theme-border)]">
            <div className="px-3 pt-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Team</h2>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              <TeamPanel
                team={activeMission.team}
                activeTemplateId="coding"
                agentSessionStatus={agentSessionStatus}
                agentSessionMap={activeMission.agentSessionMap}
                tasks={activeMission.tasks}
                onRetrySpawn={(member) => {
                  void retryAgent(member.id)
                }}
                onApplyTemplate={() => {}}
                onAddAgent={() => {}}
                onUpdateAgent={() => {}}
              />
            </div>
          </section>

          <section className="border-b border-[var(--theme-border)] p-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Approvals</h2>
              <ApprovalsBell
                approvals={approvals}
                onApprove={(approvalId) => handleApprovalAction(approvalId, 'approved')}
                onDeny={(approvalId) => handleApprovalAction(approvalId, 'denied')}
              />
            </div>
            <div className="space-y-2">
              {pendingApprovals.length === 0 ? (
                <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-4 text-xs text-[var(--theme-muted)]">
                  No pending approvals.
                </div>
              ) : (
                pendingApprovals.slice(0, 3).map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-3">
                    <div className="text-xs font-semibold text-amber-300">{entry.agentName}</div>
                    <div className="mt-1 text-xs text-[var(--theme-text)]">{entry.action}</div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="min-h-0 flex-1 p-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Cost</h2>
            </div>
            <div className="h-[320px] overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)]">
              <CostAnalyticsDashboard missionReports={rightSidebarMissionReports} compact />
            </div>
          </section>
        </aside>
      </div>

      <section className="border-t border-[var(--theme-border)] bg-[var(--theme-card)]">
        <button
          type="button"
          onClick={() => setTerminalExpanded((current) => !current)}
          className="flex w-full items-center justify-between px-4 py-2 text-left"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Terminal Workspace</p>
            <p className="text-xs text-[var(--theme-muted-2)]">
              {terminalExpanded ? 'Collapse terminal' : 'Expand terminal'}
            </p>
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
