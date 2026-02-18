import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TeamPanel, TEAM_TEMPLATES, MODEL_PRESETS, type ModelPresetId, type TeamMember, type TeamTemplateId } from './components/team-panel'
import { TaskBoard, type HubTask, type TaskBoardRef } from './components/task-board'
import { LiveFeedPanel } from './components/live-feed-panel'
import { emitFeedEvent } from './components/feed-event-bus'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type AgentHubLayoutProps = {
  agents: Array<{
    id: string
    name: string
    role: string
    status: string
  }>
}

const TEAM_STORAGE_KEY = 'clawsuite:hub-team'

const TEMPLATE_MODEL_SUGGESTIONS: Record<TeamTemplateId, Array<ModelPresetId>> = {
  research: ['opus', 'sonnet', 'auto'],
  coding: ['opus', 'codex', 'sonnet'],
  content: ['opus', 'sonnet', 'flash'],
}

const MODEL_IDS = new Set<string>(MODEL_PRESETS.map((preset) => preset.id))

function toTitleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function createMemberId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createTaskId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().slice(0, 8)
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function cleanMissionSegment(value: string): string {
  return value
    .replace(/^\s*[-*+]\s*/, '')
    .replace(/^\s*\d+\s*[.)-]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractMissionItems(goal: string): string[] {
  const rawSegments = goal
    .replace(/\r/g, '\n')
    .replace(/[•●▪◦]/g, '\n')
    .replace(/[.?!;]+/g, '\n')
    .split('\n')
    .flatMap((line) => line.split(/\s*,\s*|\s+\band\b\s+/gi))
    .map(cleanMissionSegment)
    .filter((segment) => segment.length > 5)

  const uniqueSegments: string[] = []
  const seen = new Set<string>()
  rawSegments.forEach((segment) => {
    const key = segment.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    uniqueSegments.push(segment)
  })
  return uniqueSegments
}

function parseMissionGoal(goal: string, teamMembers: TeamMember[]): HubTask[] {
  const trimmedGoal = goal.trim()
  if (!trimmedGoal) return []
  const now = Date.now()
  const tasks: HubTask[] = [
    {
      id: createTaskId(),
      title: trimmedGoal,
      description: '',
      priority: 'high',
      status: 'inbox',
      createdAt: now,
      updatedAt: now,
    },
  ]

  const segments = extractMissionItems(trimmedGoal)
  if (segments.length <= 1) return tasks

  const normalizedGoal = trimmedGoal.toLowerCase()
  const subtasks = segments.filter((segment) => segment.toLowerCase() !== normalizedGoal)

  subtasks.forEach((segment, index) => {
    const member = teamMembers.length > 0 ? teamMembers[index % teamMembers.length] : undefined
    const createdAt = now + index + 1
    tasks.push({
      id: createTaskId(),
      title: segment,
      description: '',
      priority: 'normal',
      status: member ? 'assigned' : 'inbox',
      agentId: member?.id,
      createdAt,
      updatedAt: createdAt,
    })
  })

  return tasks
}

function truncateMissionGoal(goal: string, max = 110): string {
  if (goal.length <= max) return goal
  return `${goal.slice(0, max - 1).trimEnd()}…`
}

function buildTeamFromTemplate(templateId: TeamTemplateId): TeamMember[] {
  const template = TEAM_TEMPLATES.find((entry) => entry.id === templateId)
  if (!template) return []

  const modelSuggestions = TEMPLATE_MODEL_SUGGESTIONS[template.id]

  return template.agents.map((agentName, index) => ({
    id: `${template.id}-${agentName}`,
    name: toTitleCase(agentName),
    modelId: modelSuggestions[index] ?? 'auto',
    roleDescription: `${toTitleCase(agentName)} lead for this mission`,
    status: 'available',
  }))
}

function buildTeamFromRuntime(
  agents: AgentHubLayoutProps['agents'],
): TeamMember[] {
  return agents.slice(0, 5).map((agent) => ({
    id: agent.id,
    name: agent.name,
    modelId: 'auto',
    roleDescription: agent.role,
    status: agent.status || 'available',
  }))
}

function toTeamMember(value: unknown): TeamMember | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const row = value as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const status = typeof row.status === 'string' ? row.status.trim() : 'available'
  const roleDescription =
    typeof row.roleDescription === 'string' ? row.roleDescription : ''
  const modelIdRaw = typeof row.modelId === 'string' ? row.modelId : 'auto'
  const modelId = MODEL_IDS.has(modelIdRaw)
    ? (modelIdRaw as ModelPresetId)
    : 'auto'

  if (!id || !name) return null

  return {
    id,
    name,
    modelId,
    roleDescription,
    status: status || 'available',
  }
}

