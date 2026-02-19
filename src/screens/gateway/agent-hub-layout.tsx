import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TeamPanel, TEAM_TEMPLATES, MODEL_PRESETS, type ModelPresetId, type TeamMember, type TeamTemplateId, type AgentSessionStatusEntry } from './components/team-panel'
import { TaskBoard, type HubTask, type TaskBoardRef, type TaskStatus } from './components/task-board'
import { LiveFeedPanel } from './components/live-feed-panel'
import { AgentOutputPanel } from './components/agent-output-panel'
import { emitFeedEvent, onFeedEvent } from './components/feed-event-bus'
import { AgentsWorkingPanel, type AgentWorkingRow, type AgentWorkingStatus } from './components/agents-working-panel'
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

// Maps ModelPresetId → real model string for gateway. Empty string = omit (use gateway default).
const MODEL_PRESET_MAP: Record<string, string> = {
  auto: '',
  opus: 'anthropic/claude-opus-4-6',
  sonnet: 'anthropic/claude-sonnet-4-6',
  codex: 'openai/gpt-5.3-codex',
  flash: 'google/gemini-2.5-flash',
}

type AgentActivityEntry = {
  lastLine?: string
  lastAt?: number
  lastEventType?: 'tool' | 'assistant' | 'system'
}

// Example mission chips: label → textarea fill text
const EXAMPLE_MISSIONS: Array<{ label: string; text: string }> = [
  {
    label: 'Build a REST API',
    text: 'Design and implement a REST API: define endpoints, write route handlers, add authentication middleware, write tests, and document all endpoints with OpenAPI spec.',
  },
  {
    label: 'Research competitors',
    text: 'Research top 5 competitors: analyze their product features, pricing models, target markets, and customer reviews. Summarize findings and identify gaps we can exploit.',
  },
  {
    label: 'Write blog posts',
    text: 'Create a 3-part blog series: outline topics, research each subject, write drafts, add SEO keywords, and prepare a publishing schedule with social media copy.',
  },
]

type GatewayStatus = 'connected' | 'disconnected' | 'spawning'

type ActiveTab = 'office' | 'mission' | 'history' | 'team'

const TAB_DEFS: Array<{ id: ActiveTab; icon: string; label: string }> = [
  { id: 'office', icon: '🏢', label: 'Office' },
  { id: 'mission', icon: '🚀', label: 'Mission' },
  { id: 'history', icon: '📋', label: 'History' },
  { id: 'team', icon: '👥', label: 'Team' },
]

