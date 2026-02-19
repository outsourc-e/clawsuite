import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TeamPanel, TEAM_TEMPLATES, MODEL_PRESETS, type ModelPresetId, type TeamMember, type TeamTemplateId, type AgentSessionStatusEntry } from './components/team-panel'
import { TaskBoard, type HubTask, type TaskBoardRef, type TaskStatus } from './components/task-board'
import { LiveFeedPanel } from './components/live-feed-panel'
import { AgentOutputPanel } from './components/agent-output-panel'
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

// Signals from an agent response that mean it finished its task batch
const COMPLETION_SIGNALS = [
  'done',
  'completed',
  'task complete',
  'tasks complete',
  'all done',
  'finished',
  'complete.',
]

function isCompletionSignal(text: string): boolean {
  const lower = text.toLowerCase()
  return COMPLETION_SIGNALS.some((signal) => lower.includes(signal))
}

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

function capitalizeFirst(value: string): string {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length
}

function cleanMissionSegment(value: string): string {
  const normalized = value
    .replace(/^\s*[-*+]\s*/, '')
    .replace(/^\s*\d+\s*[.)-]\s*/, '')
    .replace(/[.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return capitalizeFirst(normalized)
}

function extractMissionItems(goal: string): string[] {
  const rawSegments = goal
    .replace(/\r/g, '\n')
    .replace(/[•●▪◦]/g, '\n')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\b\d+\.\s+/g, '\n')
    .replace(/[.?!;]+\s*/g, '\n')
    .split('\n')
    .flatMap((line) => line.split(/,\s+|\s+\band\b\s+/gi))
    .map(cleanMissionSegment)
    .filter((segment) => segment.length > 0 && wordCount(segment) >= 3)

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
  const segments = extractMissionItems(trimmedGoal)
  const normalizedGoal = cleanMissionSegment(trimmedGoal)
  const missionItems =
    segments.length > 0
      ? segments
      : normalizedGoal
        ? [normalizedGoal]
        : []

  return missionItems.map((segment, index) => {
    const member = teamMembers.length > 0 ? teamMembers[index % teamMembers.length] : undefined
    const createdAt = now + index
    return {
      id: createTaskId(),
      title: segment,
      description: '',
      priority: index === 0 ? 'high' : 'normal',
      status: member ? 'assigned' : 'inbox',
      agentId: member?.id,
      createdAt,
      updatedAt: createdAt,
    }
  })
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

type SessionRecord = Record<string, unknown>

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readSessionId(session: SessionRecord): string {
  return readString(session.key) || readString(session.friendlyId)
}

function readSessionName(session: SessionRecord): string {
  return (
    readString(session.label) ||
    readString(session.displayName) ||
    readString(session.title) ||
    readString(session.friendlyId) ||
    readString(session.key)
  )
}

function readSessionLastMessage(session: SessionRecord): string {
  const record =
    session.lastMessage && typeof session.lastMessage === 'object' && !Array.isArray(session.lastMessage)
      ? (session.lastMessage as Record<string, unknown>)
      : null
  if (!record) return ''
  const directText = readString(record.text)
  if (directText) return directText
  const parts = Array.isArray(record.content) ? record.content : []
  return parts
    .map((part) => {
      if (!part || typeof part !== 'object' || Array.isArray(part)) return ''
      return readString((part as Record<string, unknown>).text)
    })
    .filter(Boolean)
    .join(' ')
}

function readSessionActivityMarker(session: SessionRecord): string {
  const updatedAtRaw =
    typeof session.updatedAt === 'number' || typeof session.updatedAt === 'string'
      ? String(session.updatedAt)
      : ''
  const lastMessage = readSessionLastMessage(session)
  const status = readString(session.status)
  return `${updatedAtRaw}|${status}|${lastMessage}`
}

// Pending task that needs to be dispatched after resume
type PendingDispatch = {
  agentId: string
  member: TeamMember | undefined
  tasks: HubTask[]
  missionGoalValue: string
}

function TeamActivityStrip({
  team,
  tasks,
  selectedAgentId,
  onSelectAgent,
}: {
  team: TeamMember[]
  tasks: HubTask[]
  selectedAgentId?: string
  onSelectAgent?: (agentId: string) => void
}) {
  return (
    <div className="flex items-center gap-4 overflow-x-auto border-b border-primary-100 bg-primary-50/50 px-5 py-2 dark:border-neutral-800 dark:bg-neutral-900/30">
      {team.map((member) => {
        const assignedTask = tasks.find(
          (task) => task.agentId === member.id && task.status !== 'done',
        )
        const isActive = Boolean(assignedTask)
        const isSelected = selectedAgentId === member.id

        return (
          <button
            key={member.id}
            type="button"
            onClick={() => onSelectAgent?.(member.id)}
            className={cn(
              'flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors',
              isSelected
                ? 'bg-accent-100/80 dark:bg-accent-900/20'
                : 'hover:bg-primary-100/80 dark:hover:bg-neutral-800/60',
            )}
          >
            <span className="relative inline-flex size-2.5 shrink-0">
              {isActive ? (
                <span className="absolute inset-0 rounded-full bg-emerald-400/70 animate-ping" />
              ) : null}
              <span
                className={cn(
                  'relative inline-flex size-2.5 rounded-full',
                  isActive ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600',
                )}
              />
            </span>
            <span className="shrink-0 text-xs font-medium text-primary-700 dark:text-neutral-200">
              {member.name}
            </span>
            <span className="max-w-[180px] truncate text-[10px] text-primary-500 dark:text-neutral-400">
              {assignedTask ? `Working on: ${assignedTask.title}` : 'Idle'}
            </span>
          </button>
        )
      })}
    </div>
  )
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
  const [selectedOutputAgentId, setSelectedOutputAgentId] = useState<string>()
  const [boardTasks, setBoardTasks] = useState<Array<HubTask>>([])
  const [missionTasks, setMissionTasks] = useState<Array<HubTask>>([])
  const [dispatchedTaskIdsByAgent, setDispatchedTaskIdsByAgent] = useState<Record<string, Array<string>>>({})
  const [agentSessionMap, setAgentSessionMap] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const stored = window.localStorage.getItem('clawsuite:hub-agent-sessions')
      return stored ? (JSON.parse(stored) as Record<string, string>) : {}
    } catch {
      return {}
    }
  })
  const [spawnState, setSpawnState] = useState<Record<string, 'idle' | 'spawning' | 'ready' | 'error'>>({})
  const [agentSessionStatus, setAgentSessionStatus] = useState<Record<string, AgentSessionStatusEntry>>({})
  const [team, setTeam] = useState<TeamMember[]>(() => {
    const stored = readStoredTeam()
    if (stored.length > 0) return stored
    const runtimeTeam = buildTeamFromRuntime(agents)
    if (runtimeTeam.length > 0) return runtimeTeam
    return buildTeamFromTemplate('research')
  })

  // ── Core refs ─────────────────────────────────────────────────────────────
  const taskBoardRef = useRef<TaskBoardRef | null>(null)
  const teamPanelFlashTimerRef = useRef<number | undefined>(undefined)
  const pendingTaskMovesRef = useRef<Array<{ taskIds: Array<string>; status: TaskStatus }>>([])
  const sessionActivityRef = useRef<Map<string, string>>(new Map())
  const dispatchingRef = useRef(false)

  // ── Spec 4 refs ───────────────────────────────────────────────────────────

  /** Idempotency: set of task IDs already sent to agents */
  const dispatchedTaskIdsRef = useRef<Set<string>>(new Set())

  /** Pause/Resume: tasks waiting to be dispatched when mission resumes */
  const pendingDispatchTasksRef = useRef<PendingDispatch[]>([])

  /** Sync copy of missionState for use inside async callbacks */
  const missionStateRef = useRef<'running' | 'paused' | 'stopped'>('stopped')

  /** Sync copy of agentSessionMap for use inside async callbacks */
  const agentSessionMapRef = useRef<Record<string, string>>(agentSessionMap)

  /** Sync copy of boardTasks for use inside stop handler */
  const boardTasksRef = useRef<Array<HubTask>>([])

  /** Sync copy of activeMissionGoal for use in resumeDispatch */
  const activeMissionGoalRef = useRef('')

  /** Completion detection: agentId → dispatched taskIds */
  const agentTasksRef = useRef<Map<string, string[]>>(new Map())

  /** Completion detection: sessionKey → time tasks were dispatched */
  const sessionDispatchTimeRef = useRef<Map<string, number>>(new Map())

  /** Completion detection: sessions that already received a 10-min timeout warning */
  const warnedSessionsRef = useRef<Set<string>>(new Set())

  // ── Keep refs in sync with state ──────────────────────────────────────────
  useEffect(() => { missionStateRef.current = missionState }, [missionState])
  useEffect(() => { agentSessionMapRef.current = agentSessionMap }, [agentSessionMap])
  useEffect(() => { boardTasksRef.current = boardTasks }, [boardTasks])
  useEffect(() => { activeMissionGoalRef.current = activeMissionGoal }, [activeMissionGoal])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(team))
  }, [team])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('clawsuite:hub-agent-sessions', JSON.stringify(agentSessionMap))
  }, [agentSessionMap])

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

  useEffect(() => {
    if (!selectedOutputAgentId) return
    const exists = team.some((member) => member.id === selectedOutputAgentId)
    if (!exists) setSelectedOutputAgentId(undefined)
  }, [selectedOutputAgentId, team])

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
  const teamById = useMemo(
    () => new Map(teamWithRuntimeStatus.map((member) => [member.id, member])),
    [teamWithRuntimeStatus],
  )
  const selectedOutputTasks = useMemo(() => {
    if (!selectedOutputAgentId) return []
    const taskSource = boardTasks.length > 0 ? boardTasks : missionTasks
    const dispatchedTaskIds = dispatchedTaskIdsByAgent[selectedOutputAgentId]
    if (!dispatchedTaskIds || dispatchedTaskIds.length === 0) {
      return taskSource.filter((task) => task.agentId === selectedOutputAgentId)
    }

    const dispatchedSet = new Set(dispatchedTaskIds)
    return taskSource.filter(
      (task) => task.agentId === selectedOutputAgentId && dispatchedSet.has(task.id),
    )
  }, [boardTasks, dispatchedTaskIdsByAgent, missionTasks, selectedOutputAgentId])
  const selectedOutputAgentName = selectedOutputAgentId
    ? teamById.get(selectedOutputAgentId)?.name ?? selectedOutputAgentId
    : ''

  const moveTasksToStatus = useCallback((taskIds: Array<string>, status: TaskStatus) => {
    if (taskIds.length === 0) return
    const uniqueTaskIds = Array.from(new Set(taskIds))
    const ids = new Set(uniqueTaskIds)

    setMissionTasks((previous) =>
      previous.map((task) => {
        if (!ids.has(task.id) || task.status === status) return task
        return { ...task, status, updatedAt: Date.now() }
      }),
    )

    const boardApi = taskBoardRef.current
    if (boardApi) {
      boardApi.moveTasks(uniqueTaskIds, status)
      return
    }

    pendingTaskMovesRef.current.push({ taskIds: uniqueTaskIds, status })
  }, [])

  const handleTaskBoardRef = useCallback((api: TaskBoardRef) => {
    taskBoardRef.current = api
    if (pendingTaskMovesRef.current.length === 0) return
    pendingTaskMovesRef.current.forEach((entry) => {
      api.moveTasks(entry.taskIds, entry.status)
    })
    pendingTaskMovesRef.current = []
  }, [])

  const handleAgentSelection = useCallback((agentId?: string) => {
    setSelectedAgentId(agentId)
    setSelectedOutputAgentId(agentId)
  }, [])

  const spawnAgentSession = useCallback(async (member: TeamMember): Promise<string> => {
    const suffix = Math.random().toString(36).slice(2, 8)
    const baseName = member.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const friendlyId = `hub-${baseName}-${suffix}`
    const label = `Mission: ${member.name}`

    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ friendlyId, label }),
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
      throw new Error(
        readString(payload.error) || readString(payload.message) || `Spawn failed: HTTP ${response.status}`,
      )
    }

    const data = (await response.json()) as Record<string, unknown>
    const sessionKey = readString(data.sessionKey)
    if (!sessionKey) throw new Error('No sessionKey in spawn response')
    return sessionKey
  }, [])

  const handleRetrySpawn = useCallback(async (member: TeamMember): Promise<void> => {
    setSpawnState((prev) => ({ ...prev, [member.id]: 'spawning' }))
    try {
      const sessionKey = await spawnAgentSession(member)
      setAgentSessionMap((prev) => ({ ...prev, [member.id]: sessionKey }))
      setSpawnState((prev) => ({ ...prev, [member.id]: 'ready' }))
      setAgentSessionStatus((prev) => ({
        ...prev,
        [member.id]: { status: 'idle', lastSeen: Date.now() },
      }))
      emitFeedEvent({
        type: 'agent_spawned',
        message: `${member.name} session re-created`,
        agentName: member.name,
      })
    } catch (err) {
      setSpawnState((prev) => ({ ...prev, [member.id]: 'error' }))
      emitFeedEvent({
        type: 'system',
        message: `Failed to re-spawn ${member.name}: ${err instanceof Error ? err.message : String(err)}`,
        agentName: member.name,
      })
    }
  }, [spawnAgentSession])

  const ensureAgentSessions = useCallback(async (teamMembers: TeamMember[]): Promise<Record<string, string>> => {
    const currentMap = { ...agentSessionMapRef.current }
    const spawnPromises: Array<Promise<void>> = []

    for (const member of teamMembers) {
      if (currentMap[member.id]) continue

      setSpawnState((prev) => ({ ...prev, [member.id]: 'spawning' }))

      spawnPromises.push(
        spawnAgentSession(member)
          .then((sessionKey) => {
            currentMap[member.id] = sessionKey
            setSpawnState((prev) => ({ ...prev, [member.id]: 'ready' }))
            emitFeedEvent({
              type: 'agent_spawned',
              message: `${member.name} session created`,
              agentName: member.name,
            })
          })
          .catch((err: unknown) => {
            setSpawnState((prev) => ({ ...prev, [member.id]: 'error' }))
            emitFeedEvent({
              type: 'system',
              message: `Failed to spawn ${member.name}: ${err instanceof Error ? err.message : String(err)}`,
              agentName: member.name,
            })
          }),
      )
    }

    await Promise.allSettled(spawnPromises)
    setAgentSessionMap(currentMap)
    agentSessionMapRef.current = currentMap
    return currentMap
  }, [spawnAgentSession])

  /**
   * dispatchToAgent — sends one agent's task batch to their dedicated session.
   * Handles idempotency tracking, task status moves, and feed events.
   */
  const dispatchToAgent = useCallback(async (
    agentId: string,
    agentTasks: HubTask[],
    sessionKey: string,
    member: TeamMember | undefined,
    missionGoalValue: string,
  ): Promise<void> => {
    const taskList = agentTasks.map((task, index) => `${index + 1}. ${task.title}`).join('\n')
    const message = `Mission Task Assignment for ${member?.name || agentId}:\n\n${taskList}\n\nMission Goal: ${missionGoalValue}\n\nPlease work through these tasks sequentially. Report progress on each.`

    try {
      const response = await fetch('/api/sessions/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey, message }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
        const errorMessage =
          readString(payload.error) || readString(payload.message) || `HTTP ${response.status}`
        throw new Error(errorMessage)
      }

      // Mark tasks dispatched (idempotency)
      agentTasks.forEach((task) => dispatchedTaskIdsRef.current.add(task.id))

      const taskIds = agentTasks.map((task) => task.id)

      // Track for completion detection
      agentTasksRef.current.set(agentId, [
        ...(agentTasksRef.current.get(agentId) ?? []),
        ...taskIds,
      ])
      sessionDispatchTimeRef.current.set(sessionKey, Date.now())

      setDispatchedTaskIdsByAgent((previous) => ({
        ...previous,
        [agentId]: [...(previous[agentId] ?? []), ...taskIds],
      }))
      moveTasksToStatus(taskIds, 'in_progress')

      agentTasks.forEach((task) => {
        emitFeedEvent({
          type: 'agent_active',
          message: `${member?.name || agentId} started working on: ${task.title}`,
          agentName: member?.name,
          taskTitle: task.title,
        })
      })
    } catch (error) {
      emitFeedEvent({
        type: 'system',
        message: `Failed to dispatch to ${member?.name || agentId}: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }, [moveTasksToStatus])

  /**
   * executeMission — groups tasks by agent and dispatches them with:
   * - Idempotency: skips tasks already in dispatchedTaskIdsRef
   * - Staggered dispatch: 100ms delay between agents
   * - Pause awareness: queues remaining agents into pendingDispatchTasksRef
   */
  const executeMission = useCallback(async (
    tasks: Array<HubTask>,
    teamMembers: Array<TeamMember>,
    missionGoalValue: string,
  ) => {
    // STEP A: Ensure all agents have isolated gateway sessions
    const sessionMap = await ensureAgentSessions(teamMembers)

    // STEP B: Group undispatched tasks by agent (idempotency filter)
    const tasksByAgent = new Map<string, Array<HubTask>>()
    for (const task of tasks) {
      if (!task.agentId) continue
      // Skip tasks already dispatched (idempotency)
      if (dispatchedTaskIdsRef.current.has(task.id)) continue
      const existing = tasksByAgent.get(task.agentId) ?? []
      existing.push(task)
      tasksByAgent.set(task.agentId, existing)
    }

    // STEP C: Dispatch to per-agent sessions with staggered delay
    let firstAgent = true
    for (const [agentId, agentTasks] of tasksByAgent) {
      const currentState = missionStateRef.current

      // If stopped, abort all remaining dispatches
      if (currentState === 'stopped') break

      // If paused, queue remaining agents for later resume
      if (currentState === 'paused') {
        const member = teamMembers.find((entry) => entry.id === agentId)
        pendingDispatchTasksRef.current.push({ agentId, member, tasks: agentTasks, missionGoalValue })
        continue
      }

      const sessionKey = sessionMap[agentId]
      if (!sessionKey) {
        emitFeedEvent({
          type: 'system',
          message: `No session for agent ${agentId} — skipping dispatch`,
        })
        continue
      }

      // Staggered dispatch: 100ms between agents to avoid overwhelming gateway
      if (!firstAgent) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 100))
      }
      firstAgent = false

      // Re-check state after the delay (user may have paused/stopped)
      const stateAfterDelay = missionStateRef.current
      if (stateAfterDelay === 'stopped') break
      if (stateAfterDelay === 'paused') {
        const member = teamMembers.find((entry) => entry.id === agentId)
        pendingDispatchTasksRef.current.push({ agentId, member, tasks: agentTasks, missionGoalValue })
        continue
      }

      const member = teamMembers.find((entry) => entry.id === agentId)
      await dispatchToAgent(agentId, agentTasks, sessionKey, member, missionGoalValue)
    }
  }, [ensureAgentSessions, dispatchToAgent])

  /**
   * resumeDispatch — called when mission resumes from paused state.
   * Drains pendingDispatchTasksRef and dispatches each agent's queued tasks.
   */
  const resumeDispatch = useCallback(async () => {
    const pending = pendingDispatchTasksRef.current.splice(0)
    if (pending.length === 0) return

    const sessionMap = agentSessionMapRef.current
    let firstAgent = true

    for (const { agentId, member, tasks, missionGoalValue } of pending) {
      const currentState = missionStateRef.current
      if (currentState === 'stopped') break
      if (currentState === 'paused') {
        // Re-queue if paused again mid-resume
        pendingDispatchTasksRef.current.push({ agentId, member, tasks, missionGoalValue })
        continue
      }

      const sessionKey = sessionMap[agentId]
      if (!sessionKey) {
        emitFeedEvent({
          type: 'system',
          message: `No session for agent ${agentId} — skipping resume dispatch`,
        })
        continue
      }

      // Staggered dispatch
      if (!firstAgent) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 100))
      }
      firstAgent = false

      const stateAfterDelay = missionStateRef.current
      if (stateAfterDelay === 'stopped') break
      if (stateAfterDelay === 'paused') {
        pendingDispatchTasksRef.current.push({ agentId, member, tasks, missionGoalValue })
        continue
      }

      // Filter out any tasks that were dispatched during this resume loop
      const undispatchedTasks = tasks.filter((t) => !dispatchedTaskIdsRef.current.has(t.id))
      if (undispatchedTasks.length === 0) continue

      await dispatchToAgent(agentId, undispatchedTasks, sessionKey, member, missionGoalValue)
    }
  }, [dispatchToAgent])

  /**
   * stopMission — aborts all active sessions (best-effort), moves in_progress tasks
   * back to inbox, deletes sessions, and resets all mission state.
   */
  const stopMission = useCallback(() => {
    const sessionMap = agentSessionMapRef.current

    // Abort active agent sessions (best-effort, fire-and-forget)
    Object.values(sessionMap).forEach((sessionKey) => {
      if (!sessionKey) return
      fetch('/api/chat-abort', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey }),
      }).catch(() => {})
    })

    // Delete sessions
    Object.values(sessionMap).forEach((sessionKey) => {
      if (!sessionKey) return
      fetch(`/api/sessions?sessionKey=${encodeURIComponent(sessionKey)}`, {
        method: 'DELETE',
      }).catch(() => {})
    })

    // Move all in_progress tasks back to inbox (cancel in-flight work)
    const inProgressTaskIds = boardTasksRef.current
      .filter((task) => task.status === 'in_progress')
      .map((task) => task.id)
    if (inProgressTaskIds.length > 0) {
      moveTasksToStatus(inProgressTaskIds, 'inbox')
    }

    // Reset all mission state
    setAgentSessionMap({})
    setSpawnState({})
    setAgentSessionStatus({})
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('clawsuite:hub-agent-sessions')
    }
    setMissionState('stopped')
    setMissionActive(false)
    setShowNewMission(false)
    setActiveMissionGoal('')
    setMissionTasks([])
    setDispatchedTaskIdsByAgent({})
    setSelectedOutputAgentId(undefined)

    // Reset all refs
    dispatchingRef.current = false
    missionStateRef.current = 'stopped'
    agentSessionMapRef.current = {}
    pendingTaskMovesRef.current = []
    sessionActivityRef.current = new Map()
    taskBoardRef.current = null
    dispatchedTaskIdsRef.current.clear()
    pendingDispatchTasksRef.current = []
    agentTasksRef.current.clear()
    sessionDispatchTimeRef.current.clear()
    warnedSessionsRef.current.clear()
  }, [moveTasksToStatus])

  /**
   * handleMissionResume — transitions from paused to running and drains
   * any tasks that were queued during the pause.
   */
  const handleMissionResume = useCallback(() => {
    missionStateRef.current = 'running'
    setMissionState('running')
    emitFeedEvent({ type: 'system', message: 'Mission resumed' })
    void resumeDispatch()
  }, [resumeDispatch])

  // ── 5s Polling Loop ───────────────────────────────────────────────────────
  useEffect(() => {
    const isMissionRunning = missionActive && missionState === 'running'

    // Reset activity markers when mission is not running
    if (!isMissionRunning) {
      sessionActivityRef.current = new Map()
    }

    // Stop all polling when paused (spec requirement)
    if (missionState === 'paused') return

    const hasSessions = Object.keys(agentSessionMap).length > 0

    // Only poll when we have sessions to roster or an active mission
    if (!hasSessions && !isMissionRunning) return

    // Build reverse lookup: sessionKey → agentId
    const sessionKeyToAgentId = new Map<string, string>()
    for (const [agentId, sessionKey] of Object.entries(agentSessionMap)) {
      if (sessionKey) sessionKeyToAgentId.set(sessionKey, agentId)
    }

    let cancelled = false

    async function pollSessions() {
      try {
        const response = await fetch('/api/sessions')
        if (!response.ok || cancelled) return

        const payload = (await response
          .json()
          .catch(() => ({}))) as { sessions?: Array<SessionRecord> }
        const sessions = Array.isArray(payload.sessions) ? payload.sessions : []
        const now = Date.now()

        // ── Session Roster Tracking ───────────────────────────────────────────
        if (hasSessions) {
          const seenAgentIds = new Set<string>()

          // Compute status for each matched session
          const matchedEntries: Array<[string, AgentSessionStatusEntry]> = []
          for (const session of sessions) {
            const sessionKey = readSessionId(session)
            if (!sessionKey) continue
            const agentId = sessionKeyToAgentId.get(sessionKey)
            if (!agentId) continue

            seenAgentIds.add(agentId)

            const updatedAtRaw = session.updatedAt
            const updatedAt =
              typeof updatedAtRaw === 'number'
                ? updatedAtRaw
                : typeof updatedAtRaw === 'string'
                  ? Date.parse(updatedAtRaw)
                  : 0
            const lastSeen = Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : now
            const lastMessage = readSessionLastMessage(session) || undefined
            const ageMs = now - lastSeen
            const rawStatus = readString(session.status)

            let status: AgentSessionStatusEntry['status']
            if (rawStatus === 'error') {
              status = 'error'
            } else if (ageMs < 30_000) {
              status = 'active'
            } else if (ageMs < 300_000) {
              status = 'idle'
            } else {
              status = 'stopped'
            }

            matchedEntries.push([agentId, { status, lastSeen, ...(lastMessage ? { lastMessage } : {}) }])
          }

          if (!cancelled) {
            setAgentSessionStatus((prev) => {
              const next: Record<string, AgentSessionStatusEntry> = {}

              // Apply matched sessions
              for (const [agentId, entry] of matchedEntries) {
                next[agentId] = entry
              }

              // Handle agents whose session key wasn't returned by the API
              for (const agentId of Object.keys(agentSessionMap)) {
                if (seenAgentIds.has(agentId)) continue
                const existing = prev[agentId]
                const lastSeen = existing?.lastSeen ?? now
                const ageMs = now - lastSeen
                // Grace period: keep existing status for up to 60s before marking stopped
                if (!existing || ageMs > 60_000) {
                  next[agentId] = {
                    status: 'stopped',
                    lastSeen,
                    ...(existing?.lastMessage ? { lastMessage: existing.lastMessage } : {}),
                  }
                } else {
                  next[agentId] = existing
                }
              }

              return next
            })
          }
        }

        // ── Activity Feed Events + Completion Detection (mission only) ────────
        if (isMissionRunning) {
          const previousMarkers = sessionActivityRef.current
          const nextMarkers = new Map<string, string>()

          for (const session of sessions) {
            const sessionId = readSessionId(session)
            if (!sessionId) continue

            const marker = readSessionActivityMarker(session)
            const previous = previousMarkers.get(sessionId)
            const name = readSessionName(session) || sessionId

            nextMarkers.set(sessionId, marker)

            if (previous && previous !== marker) {
              const lastMessage = readSessionLastMessage(session)
              const summary = lastMessage
                ? `Output: ${truncateMissionGoal(lastMessage, 80)}`
                : 'Session activity detected'

              emitFeedEvent({
                type: 'agent_active',
                message: `${name} update: ${summary}`,
                agentName: name,
              })

              // Completion detection: move tasks to review on completion signal
              if (lastMessage && isCompletionSignal(lastMessage)) {
                const agentId = sessionKeyToAgentId.get(sessionId)
                if (agentId) {
                  const taskIds = agentTasksRef.current.get(agentId) ?? []
                  if (taskIds.length > 0) {
                    moveTasksToStatus(taskIds, 'review')
                    // Remove from tracking so we don't re-trigger
                    agentTasksRef.current.delete(agentId)
                    sessionDispatchTimeRef.current.delete(sessionId)
                    warnedSessionsRef.current.delete(sessionId)
                    emitFeedEvent({
                      type: 'task_completed',
                      message: `${name} signaled task completion — moved to review`,
                      agentName: name,
                    })
                  }
                }
              }
            }

            // 10-minute no-completion warning (emit once per session)
            if (!warnedSessionsRef.current.has(sessionId)) {
              const dispatchTime = sessionDispatchTimeRef.current.get(sessionId)
              if (dispatchTime && now - dispatchTime > 10 * 60 * 1000) {
                const agentId = sessionKeyToAgentId.get(sessionId)
                const pendingTaskIds = agentId ? (agentTasksRef.current.get(agentId) ?? []) : []
                if (pendingTaskIds.length > 0) {
                  emitFeedEvent({
                    type: 'system',
                    message: `⚠️ ${name} has been running for over 10 minutes with no completion signal`,
                    agentName: name,
                  })
                  warnedSessionsRef.current.add(sessionId)
                }
              }
            }
          }

          if (!cancelled) {
            sessionActivityRef.current = nextMarkers
          }
        }
      } catch {
        // Ignore polling errors; mission dispatch and local events still work.
      }
    }

    void pollSessions()
    const interval = window.setInterval(() => {
      void pollSessions()
    }, 5_000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [agentSessionMap, missionActive, missionState, moveTasksToStatus])

  function applyTemplate(templateId: TeamTemplateId) {
    setTeam(buildTeamFromTemplate(templateId))
    setSelectedAgentId(undefined)
    setSelectedOutputAgentId(undefined)
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
    if (dispatchingRef.current) return
    const trimmedGoal = missionGoal.trim()
    if (!trimmedGoal) return
    const createdTasks = parseMissionGoal(trimmedGoal, teamWithRuntimeStatus)
    if (createdTasks.length === 0) {
      toast('Could not parse actionable tasks from mission goal', { type: 'error' })
      return
    }

    dispatchingRef.current = true
    missionStateRef.current = 'running'
    const firstAssignedAgentId = createdTasks.find((task) => task.agentId)?.agentId
    setMissionActive(true)
    setShowNewMission(false)
    setMissionState('running')
    setView('board')
    setActiveMissionGoal(trimmedGoal)
    activeMissionGoalRef.current = trimmedGoal
    setMissionTasks(createdTasks)
    setDispatchedTaskIdsByAgent({})
    setSelectedOutputAgentId(firstAssignedAgentId)
    sessionActivityRef.current = new Map()
    // Clear dispatch tracking for fresh mission
    dispatchedTaskIdsRef.current.clear()
    pendingDispatchTasksRef.current = []
    agentTasksRef.current.clear()
    sessionDispatchTimeRef.current.clear()
    warnedSessionsRef.current.clear()
    emitFeedEvent({
      type: 'mission_started',
      message: `Mission started: ${trimmedGoal}`,
    })
    toast(`Mission started with ${createdTasks.length} tasks`, { type: 'success' })

    window.setTimeout(() => {
      void executeMission(createdTasks, teamWithRuntimeStatus, trimmedGoal).finally(() => {
        dispatchingRef.current = false
      })
    }, 0)
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
            spawnState={spawnState}
            agentSessionStatus={agentSessionStatus}
            agentSessionMap={agentSessionMap}
            onRetrySpawn={handleRetrySpawn}
            onApplyTemplate={applyTemplate}
            onAddAgent={handleAddAgent}
            onUpdateAgent={(agentId, updates) => {
              setTeam((previous) =>
                previous.map((member) =>
                  member.id === agentId ? { ...member, ...updates } : member,
                ),
              )
            }}
            onSelectAgent={handleAgentSelection}
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
              {missionActive ? (
                <TeamActivityStrip
                  team={teamWithRuntimeStatus}
                  tasks={boardTasks}
                  selectedAgentId={selectedOutputAgentId}
                  onSelectAgent={handleAgentSelection}
                />
              ) : null}
              <div className="min-h-0 flex-1">
                <TaskBoard
                  agents={boardAgents}
                  initialTasks={missionTasks}
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
          {missionActive && selectedOutputAgentId ? (
            <AgentOutputPanel
              agentName={selectedOutputAgentName}
              sessionKey={selectedOutputAgentId ? agentSessionMap[selectedOutputAgentId] ?? null : null}
              tasks={selectedOutputTasks}
              onClose={() => setSelectedOutputAgentId(undefined)}
            />
          ) : null}

          <div className="border-t border-primary-200 px-4 py-3">
            {missionActive ? (
              <>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                  Mission Controls
                </h3>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (missionState === 'paused') {
                        handleMissionResume()
                      } else {
                        setMissionState('running')
                      }
                    }}
                    className={cn(
                      'rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors',
                      missionState === 'running'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
                    )}
                  >
                    {missionState === 'paused' ? 'Resume' : 'Start'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      missionStateRef.current = 'paused'
                      setMissionState('paused')
                      emitFeedEvent({ type: 'agent_paused', message: 'Mission paused — dispatch halted' })
                    }}
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
                    onClick={stopMission}
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