function readStoredTeam(): TeamMember[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(TEAM_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => toTeamMember(entry))
      .filter((entry): entry is TeamMember => Boolean(entry))
  } catch {
    return []
  }
}

function suggestTemplate(goal: string): TeamTemplateId {
  const normalized = goal.toLowerCase()
  const hasAny = (keywords: string[]) =>
    keywords.some((keyword) => normalized.includes(keyword))

  if (hasAny(['coding', 'code', 'dev', 'build', 'ship', 'fix', 'bug'])) {
    return 'coding'
  }
  if (hasAny(['research', 'analyze', 'investigate', 'report'])) {
    return 'research'
  }
  if (hasAny(['write', 'content', 'blog', 'copy', 'edit'])) {
    return 'content'
  }
  return 'coding'
}

function resolveActiveTemplate(team: TeamMember[]): TeamTemplateId | undefined {
  return TEAM_TEMPLATES.find((template) => {
    if (team.length !== template.agents.length) return false
    return template.agents.every((agentName) =>
      team.some((member) => member.id === `${template.id}-${agentName}`),
    )
  })?.id
}

export function AgentHubLayout({ agents }: AgentHubLayoutProps) {
  const [missionActive, setMissionActive] = useState(false)
  const [missionGoal, setMissionGoal] = useState('')
  const [activeMissionGoal, setActiveMissionGoal] = useState('')
  const [showNewMission, setShowNewMission] = useState(true)
  const [view, setView] = useState<'board' | 'timeline'>('board')
  const [missionState, setMissionState] = useState<'running' | 'paused' | 'stopped'>(
    'stopped',
  )
  const [budgetLimit, setBudgetLimit] = useState('120000')
  const [autoAssign, setAutoAssign] = useState(true)
  const [teamPanelFlash, setTeamPanelFlash] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string>()
  const [boardTasks, setBoardTasks] = useState<Array<HubTask>>([])
  const [team, setTeam] = useState<TeamMember[]>(() => {
    const stored = readStoredTeam()
    if (stored.length > 0) return stored
    const runtimeTeam = buildTeamFromRuntime(agents)
    if (runtimeTeam.length > 0) return runtimeTeam
    return buildTeamFromTemplate('research')
  })
  const taskBoardRef = useRef<TaskBoardRef | null>(null)
  const pendingMissionTasksRef = useRef<Array<HubTask>>([])
  const teamPanelFlashTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(team))
  }, [team])

  useEffect(() => {
    if (team.length > 0) return
    const runtimeTeam = buildTeamFromRuntime(agents)
    if (runtimeTeam.length > 0) {
      setTeam(runtimeTeam)
      return
    }
    setTeam(buildTeamFromTemplate('research'))
  }, [agents, team.length])

  useEffect(() => {
    if (!selectedAgentId) return
    const exists = team.some((member) => member.id === selectedAgentId)
    if (!exists) setSelectedAgentId(undefined)
  }, [selectedAgentId, team])

  useEffect(
    () => () => {
      if (teamPanelFlashTimerRef.current !== undefined) {
        window.clearTimeout(teamPanelFlashTimerRef.current)
      }
    },
    [],
  )

  const runtimeById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [
    agents,
  ])

  const teamWithRuntimeStatus = useMemo(
    () =>
      team.map((member) => {
        const runtimeAgent = runtimeById.get(member.id)
        if (!runtimeAgent) return member
        return {
          ...member,
          status: runtimeAgent.status || member.status,
        }
      }),
    [runtimeById, team],
  )

  const boardAgents = useMemo(
    () => teamWithRuntimeStatus.map((member) => ({ id: member.id, name: member.name })),
    [teamWithRuntimeStatus],
  )
  const agentTaskCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    boardTasks.forEach((task) => {
      if (!task.agentId) return
      counts[task.agentId] = (counts[task.agentId] ?? 0) + 1
    })
    return counts
  }, [boardTasks])
  const activeTemplateId = useMemo(() => resolveActiveTemplate(team), [team])
  const missionBadge = useMemo(() => {
    if (missionState === 'paused') {
      return {
        label: 'Paused',
        className: 'bg-amber-500 text-white',
      }
    }
    if (missionState === 'stopped') {
      return {
        label: 'Stopped',
        className: 'bg-red-500 text-white',
      }
    }
    return {
      label: 'Running',
      className: 'bg-emerald-500 text-white',
    }
  }, [missionState])

  const handleTaskBoardRef = useCallback((api: TaskBoardRef) => {
    taskBoardRef.current = api
    if (pendingMissionTasksRef.current.length === 0) return
    api.addTasks(pendingMissionTasksRef.current)
    pendingMissionTasksRef.current = []
  }, [])

  function applyTemplate(templateId: TeamTemplateId) {
    setTeam(buildTeamFromTemplate(templateId))
    setSelectedAgentId(undefined)
  }

  function flashTeamPanel() {
    setTeamPanelFlash(true)
    if (teamPanelFlashTimerRef.current !== undefined) {
      window.clearTimeout(teamPanelFlashTimerRef.current)
    }
    teamPanelFlashTimerRef.current = window.setTimeout(() => {
      setTeamPanelFlash(false)
    }, 750)
  }

  function handleAddAgent() {
    setTeam((previous) => [
      ...previous,
      {
        id: createMemberId(),
        name: `Agent ${previous.length + 1}`,
        modelId: 'auto',
        roleDescription: '',
        status: 'available',
      },
    ])
  }

  function handleAutoConfigure() {
    const trimmedGoal = missionGoal.trim()
    if (!trimmedGoal) return
    applyTemplate(suggestTemplate(trimmedGoal))
    flashTeamPanel()
  }

  function handleCreateMission() {
    const trimmedGoal = missionGoal.trim()
    if (!trimmedGoal) return
    const createdTasks = parseMissionGoal(trimmedGoal, teamWithRuntimeStatus)

    setMissionActive(true)
    setShowNewMission(false)
    setMissionState('running')
    setView('board')
    setActiveMissionGoal(trimmedGoal)
    emitFeedEvent({
      type: 'mission_started',
      message: `Mission started: ${trimmedGoal}`,
    })
    if (createdTasks.length > 0) {
      if (missionActive && taskBoardRef.current) {
        taskBoardRef.current.addTasks(createdTasks)
      } else {
        pendingMissionTasksRef.current = [...createdTasks, ...pendingMissionTasksRef.current]
      }
    }
    toast(`Mission started with ${createdTasks.length} tasks`, { type: 'success' })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-primary-200 px-5 py-3">
        <div>
          <h1 className="text-base font-semibold text-primary-900 dark:text-neutral-100">
            Agent Hub
          </h1>
          <p className="text-xs text-primary-500">Mission Control</p>
        </div>

        <div className="flex min-h-[30px] items-center">
          {missionActive ? (
            <div className="flex items-center rounded-lg border border-primary-200 bg-white p-0.5 dark:border-neutral-700 dark:bg-neutral-900">
              <button
                type="button"
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  view === 'board'
                    ? 'bg-primary-100 text-primary-800 dark:bg-neutral-800 dark:text-neutral-100'
                    : 'text-primary-500 hover:text-primary-700',
                )}
                onClick={() => setView('board')}
              >
                Board
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  view === 'timeline'
                    ? 'bg-primary-100 text-primary-800 dark:bg-neutral-800 dark:text-neutral-100'
                    : 'text-primary-500 hover:text-primary-700',
                )}
                onClick={() => setView('timeline')}
              >
                Timeline
              </button>
            </div>
          ) : (
            <p className="text-xs text-primary-400">Agent Hub · Mission Control</p>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div
          className={cn(
            'w-[280px] shrink-0 transition-colors',
            teamPanelFlash && 'bg-emerald-50/70 dark:bg-emerald-900/10',
          )}
        >
          <TeamPanel
            team={teamWithRuntimeStatus}
            activeTemplateId={activeTemplateId}
            agentTaskCounts={agentTaskCounts}
            onApplyTemplate={applyTemplate}
            onAddAgent={handleAddAgent}
            onUpdateAgent={(agentId, updates) => {
              setTeam((previous) =>
                previous.map((member) =>
                  member.id === agentId ? { ...member, ...updates } : member,
                ),
              )
            }}
            onSelectAgent={setSelectedAgentId}
          />
        </div>

        <div className="min-w-0 flex-1 overflow-hidden border-l border-primary-200">
          {!missionActive ? (
            showNewMission ? (
              <div className="flex h-full items-center justify-center px-8 py-6">
                <div className="w-full max-w-2xl rounded-2xl border border-primary-200 bg-white/80 px-8 py-6 text-center shadow-sm dark:border-neutral-700 dark:bg-neutral-900/70">
                  <div className="mb-4 flex flex-wrap items-center justify-center gap-2 text-xs text-primary-400">
                    <span className="rounded-full bg-primary-100 px-2 py-0.5">
                      1. Choose a team template
                    </span>
                    <span className="text-primary-300">→</span>
                    <span className="rounded-full bg-primary-100 px-2 py-0.5">
                      2. Describe your mission
                    </span>
                    <span className="text-primary-300">→</span>
                    <span className="rounded-full bg-primary-100 px-2 py-0.5">3. Launch</span>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-500">
                    No Active Mission
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-primary-900 dark:text-neutral-100">
                    + Create Mission
                  </h2>
                  <p className="mt-2 text-sm text-primary-500">
                    Describe your goal and we&apos;ll suggest an agent team.
                  </p>

                  <div className="mt-5 space-y-3">
                    <textarea
                      value={missionGoal}
                      onChange={(event) => setMissionGoal(event.target.value)}
                      rows={4}
                      placeholder="Example: Ship a release plan and implementation tasks for authentication hardening"
                      className="w-full resize-none rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm text-primary-900 outline-none ring-accent-400 focus:ring-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                    />
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={handleAutoConfigure}
                        disabled={!missionGoal.trim()}
                        className="rounded-lg border border-accent-400 px-4 py-2 text-xs font-medium text-accent-600 transition-colors hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        ✨ Auto-configure
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateMission}
                        disabled={!missionGoal.trim()}
                        className="rounded-lg bg-accent-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Start Mission
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center px-6">
                <div className="rounded-xl border border-primary-200 bg-white/80 px-6 py-5 text-center dark:border-neutral-700 dark:bg-neutral-900/70">
                  <h2 className="text-sm font-semibold text-primary-900 dark:text-neutral-100">
                    Mission stopped
                  </h2>
                  <p className="mt-1 text-xs text-primary-500">
                    Launch a new mission to resume orchestration.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowNewMission(true)}
                    className="mt-3 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-600"
                  >
                    Create another mission
                  </button>
                </div>
              </div>
            )
          ) : view === 'timeline' ? (
            <div className="flex h-full items-center justify-center px-6">
              <div className="rounded-xl border border-dashed border-primary-300 bg-white/60 px-6 py-5 text-center dark:border-neutral-700 dark:bg-neutral-900/50">
                <h3 className="text-sm font-semibold text-primary-900 dark:text-neutral-100">
                  Timeline view coming soon
                </h3>
                <p className="mt-1 text-xs text-primary-500">
                  Switch back to Board for active mission orchestration.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-emerald-200 bg-emerald-50/40 px-4 py-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/15">
                <p className="truncate text-xs font-medium text-emerald-800 dark:text-emerald-200">
                  Mission: {truncateMissionGoal(activeMissionGoal || missionGoal.trim())}
                </p>
                <span
                  className={cn(
                    'ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    missionBadge.className,
                  )}
                >
                  {missionBadge.label}
                </span>
              </div>
              <div className="min-h-0 flex-1">
                <TaskBoard
                  agents={boardAgents}
                  selectedAgentId={selectedAgentId}
                  onRef={handleTaskBoardRef}
                  onTasksChange={setBoardTasks}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex w-[280px] shrink-0 flex-col border-l border-primary-200 bg-primary-50/30 dark:bg-neutral-900/20">
          <div className="min-h-0 flex-1 overflow-hidden">
            <LiveFeedPanel />
          </div>

          <div className="border-t border-primary-200 px-4 py-3">
            {missionActive ? (
              <>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                  Mission Controls
                </h3>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMissionState('running')}
                    className={cn(
                      'rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors',
                      missionState === 'running'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
                    )}
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    onClick={() => setMissionState('paused')}
                    className={cn(
                      'rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors',
                      missionState === 'paused'
                        ? 'bg-amber-500 text-white'
                        : 'bg-amber-100 text-amber-700 hover:bg-amber-200',
                    )}
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMissionState('stopped')
                      setMissionActive(false)
                      setShowNewMission(false)
                      setActiveMissionGoal('')
                      taskBoardRef.current = null
                    }}
                    className="rounded-md bg-red-100 px-2 py-1.5 text-[11px] font-semibold text-red-700 transition-colors hover:bg-red-200"
                  >
                    Stop
                  </button>
                </div>

                <label className="mt-3 block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-primary-500">
                    Budget Limit (max tokens)
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={budgetLimit}
                    onChange={(event) => setBudgetLimit(event.target.value)}
                    className="w-full rounded-md border border-primary-200 bg-white px-2 py-1.5 text-xs text-primary-900 outline-none ring-accent-400 focus:ring-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setAutoAssign((current) => !current)}
                  className="mt-2 flex w-full items-center justify-between rounded-md border border-primary-200 bg-white px-2 py-1.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                >
                  <span>Auto-assign tasks</span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      autoAssign
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : 'bg-primary-100 text-primary-600 dark:bg-neutral-700 dark:text-neutral-300',
                    )}
                  >
                    {autoAssign ? 'On' : 'Off'}
                  </span>
                </button>
              </>
            ) : (
              <p className="text-xs text-primary-400">Start a mission to see controls here</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