function GatewayConnectionBanner({
  status,
  spawnErrorNames,
  onRetry,
}: {
  status: GatewayStatus
  spawnErrorNames: string[]
  onRetry?: () => void
}) {
  if (spawnErrorNames.length > 0) {
    return (
      <div className="flex h-auto min-h-8 w-full items-center gap-2 bg-red-100 px-4 py-1.5 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">
        <span aria-hidden>🔴</span>
        <span className="flex-1 truncate">
          Spawn failed for: {spawnErrorNames.join(', ')}
        </span>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-md border border-red-300 px-2 py-0.5 text-[11px] font-semibold transition-colors hover:bg-red-200 dark:border-red-700 dark:hover:bg-red-900/40"
          >
            Retry
          </button>
        ) : null}
      </div>
    )
  }

  if (status === 'disconnected') {
    return (
      <div className="flex h-8 w-full items-center gap-2 bg-red-100 px-4 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">
        <span aria-hidden>🔴</span>
        <span>Gateway disconnected — check your connection</span>
      </div>
    )
  }

  if (status === 'spawning') {
    return (
      <div className="flex h-8 w-full items-center gap-2 bg-amber-100 px-4 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        <span aria-hidden>🟡</span>
        <span>Spawning agents…</span>
      </div>
    )
  }

  return (
    <div className="flex h-8 w-full items-center gap-2 bg-emerald-50 px-4 text-xs text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">
      <span aria-hidden>🟢</span>
      <span>Gateway connected</span>
    </div>
  )
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

  // If we extracted >= 2 subtasks, return ONLY those subtasks (not the full goal as a task).
  // If 0–1 subtasks, collapse to [goal] as a single task.
  let missionItems: string[]
  if (segments.length >= 2) {
    const withoutFullGoal = segments.filter((s) => s !== normalizedGoal)
    missionItems = withoutFullGoal.length >= 1 ? withoutFullGoal : segments
  } else {
    missionItems = normalizedGoal ? [normalizedGoal] : []
  }

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
    goal: '',
    backstory: '',
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
    goal: '',
    backstory: '',
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
  const goal = typeof row.goal === 'string' ? row.goal : ''
  const backstory = typeof row.backstory === 'string' ? row.backstory : ''
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
    goal,
    backstory,
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

  if (hasAny(['coding', 'code', 'dev', 'build', 'ship', 'fix', 'bug', 'api', 'rest', 'endpoint'])) {
    return 'coding'
  }
  if (hasAny(['research', 'analyze', 'investigate', 'report', 'competitor'])) {
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

const TEMPLATE_DISPLAY_NAMES: Record<TeamTemplateId, string> = {
  research: 'Research Team',
  coding: 'Coding Sprint',
  content: 'Content Pipeline',
}

// ── Model badge styling (matches team-panel internal) ──────────────────────────
const OFFICE_MODEL_BADGE: Record<ModelPresetId, string> = {
  auto: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
  opus: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  sonnet: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  codex: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  flash: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
}

const OFFICE_MODEL_LABEL: Record<ModelPresetId, string> = {
  auto: 'Auto',
  opus: 'Opus',
  sonnet: 'Sonnet',
  codex: 'Codex',
  flash: 'Flash',
}

// ── OfficeView ─────────────────────────────────────────────────────────────────
type OfficeViewProps = {
  agentRows: AgentWorkingRow[]
  missionRunning: boolean
  onViewOutput: (agentId: string) => void
  selectedOutputAgentId?: string
}

function OfficeView({ agentRows, missionRunning, onViewOutput, selectedOutputAgentId }: OfficeViewProps) {
  if (agentRows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <p className="mb-3 text-4xl">🏢</p>
          <p className="text-sm font-medium text-primary-700 dark:text-neutral-300">No agents in your team</p>
          <p className="mt-1 text-xs text-primary-400">Switch to the Team tab to add agents.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      {/* Header row */}
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-primary-400">Visual Office</h2>
        {missionRunning && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
            Mission Active
          </span>
        )}
      </div>

      {/* Agent desk grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {agentRows.map((agent) => {
          const isActive = agent.status === 'active'
          const isSelected = agent.id === selectedOutputAgentId
          const statusDotClass = isActive
            ? '' // handled with ping
            : agent.status === 'idle' || agent.status === 'ready'
              ? 'bg-amber-400'
              : 'bg-neutral-400 dark:bg-neutral-600'

          return (
            <div
              key={agent.id}
              className={cn(
                'rounded-xl border bg-white p-4 shadow-sm transition-all dark:bg-neutral-900',
                isSelected
                  ? 'border-accent-400 ring-1 ring-accent-300 dark:border-accent-600 dark:ring-accent-700'
                  : 'border-primary-200 dark:border-neutral-700',
                isActive && missionRunning && 'ring-1 ring-emerald-200 dark:ring-emerald-800/50',
              )}
            >
              {/* Top row: status dot + model badge + task count */}
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-1.5">
                  {isActive ? (
                    <span className="relative flex size-3 shrink-0">
                      <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
                      <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
                    </span>
                  ) : (
                    <span className={cn('size-3 shrink-0 rounded-full', statusDotClass)} />
                  )}
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                      OFFICE_MODEL_BADGE[agent.modelId],
                    )}
                  >
                    {OFFICE_MODEL_LABEL[agent.modelId]}
                  </span>
                </div>
                {agent.taskCount > 0 && (
                  <span className="rounded-full bg-accent-100 px-1.5 py-0.5 text-[9px] font-bold text-accent-700 dark:bg-accent-900/30 dark:text-accent-300">
                    {agent.taskCount}t
                  </span>
                )}
              </div>

              {/* Agent name */}
              <h3 className="truncate text-sm font-semibold text-primary-900 dark:text-neutral-100">
                {agent.name}
              </h3>

              {/* Activity line */}
              <p className="mt-1 line-clamp-2 min-h-[2.5em] text-[11px] text-primary-500 dark:text-neutral-400">
                {agent.lastLine ?? (agent.status === 'none' ? 'No session' : 'Waiting for mission…')}
              </p>

              {/* View Output button */}
              <button
                type="button"
                onClick={() => onViewOutput(agent.id)}
                className={cn(
                  'mt-3 w-full rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors',
                  isSelected
                    ? 'border-accent-400 bg-accent-50 text-accent-700 dark:border-accent-600 dark:bg-accent-950/30 dark:text-accent-300'
                    : 'border-primary-200 bg-primary-50 text-primary-600 hover:border-primary-300 hover:bg-primary-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700',
                )}
              >
                {isSelected ? '✓ Viewing Output' : 'View Output'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── HistoryView ────────────────────────────────────────────────────────────────
function timeAgoFromMs(ms: number): string {
  const delta = Math.max(0, Date.now() - ms)
  const seconds = Math.floor(delta / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function HistoryView() {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchHistory() {
      setLoading(true)
      try {
        const res = await fetch('/api/sessions')
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { sessions?: SessionRecord[] }
        const missionSessions = (data.sessions ?? [])
          .filter((s) => {
            const label = readString(s.label)
            return label.startsWith('Mission:')
          })
          .sort((a, b) => {
            const aTime = typeof a.updatedAt === 'number' ? a.updatedAt : 0
            const bTime = typeof b.updatedAt === 'number' ? b.updatedAt : 0
            return bTime - aTime
          })
        if (!cancelled) setSessions(missionSessions)
      } catch {
        // ignore fetch errors
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchHistory()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-2 size-5 animate-spin rounded-full border-2 border-accent-400 border-t-transparent" />
          <p className="text-xs text-primary-400">Loading mission history…</p>
        </div>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <p className="mb-3 text-4xl">📋</p>
          <p className="text-sm font-medium text-primary-700 dark:text-neutral-300">No mission history yet</p>
          <p className="mt-1 text-xs text-primary-400">Start a mission to see it recorded here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full space-y-3 overflow-y-auto p-4">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary-400">Mission History</h2>
      {sessions.map((session) => {
        const sessionId = readSessionId(session)
        const label = readString(session.label)
        const status = readString(session.status)
        const lastMessage = readSessionLastMessage(session)
        const updatedAtRaw = session.updatedAt
        const updatedAt =
          typeof updatedAtRaw === 'number'
            ? updatedAtRaw
            : typeof updatedAtRaw === 'string'
              ? Date.parse(updatedAtRaw)
              : 0
        const isExpanded = expandedId === sessionId
        const tokenCount = typeof session.tokenCount === 'number' ? session.tokenCount : undefined

        const statusBadge =
          status === 'active'
            ? { label: 'Active', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' }
            : status === 'idle'
              ? { label: 'Idle', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' }
              : { label: 'Ended', className: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' }

        return (
          <div
            key={sessionId || label}
            className="rounded-xl border border-primary-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-primary-900 dark:text-neutral-100">
                    {label}
                  </h3>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      statusBadge.className,
                    )}
                  >
                    {statusBadge.label}
                  </span>
                </div>
                {lastMessage ? (
                  <p className="mt-1 line-clamp-2 text-[11px] text-primary-500 dark:text-neutral-400">
                    {lastMessage}
                  </p>
                ) : null}
                <div className="mt-1.5 flex items-center gap-3 text-[10px] text-primary-400">
                  {updatedAt > 0 ? <span>{timeAgoFromMs(updatedAt)}</span> : null}
                  {tokenCount !== undefined ? (
                    <span>{tokenCount.toLocaleString()} tokens</span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : sessionId)}
                className="shrink-0 rounded-lg border border-primary-200 px-2.5 py-1 text-[11px] font-medium text-primary-600 transition-colors hover:bg-primary-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                {isExpanded ? 'Hide' : 'View'}
              </button>
            </div>

            {isExpanded ? (
              <div className="mt-3 rounded-lg border border-primary-100 bg-primary-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary-400">
                  Session Details
                </p>
                <dl className="space-y-1 text-[11px]">
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-primary-400">ID</dt>
                    <dd className="truncate font-mono text-primary-700 dark:text-neutral-300">{sessionId}</dd>
                  </div>
                  {lastMessage ? (
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-primary-400">Last output</dt>
                      <dd className="line-clamp-4 text-primary-700 dark:text-neutral-300">{lastMessage}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function AgentHubLayout({ agents }: AgentHubLayoutProps) {
  // ── Tab + sidebar state ────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('office')
  const [liveFeedVisible, setLiveFeedVisible] = useState(false)
  const [unreadFeedCount, setUnreadFeedCount] = useState(0)
  const [processType, setProcessType] = useState<'sequential' | 'hierarchical' | 'parallel'>('parallel')

  // ── Existing state ──────────────────────────────────────────────────────────
  const [isMobileHub, setIsMobileHub] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768
  )
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
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>('connected')
  const [agentModelNotApplied, setAgentModelNotApplied] = useState<Record<string, boolean>>({})
  const [agentActivity, setAgentActivity] = useState<Record<string, AgentActivityEntry>>({})
  const [team, setTeam] = useState<TeamMember[]>(() => {
    const stored = readStoredTeam()
    if (stored.length > 0) return stored
    const runtimeTeam = buildTeamFromRuntime(agents)
    if (runtimeTeam.length > 0) return runtimeTeam
    return buildTeamFromTemplate('research')
  })
  const taskBoardRef = useRef<TaskBoardRef | null>(null)
  const teamPanelFlashTimerRef = useRef<number | undefined>(undefined)
  const pendingTaskMovesRef = useRef<Array<{ taskIds: Array<string>; status: TaskStatus }>>([])
  const sessionActivityRef = useRef<Map<string, string>>(new Map())
  const dispatchingRef = useRef(false)
  // SSE streams for active agents (capped at MAX_AGENT_STREAMS)
  const agentStreamsRef = useRef<Map<string, EventSource>>(new Map())
  const agentStreamLastAtRef = useRef<Map<string, number>>(new Map())
  // Stable ref for team so feed-event callback always sees latest team
  const teamRef = useRef(team)
  // Stable refs for keyboard shortcut handler
  const missionGoalRef = useRef(missionGoal)
  const handleCreateMissionRef = useRef<() => void>(() => {})
  // Stable ref for live feed visibility (used in feed-count effect)
  const liveFeedVisibleRef = useRef(liveFeedVisible)

  teamRef.current = team
  missionGoalRef.current = missionGoal
  liveFeedVisibleRef.current = liveFeedVisible

  // Derived: which agents have spawn errors
  const spawnErrorNames = useMemo(
    () =>
      team
        .filter((m) => spawnState[m.id] === 'error')
        .map((m) => m.name),
    [team, spawnState],
  )

  // Derived gateway banner status (spawning takes precedence if any agent is spawning)
  const isAnySpawning = useMemo(
    () => Object.values(spawnState).some((s) => s === 'spawning'),
    [spawnState],
  )
  const effectiveGatewayStatus: GatewayStatus = isAnySpawning ? 'spawning' : gatewayStatus

  // Live template suggestion based on current mission goal input
  const suggestedTemplateName = useMemo(() => {
    const trimmed = missionGoal.trim()
    if (!trimmed) return null
    const templateId = suggestTemplate(trimmed)
    return TEMPLATE_DISPLAY_NAMES[templateId]
  }, [missionGoal])

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

  // Mobile viewport detection
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobileHub(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  // Gateway status polling every 15s
  useEffect(() => {
    async function checkGateway() {
      try {
        const res = await fetch('/api/gateway/status')
        setGatewayStatus(res.ok ? 'connected' : 'disconnected')
      } catch {
        setGatewayStatus('disconnected')
      }
    }
    void checkGateway()
    const interval = window.setInterval(() => {
      void checkGateway()
    }, 15_000)
    return () => window.clearInterval(interval)
  }, [])

  // ── Unread feed count ───────────────────────────────────────────────────────
  // Increment when feed is hidden and a new event arrives; reset when feed opens
  useEffect(() => {
    const unsubscribe = onFeedEvent(() => {
      if (!liveFeedVisibleRef.current) {
        setUnreadFeedCount((prev) => prev + 1)
      }
    })
    return unsubscribe
  }, []) // uses liveFeedVisibleRef — stable

  // Reset unread count when feed becomes visible
  useEffect(() => {
    if (liveFeedVisible) {
      setUnreadFeedCount(0)
    }
  }, [liveFeedVisible])

  // ── Feed event → agentActivity ─────────────────────────────────────────────
  // Update last-line activity from feed events (agent_active, agent_spawned, etc.)
  useEffect(() => {
    const unsubscribe = onFeedEvent((event) => {
      if (!event.agentName) return
      const currentTeam = teamRef.current
      const member = currentTeam.find((m) => m.name === event.agentName)
      if (!member) return
      if (
        event.type === 'agent_active' ||
        event.type === 'agent_spawned' ||
        event.type === 'task_assigned'
      ) {
        setAgentActivity((prev) => ({
          ...prev,
          [member.id]: {
            ...prev[member.id],
            lastLine: event.message,
            lastAt: event.timestamp,
            lastEventType: 'system',
          },
        }))
      }
    })
    return unsubscribe
  }, []) // uses teamRef — stable

  // ── SSE streams for active agents ─────────────────────────────────────────
  // Open SSE streams for up to 3 simultaneously-active agents; close stale ones.
  const MAX_AGENT_STREAMS = 3
  useEffect(() => {
    const streams = agentStreamsRef.current
    const lastAtMap = agentStreamLastAtRef.current
    const currentTeam = teamRef.current

    // Determine which agents are active and have sessions (capped at MAX_AGENT_STREAMS)
    const activeAgentIds = currentTeam
      .filter((m) => {
        const status = agentSessionStatus[m.id]
        return status && status.status === 'active' && agentSessionMap[m.id]
      })
      .slice(0, MAX_AGENT_STREAMS)
      .map((m) => m.id)

    const activeSessionKeys = new Set(
      activeAgentIds.map((id) => agentSessionMap[id]).filter(Boolean),
    )

    // Close streams for agents no longer active
    for (const [sessionKey, source] of streams) {
      if (!activeSessionKeys.has(sessionKey)) {
        source.close()
        streams.delete(sessionKey)
        lastAtMap.delete(sessionKey)
      }
    }

    // Open new streams for newly-active agents
    for (const agentId of activeAgentIds) {
      const sessionKey = agentSessionMap[agentId]
      if (!sessionKey || streams.has(sessionKey)) continue
      if (streams.size >= MAX_AGENT_STREAMS) break

      const source = new EventSource(
        `/api/chat-events?sessionKey=${encodeURIComponent(sessionKey)}`,
      )
      streams.set(sessionKey, source)
      lastAtMap.set(sessionKey, Date.now())

      const handleUpdate = (text: string, type: AgentActivityEntry['lastEventType']) => {
        if (!text) return
        lastAtMap.set(sessionKey, Date.now())
        setAgentActivity((prev) => ({
          ...prev,
          [agentId]: {
            lastLine: text,
            lastAt: Date.now(),
            lastEventType: type,
          },
        }))
      }

      source.addEventListener('chunk', (event) => {
        if (!(event instanceof MessageEvent)) return
        try {
          const data = JSON.parse(event.data as string) as Record<string, unknown>
          const text = String(data.text ?? data.content ?? data.chunk ?? '').trim()
          handleUpdate(text, 'assistant')
        } catch { /* ignore parse errors */ }
      })

      source.addEventListener('tool', (event) => {
        if (!(event instanceof MessageEvent)) return
        try {
          const data = JSON.parse(event.data as string) as Record<string, unknown>
          const name = String(data.name ?? 'tool')
          handleUpdate(`${name}()`, 'tool')
        } catch { /* ignore parse errors */ }
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentSessionStatus, agentSessionMap]) // intentionally omit teamRef (stable ref)

  // Stale SSE stream pruner (30s inactivity → close) + unmount cleanup
  useEffect(() => {
    const interval = window.setInterval(() => {
      const streams = agentStreamsRef.current
      const lastAtMap = agentStreamLastAtRef.current
      const now = Date.now()
      for (const [sessionKey, source] of streams) {
        const lastAt = lastAtMap.get(sessionKey) ?? 0
        if (now - lastAt > 30_000) {
          source.close()
          streams.delete(sessionKey)
          lastAtMap.delete(sessionKey)
        }
      }
    }, 10_000)

    return () => {
      window.clearInterval(interval)
      // Close all streams on unmount
      for (const source of agentStreamsRef.current.values()) {
        source.close()
      }
      agentStreamsRef.current.clear()
      agentStreamLastAtRef.current.clear()
    }
  }, [])

  // Keyboard shortcuts (desktop only): Cmd/Ctrl+Enter → Start Mission; Escape → close panel / deselect
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
      const modKey = isMac ? event.metaKey : event.ctrlKey

      // Cmd/Ctrl+Enter: Start Mission when textarea is focused and has content
      if (modKey && event.key === 'Enter') {
        const target = event.target as HTMLElement
        if (target.tagName === 'TEXTAREA' && missionGoalRef.current.trim()) {
          event.preventDefault()
          handleCreateMissionRef.current()
        }
        return
      }

      // Escape: Close output panel → deselect agent
      if (event.key === 'Escape') {
        const target = event.target as HTMLElement
        // Don't interfere when user is typing in an input/textarea
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
        setSelectedOutputAgentId((prev) => {
          if (prev) return undefined
          setSelectedAgentId(undefined)
          return undefined
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, []) // uses refs — stable, no deps needed

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

  // Build AgentWorkingRow array for AgentsWorkingPanel
  const agentWorkingRows = useMemo((): AgentWorkingRow[] => {
    return teamWithRuntimeStatus.map((member) => {
      const sessionStatus = agentSessionStatus[member.id]
      const spawnStatus = spawnState[member.id]
      const sessionKey = agentSessionMap[member.id]
      const hasSession = Boolean(sessionKey)
      const activity = agentActivity[member.id]

      // Resolve working status
      let status: AgentWorkingStatus
      if (spawnStatus === 'spawning') {
        status = 'spawning'
      } else if (!hasSession) {
        status = spawnStatus === 'error' ? 'error' : 'none'
      } else if (!sessionStatus) {
        status = 'ready'
      } else if (sessionStatus.status === 'error') {
        status = 'error'
      } else if (sessionStatus.status === 'active') {
        status = 'active'
      } else {
        status = 'idle'
      }

      const inProgressTask = boardTasks.find(
        (t) => t.agentId === member.id && t.status === 'in_progress',
      )

      // Prefer SSE stream activity over session poll lastMessage
      const lastLine = activity?.lastLine ?? sessionStatus?.lastMessage
      const lastAt = activity?.lastAt ?? (sessionStatus?.lastSeen ?? undefined)

      return {
        id: member.id,
        name: member.name,
        modelId: member.modelId,
        status,
        lastLine,
        lastAt,
        taskCount: agentTaskCounts[member.id] ?? 0,
        currentTask: inProgressTask?.title,
        sessionKey,
      }
    })
  }, [
    teamWithRuntimeStatus,
    agentSessionStatus,
    spawnState,
    agentSessionMap,
    agentActivity,
    boardTasks,
    agentTaskCounts,
  ])

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

    // Check if a session with this label already exists — reuse it instead of
    // trying to create a duplicate (gateway enforces unique labels).
    try {
      const listResp = await fetch('/api/sessions')
      if (listResp.ok) {
        const listData = (await listResp.json()) as { sessions?: Array<Record<string, unknown>> }
        const existing = (listData.sessions ?? []).find(
          (s) => typeof s.label === 'string' && s.label === label,
        )
        if (existing) {
          const existingKey = readString(existing.key)
          if (existingKey) return existingKey
        }
      }
    } catch {
      // If the lookup fails, fall through to normal spawn
    }

    const modelString = MODEL_PRESET_MAP[member.modelId] ?? ''
    const requestBody: Record<string, string> = { friendlyId, label }
    if (modelString) requestBody.model = modelString

    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
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

    // Track whether the gateway actually applied the requested model
    const modelApplied = data.modelApplied !== false
    if (modelString && !modelApplied) {
      setAgentModelNotApplied((prev) => ({ ...prev, [member.id]: true }))
    } else {
      setAgentModelNotApplied((prev) => {
        if (!prev[member.id]) return prev
        const next = { ...prev }
        delete next[member.id]
        return next
      })
    }

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

  // Kill session for an agent
  const handleKillSession = useCallback(async (member: TeamMember) => {
    const sessionKey = agentSessionMap[member.id]
    if (sessionKey) {
      try {
        await fetch(`/api/sessions?sessionKey=${encodeURIComponent(sessionKey)}`, {
          method: 'DELETE',
        })
      } catch {
        // best-effort
      }
    }
    setAgentSessionMap((prev) => {
      const next = { ...prev }
      delete next[member.id]
      return next
    })
    setSpawnState((prev) => ({ ...prev, [member.id]: 'idle' }))
    setAgentSessionStatus((prev) => {
      const next = { ...prev }
      delete next[member.id]
      return next
    })
    setAgentModelNotApplied((prev) => {
      if (!prev[member.id]) return prev
      const next = { ...prev }
      delete next[member.id]
      return next
    })
    setAgentActivity((prev) => {
      if (!prev[member.id]) return prev
      const next = { ...prev }
      delete next[member.id]
      return next
    })
    emitFeedEvent({
      type: 'agent_killed',
      message: `${member.name} session killed`,
      agentName: member.name,
    })
  }, [agentSessionMap])

  const ensureAgentSessions = useCallback(async (teamMembers: TeamMember[]): Promise<Record<string, string>> => {
    const currentMap = { ...agentSessionMap }
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
    return currentMap
  }, [agentSessionMap, spawnAgentSession])

  const executeMission = useCallback(async (
    tasks: Array<HubTask>,
    teamMembers: Array<TeamMember>,
    missionGoalValue: string,
    mode: 'sequential' | 'hierarchical' | 'parallel' = 'parallel',
  ) => {
    // STEP A: Ensure all agents have isolated gateway sessions
    const sessionMap = await ensureAgentSessions(teamMembers)

    // STEP B: Group tasks by agent
    const tasksByAgent = new Map<string, Array<HubTask>>()
    for (const task of tasks) {
      if (!task.agentId) continue
      const existing = tasksByAgent.get(task.agentId) || []
      existing.push(task)
      tasksByAgent.set(task.agentId, existing)
    }

    // Helper: build agent context prefix for dispatch messages
    function buildAgentContext(member: TeamMember): string {
      const parts = [
        member.roleDescription && `Role: ${member.roleDescription}`,
        member.goal && `Your goal: ${member.goal}`,
        member.backstory && `Background: ${member.backstory}`,
      ].filter(Boolean)
      return parts.join('\n')
    }

    // Helper: send a message to an agent session and update task state
    async function dispatchToAgent(
      agentId: string,
      agentTasks: Array<HubTask>,
      messageText: string,
    ): Promise<void> {
      const sessionKey = sessionMap[agentId]
      if (!sessionKey) {
        emitFeedEvent({
          type: 'system',
          message: `No session for agent ${agentId} — skipping dispatch`,
        })
        return
      }

      const member = teamMembers.find((entry) => entry.id === agentId)

      try {
        const response = await fetch('/api/sessions/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionKey, message: messageText }),
        })

        if (!response.ok) {
          const payload = (await response
            .json()
            .catch(() => ({}))) as Record<string, unknown>
          const errorMessage =
            readString(payload.error) || readString(payload.message) || `HTTP ${response.status}`
          throw new Error(errorMessage)
        }

        const taskIds = agentTasks.map((task) => task.id)
        setDispatchedTaskIdsByAgent((previous) => ({
          ...previous,
          [agentId]: taskIds,
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
    }

    // ── HIERARCHICAL mode ─────────────────────────────────────────────────
    if (mode === 'hierarchical') {
      const [leadMember, ...workerMembers] = teamMembers
      if (!leadMember) return

      const leadSessionKey = sessionMap[leadMember.id]
      if (leadSessionKey) {
        const leadContext = buildAgentContext(leadMember)
        const teamList = workerMembers.map((m) => `- ${m.name} (${m.roleDescription})`).join('\n')
        const leadBriefing = `You are the Lead Agent coordinating this mission.\n\nYour team:\n${teamList}\n\nMission Goal: ${missionGoalValue}\n\nYour job: Break down the goal into clear subtasks, delegate them to your team members by name, and synthesize the final result. Start by outlining the plan.`
        const leadMessage = [leadContext, leadBriefing].filter(Boolean).join('\n\n')

        const leadTasks = tasksByAgent.get(leadMember.id) ?? []
        const effectiveLeadTasks = leadTasks.length > 0 ? leadTasks : [{
          id: createTaskId(),
          title: `Lead: ${missionGoalValue}`,
          description: '',
          priority: 'high' as const,
          status: 'assigned' as const,
          agentId: leadMember.id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }]
        await dispatchToAgent(leadMember.id, effectiveLeadTasks, leadMessage)

        // Dispatch to workers with delegation prefix
        for (const worker of workerMembers) {
          const workerTasks = tasksByAgent.get(worker.id)
          if (!workerTasks || workerTasks.length === 0) continue
          const workerContext = buildAgentContext(worker)
          const taskList = workerTasks.map((task, index) => `${index + 1}. ${task.title}`).join('\n')
          const delegationPrefix = `Delegated by ${leadMember.name}:`
          const workerBody = `${delegationPrefix}\n\nMission Task Assignment for ${worker.name}:\n\n${taskList}\n\nMission Goal: ${missionGoalValue}\n\nPlease work through these tasks sequentially. Report progress on each.`
          const workerMessage = [workerContext, workerBody].filter(Boolean).join('\n\n')
          await dispatchToAgent(worker.id, workerTasks, workerMessage)
        }
      }
      return
    }

    // ── SEQUENTIAL mode ───────────────────────────────────────────────────
    if (mode === 'sequential') {
      const agentEntries = Array.from(tasksByAgent.entries())
      for (let i = 0; i < agentEntries.length; i++) {
        const [agentId, agentTasks] = agentEntries[i]
        const member = teamMembers.find((entry) => entry.id === agentId)
        const agentContext = member ? buildAgentContext(member) : ''
        const taskList = agentTasks.map((task, index) => `${index + 1}. ${task.title}`).join('\n')
        const body = `Mission Task Assignment for ${member?.name || agentId}:\n\n${taskList}\n\nMission Goal: ${missionGoalValue}\n\nPlease work through these tasks sequentially. Report progress on each.`
        const message = [agentContext, body].filter(Boolean).join('\n\n')
        await dispatchToAgent(agentId, agentTasks, message)

        // Stagger: wait 30 seconds between agents (except after the last one)
        if (i < agentEntries.length - 1) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 30_000))
        }
      }
      return
    }

    // ── PARALLEL mode (default) ────────────────────────────────────────────
    for (const [agentId, agentTasks] of tasksByAgent) {
      const member = teamMembers.find((entry) => entry.id === agentId)
      const agentContext = member ? buildAgentContext(member) : ''
      const taskList = agentTasks.map((task, index) => `${index + 1}. ${task.title}`).join('\n')
      const body = `Mission Task Assignment for ${member?.name || agentId}:\n\n${taskList}\n\nMission Goal: ${missionGoalValue}\n\nPlease work through these tasks sequentially. Report progress on each.`
      const message = [agentContext, body].filter(Boolean).join('\n\n')
      await dispatchToAgent(agentId, agentTasks, message)
    }
  }, [ensureAgentSessions, moveTasksToStatus])

  useEffect(() => {
    const isMissionRunning = missionActive && missionState === 'running'

    // Reset activity markers when mission is not running
    if (!isMissionRunning) {
      sessionActivityRef.current = new Map()
    }

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

        // ── Activity Feed Events (mission only) ───────────────────────────────
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
            if (!previous || previous === marker) continue

            const lastMessage = readSessionLastMessage(session)
            const summary = lastMessage
              ? `Output: ${truncateMissionGoal(lastMessage, 80)}`
              : 'Session activity detected'

            emitFeedEvent({
              type: 'agent_active',
              message: `${name} update: ${summary}`,
              agentName: name,
            })
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
  }, [agentSessionMap, missionActive, missionState])

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
        goal: '',
        backstory: '',
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
    const firstAssignedAgentId = createdTasks.find((task) => task.agentId)?.agentId
    setMissionActive(true)
    setShowNewMission(false)
    setMissionState('running')
    setView('board')
    setActiveMissionGoal(trimmedGoal)
    setMissionTasks(createdTasks)
    setDispatchedTaskIdsByAgent({})
    setSelectedOutputAgentId(firstAssignedAgentId)
    sessionActivityRef.current = new Map()
    // ── Auto-switch to Mission tab and show live feed ──────────────────────
    setActiveTab('mission')
    setLiveFeedVisible(true)
    emitFeedEvent({
      type: 'mission_started',
      message: `Mission started: ${trimmedGoal}`,
    })
    toast(`Mission started with ${createdTasks.length} tasks`, { type: 'success' })

    window.setTimeout(() => {
      void executeMission(createdTasks, teamWithRuntimeStatus, trimmedGoal, processType).finally(() => {
        dispatchingRef.current = false
      })
    }, 0)
  }

  // Keep the ref in sync so keyboard shortcut always calls the latest version
  handleCreateMissionRef.current = handleCreateMission

  // Retry all spawn errors
  function handleRetryAllSpawnErrors() {
    const errorMembers = team.filter((m) => spawnState[m.id] === 'error')
    errorMembers.forEach((m) => void handleRetrySpawn(m))
  }

  const isMissionRunning = missionActive && missionState === 'running'

  // ── Mission tab content ────────────────────────────────────────────────────
  function renderMissionContent() {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Agents Working Panel */}
        {team.length > 0 ? (
          <AgentsWorkingPanel
            agents={agentWorkingRows}
            className="mx-3 mt-2 mb-1"
            selectedAgentId={selectedOutputAgentId}
            onSelectAgent={handleAgentSelection}
            onKillAgent={(agentId) => {
              const member = teamWithRuntimeStatus.find((m) => m.id === agentId)
              if (member) void handleKillSession(member)
            }}
            onRespawnAgent={(agentId) => {
              const member = teamWithRuntimeStatus.find((m) => m.id === agentId)
              if (member) void handleRetrySpawn(member)
            }}
          />
        ) : null}

        {/* Mission board area + optional inline agent output */}
        <div className="flex min-h-0 flex-1">
          {/* Board / Create Mission */}
          <div className="min-w-0 flex-1 overflow-hidden">
            {!missionActive ? (
              showNewMission ? (
                <div className="flex min-h-0 flex-1 items-center justify-center px-8 py-6 h-full">
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

                      {/* Example chips */}
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {EXAMPLE_MISSIONS.map((example) => (
                          <button
                            key={example.label}
                            type="button"
                            onClick={() => setMissionGoal(example.text)}
                            className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-[11px] font-medium text-primary-600 transition-colors hover:border-accent-400 hover:bg-accent-50 hover:text-accent-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-accent-700 dark:hover:bg-accent-950/20 dark:hover:text-accent-300"
                          >
                            {example.label}
                          </button>
                        ))}
                      </div>

                      {/* Live template preview */}
                      {suggestedTemplateName ? (
                        <p className="text-[11px] text-primary-400 dark:text-neutral-500">
                          Will use:{' '}
                          <span className="font-semibold text-accent-600 dark:text-accent-400">
                            {suggestedTemplateName}
                          </span>
                        </p>
                      ) : null}

                      {/* Process Type selector */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary-500">
                          Process Type
                        </p>
                        <div className="flex items-center justify-center gap-1.5">
                          {(
                            [
                              { id: 'sequential', label: 'Sequential', tip: 'A → B → C, tasks flow one at a time' },
                              { id: 'hierarchical', label: 'Hierarchical', tip: 'Lead agent coordinates workers' },
                              { id: 'parallel', label: 'Parallel', tip: 'All agents work simultaneously' },
                            ] as const
                          ).map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              title={option.tip}
                              onClick={() => setProcessType(option.id)}
                              className={cn(
                                'rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors',
                                processType === option.id
                                  ? 'border-accent-400 bg-accent-50 text-accent-700 dark:border-accent-600 dark:bg-accent-950/30 dark:text-accent-300'
                                  : 'border-primary-200 bg-white text-primary-600 hover:border-primary-300 hover:bg-primary-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-600',
                              )}
                            >
                              {processType === option.id ? '● ' : '○ '}{option.label}
                            </button>
                          ))}
                        </div>
                      </div>

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
                          title="Start Mission (Cmd+Enter)"
                          className="rounded-lg bg-accent-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Start Mission
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-0 h-full flex-1 items-center justify-center px-6">
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
              <div className="flex min-h-0 h-full flex-1 items-center justify-center px-6">
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
              <div className="flex min-h-0 flex-1 flex-col h-full">
                <div className="flex items-center justify-between border-b border-emerald-200 bg-emerald-50/40 px-4 py-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/15">
                  <p className="truncate text-xs font-medium text-emerald-800 dark:text-emerald-200">
                    Mission: {truncateMissionGoal(activeMissionGoal || missionGoal.trim())}
                  </p>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {/* Board/Timeline toggle — use string cast to avoid TS narrowing in else branch */}
                    <div className="flex items-center rounded-lg border border-primary-200 bg-white p-0.5 dark:border-neutral-700 dark:bg-neutral-900">
                      {(['board', 'timeline'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={cn(
                            'rounded-md px-2 py-0.5 text-[11px] font-medium capitalize transition-colors',
                            (view as string) === v
                              ? 'bg-primary-100 text-primary-800 dark:bg-neutral-800 dark:text-neutral-100'
                              : 'text-primary-500 hover:text-primary-700',
                          )}
                          onClick={() => setView(v)}
                        >
                          {v.charAt(0).toUpperCase() + v.slice(1)}
                        </button>
                      ))}
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        missionBadge.className,
                      )}
                    >
                      {missionBadge.label}
                    </span>
                  </div>
                </div>
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

          {/* Inline agent output panel (desktop, right of task board) */}
          {!isMobileHub && missionActive && selectedOutputAgentId ? (
            <div className="w-72 shrink-0 border-l border-primary-200 dark:border-neutral-700">
              <AgentOutputPanel
                agentName={selectedOutputAgentName}
                sessionKey={selectedOutputAgentId ? agentSessionMap[selectedOutputAgentId] ?? null : null}
                tasks={selectedOutputTasks}
                onClose={() => setSelectedOutputAgentId(undefined)}
              />
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-primary-200 px-5 py-3">
        <div>
          <h1 className="text-base font-semibold text-primary-900 dark:text-neutral-100">
            Agent Hub
          </h1>
          <p className="text-xs text-primary-500">Mission Control</p>
        </div>
        <p className="text-xs text-primary-400">Agent Hub · Mission Control</p>
      </div>

      {/* ── Gateway Connection Banner ──────────────────────────────────────── */}
      <GatewayConnectionBanner
        status={effectiveGatewayStatus}
        spawnErrorNames={spawnErrorNames}
        onRetry={spawnErrorNames.length > 0 ? handleRetryAllSpawnErrors : undefined}
      />

      {/* ── Tab Navigation Bar ────────────────────────────────────────────── */}
      <div className="flex items-center border-b border-primary-200 bg-white dark:border-neutral-700 dark:bg-neutral-950">
        {TAB_DEFS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors',
              activeTab === tab.id
                ? 'border-b-2 border-accent-500 text-accent-600 dark:border-accent-400 dark:text-accent-400'
                : 'border-b-2 border-transparent text-primary-500 hover:text-primary-700 dark:text-neutral-400 dark:hover:text-neutral-200',
            )}
          >
            <span aria-hidden>{tab.icon}</span>
            <span>{tab.label}</span>
            {/* Mission tab: animated running indicator */}
            {tab.id === 'mission' && isMissionRunning ? (
              <span className="relative ml-0.5 flex size-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
            ) : null}
          </button>
        ))}

        {/* Spacer + Live Feed toggle */}
        <div className="ml-auto flex items-center pr-3">
          <button
            type="button"
            onClick={() => {
              setLiveFeedVisible((v) => !v)
            }}
            className={cn(
              'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors',
              liveFeedVisible
                ? 'bg-primary-100 text-primary-700 dark:bg-neutral-800 dark:text-neutral-200'
                : 'text-primary-400 hover:text-primary-600 dark:text-neutral-500 dark:hover:text-neutral-300',
            )}
          >
            <span aria-hidden>📡</span>
            <span className="hidden sm:inline">Live Feed</span>
            {unreadFeedCount > 0 && !liveFeedVisible ? (
              <span className="ml-0.5 rounded-full bg-accent-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                {unreadFeedCount > 99 ? '99+' : unreadFeedCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── Tab content area ── */}
        <div className="min-w-0 flex-1 overflow-hidden">
          {/* Office tab */}
          {activeTab === 'office' ? (
            <OfficeView
              agentRows={agentWorkingRows}
              missionRunning={isMissionRunning}
              selectedOutputAgentId={selectedOutputAgentId}
              onViewOutput={(agentId) => {
                handleAgentSelection(agentId)
                // Switch to mission tab to see output
                setActiveTab('mission')
              }}
            />
          ) : null}

          {/* Mission tab */}
          {activeTab === 'mission' ? renderMissionContent() : null}

          {/* History tab */}
          {activeTab === 'history' ? <HistoryView /> : null}

          {/* Team tab */}
          {activeTab === 'team' ? (
            <div
              className={cn(
                'h-full overflow-y-auto',
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
                agentModelNotApplied={agentModelNotApplied}
                tasks={boardTasks}
                onRetrySpawn={handleRetrySpawn}
                onKillSession={handleKillSession}
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
          ) : null}
        </div>

        {/* ── Collapsible Live Feed + Mission Controls sidebar ── */}
        {liveFeedVisible ? (
          <div className="flex w-72 shrink-0 flex-col border-l border-primary-200 bg-primary-50/30 dark:border-neutral-700 dark:bg-neutral-900/20">
            <div className="min-h-0 flex-1 overflow-hidden">
              <LiveFeedPanel />
            </div>

            {/* Mission controls (bottom of sidebar) */}
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
                        // Best-effort cleanup of per-agent sessions
                        Object.values(agentSessionMap).forEach((sessionKey) => {
                          fetch(`/api/sessions?sessionKey=${encodeURIComponent(sessionKey)}`, {
                            method: 'DELETE',
                          }).catch(() => {})
                        })
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
                        dispatchingRef.current = false
                        pendingTaskMovesRef.current = []
                        sessionActivityRef.current = new Map()
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
        ) : null}
      </div>

      {/* ── Mobile: Agent Output Bottom Sheet ──────────────────────────────── */}
      {isMobileHub && missionActive && selectedOutputAgentId ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSelectedOutputAgentId(undefined)}
            aria-hidden
          />
          {/* Sheet */}
          <div className="relative flex max-h-[90vh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl dark:bg-neutral-900">
            <div className="flex shrink-0 items-center justify-between border-b border-primary-200 p-3 dark:border-neutral-700">
              <h3 className="text-sm font-semibold text-primary-900 dark:text-neutral-100">
                {selectedOutputAgentName} Output
              </h3>
              <button
                type="button"
                onClick={() => setSelectedOutputAgentId(undefined)}
                className="flex size-7 items-center justify-center rounded-full text-primary-400 transition-colors hover:bg-primary-100 hover:text-primary-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                aria-label="Close agent output"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AgentOutputPanel
                agentName={selectedOutputAgentName}
                sessionKey={selectedOutputAgentId ? agentSessionMap[selectedOutputAgentId] ?? null : null}
                tasks={selectedOutputTasks}
                onClose={() => setSelectedOutputAgentId(undefined)}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Mobile: Bottom Tab Nav ─────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-primary-200 bg-white/95 backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/95 md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex">
          {TAB_DEFS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center py-2.5 text-[10px] font-medium transition-colors',
                activeTab === tab.id
                  ? 'text-accent-600 dark:text-accent-400'
                  : 'text-primary-500 hover:text-primary-700 dark:text-neutral-400 dark:hover:text-neutral-200',
              )}
            >
              <span className="text-base leading-none" aria-hidden>{tab.icon}</span>
              <span className="mt-0.5">{tab.label}</span>
              {tab.id === 'mission' && isMissionRunning ? (
                <span className="absolute right-3 top-1.5 flex size-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
