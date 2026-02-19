import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TeamPanel, TEAM_TEMPLATES, MODEL_PRESETS, type ModelPresetId, type TeamMember, type TeamTemplateId, type AgentSessionStatusEntry } from './components/team-panel'
import { TaskBoard, type HubTask, type TaskBoardRef, type TaskStatus } from './components/task-board'
import { LiveFeedPanel } from './components/live-feed-panel'
import { AgentOutputPanel } from './components/agent-output-panel'
import { emitFeedEvent, onFeedEvent } from './components/feed-event-bus'
import { type AgentWorkingRow, type AgentWorkingStatus } from './components/agents-working-panel'
import { LiveActivityPanel } from './components/live-activity-panel'
import { ApprovalsPanel } from './components/approvals-panel'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  saveMissionCheckpoint,
  loadMissionCheckpoint,
  clearMissionCheckpoint,
  archiveMissionToHistory,
  loadMissionHistory,
  type MissionCheckpoint,
} from './lib/mission-checkpoint'
import {
  loadApprovals,
  saveApprovals,
  addApproval,
  type ApprovalRequest,
} from './lib/approvals-store'

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
  research:  ['opus', 'sonnet', 'auto'],
  coding:    ['opus', 'codex', 'sonnet'],
  content:   ['opus', 'sonnet', 'flash'],
  'loop-lite': ['pc1-planner', 'pc1-coder', 'pc1-critic'],
}

const MODEL_IDS = new Set<string>(MODEL_PRESETS.map((preset) => preset.id))

// Maps ModelPresetId → real model string for gateway. Empty string = omit (use gateway default).
const MODEL_PRESET_MAP: Record<string, string> = {
  auto: '',
  opus: 'anthropic/claude-opus-4-6',
  sonnet: 'anthropic/claude-sonnet-4-6',
  codex: 'openai/gpt-5.3-codex',
  flash: 'google/gemini-2.5-flash',
  // PC1 local models (fixed Modelfiles — ChatML + num_ctx 16k+)
  'pc1-planner': 'ollama-pc1/glm-4.7-flash-fixed',
  'pc1-coder':   'ollama-pc1/qwen3-coder-30b-fixed',
  'pc1-critic':  'ollama-pc1/deepseek-r1-32b-fixed',
  'pc1-fast':    'ollama-pc1/qwen3-14b-fixed',
  'pc1-heavy':   'ollama-pc1/qwen3-30b-fixed',
  'pc1-fmt':     'ollama-pc1/gpt-oss-20b-fixed',
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

type ActiveTab = 'office' | 'mission' | 'history' | 'team' | 'approvals'

const TAB_DEFS: Array<{ id: ActiveTab; icon: string; label: string }> = [
  { id: 'office', icon: '🏢', label: 'Office' },
  { id: 'mission', icon: '🚀', label: 'Mission' },
  { id: 'history', icon: '📋', label: 'History' },
  { id: 'team', icon: '👥', label: 'Team' },
  { id: 'approvals', icon: '✅', label: 'Approvals' },
]

function GatewayStatusPill({
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
      <div className="flex items-center gap-1.5">
        <span className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[9px] font-semibold text-red-600 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-400">
          <span className="size-1.5 rounded-full bg-red-500" />
          Spawn Error
        </span>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[9px] font-semibold text-red-600 transition-colors hover:bg-red-100 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-900/40"
          >
            Retry
          </button>
        ) : null}
      </div>
    )
  }

  if (status === 'disconnected') {
    return (
      <span className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[9px] font-semibold text-red-600 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-400">
        <span className="size-1.5 rounded-full bg-red-500" />
        Offline
      </span>
    )
  }

  if (status === 'spawning') {
    return (
      <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[9px] font-semibold text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-400">
        <span className="size-1.5 animate-pulse rounded-full bg-amber-400" />
        Spawning
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[9px] font-semibold text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-400">
      <span className="size-1.5 rounded-full bg-emerald-500" />
      Connected
    </span>
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

function parseMissionGoal(goal: string, teamMembers: TeamMember[], missionId?: string): HubTask[] {
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
      missionId,
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

// Stored format for agent session info in localStorage (v2)
type AgentSessionInfo = {
  sessionKey: string
  model?: string
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
  research:    'Research Team',
  coding:      'Coding Sprint',
  content:     'Content Pipeline',
  'loop-lite': 'Loop Lite',
}

// ── Agent accent colors (indexed per agent slot) ───────────────────────────────
const AGENT_ACCENT_COLORS = [
  { bar: 'bg-orange-500', avatar: 'bg-orange-500', text: 'text-orange-400', ring: 'ring-orange-500/30' },
  { bar: 'bg-blue-500',   avatar: 'bg-blue-500',   text: 'text-blue-400',   ring: 'ring-blue-500/30' },
  { bar: 'bg-violet-500', avatar: 'bg-violet-500', text: 'text-violet-400', ring: 'ring-violet-500/30' },
  { bar: 'bg-emerald-500',avatar: 'bg-emerald-500',text: 'text-emerald-400',ring: 'ring-emerald-500/30' },
  { bar: 'bg-rose-500',   avatar: 'bg-rose-500',   text: 'text-rose-400',   ring: 'ring-rose-500/30' },
  { bar: 'bg-amber-500',  avatar: 'bg-amber-500',  text: 'text-amber-400',  ring: 'ring-amber-500/30' },
]

// ── Model badge styling ────────────────────────────────────────────────────────
const OFFICE_MODEL_BADGE: Record<ModelPresetId, string> = {
  auto:          'bg-neutral-200 text-neutral-700 dark:bg-neutral-600 dark:text-neutral-200',
  opus:          'bg-orange-100 text-orange-700 dark:bg-orange-950/70 dark:text-orange-400',
  sonnet:        'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-400',
  codex:         'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-400',
  flash:         'bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-400',
  'pc1-planner': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  'pc1-coder':   'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'pc1-critic':  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  'pc1-fast':    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'pc1-heavy':   'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'pc1-fmt':     'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
}

const OFFICE_MODEL_LABEL: Record<ModelPresetId, string> = {
  auto:          'Auto',
  opus:          'Opus',
  sonnet:        'Sonnet',
  codex:         'Codex',
  flash:         'Flash',
  'pc1-planner': 'PC1·Plan',
  'pc1-coder':   'PC1·Code',
  'pc1-critic':  'PC1·Critic',
  'pc1-fast':    'PC1·Fast',
  'pc1-heavy':   'PC1·Heavy',
  'pc1-fmt':     'PC1·Fmt',
}

// ── OfficeView ─────────────────────────────────────────────────────────────────
type OfficeViewProps = {
  agentRows: AgentWorkingRow[]
  missionRunning: boolean
  onViewOutput: (agentId: string) => void
  selectedOutputAgentId?: string
  activeTemplateName?: string
  processType: 'sequential' | 'hierarchical' | 'parallel'
}

function OfficeView({
  agentRows,
  missionRunning,
  onViewOutput,
  selectedOutputAgentId,
  activeTemplateName,
  processType,
}: OfficeViewProps) {
  if (agentRows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <p className="mb-3 text-4xl">🏢</p>
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300">No agents in your team</p>
          <p className="mt-1 text-xs text-neutral-500">Switch to the Team tab to add agents.</p>
        </div>
      </div>
    )
  }

  const processTypeBadgeClass =
    processType === 'hierarchical' ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800/50 dark:bg-violet-950/40 dark:text-violet-400' :
    processType === 'sequential'   ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/50 dark:bg-blue-950/40 dark:text-blue-400' :
                                     'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-400'

  return (
    <div className="h-full overflow-y-auto p-4">
      {/* ── Crew strip ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/60">
        {/* Overlapping agent avatars */}
        <div className="flex -space-x-2">
          {agentRows.slice(0, 5).map((agent, i) => {
            const accent = AGENT_ACCENT_COLORS[i % AGENT_ACCENT_COLORS.length]
            return (
              <div
                key={agent.id}
                title={agent.name}
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white dark:border-neutral-900',
                  accent.avatar,
                )}
              >
                {agent.name.charAt(0).toUpperCase()}
              </div>
            )
          })}
          {agentRows.length > 5 ? (
            <div className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-neutral-200 text-[10px] font-bold text-neutral-600 dark:border-neutral-900 dark:bg-neutral-800 dark:text-neutral-400">
              +{agentRows.length - 5}
            </div>
          ) : null}
        </div>

        {/* Labels */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            {agentRows.length} agent{agentRows.length !== 1 ? 's' : ''}
          </span>
          {activeTemplateName ? (
            <>
              <span className="text-neutral-400 dark:text-neutral-700">·</span>
              <span className="truncate text-sm text-neutral-500">{activeTemplateName}</span>
            </>
          ) : null}
        </div>

        {/* Process type badge */}
        <div className="flex items-center gap-2 shrink-0">
          {missionRunning && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-400">
              <span className="relative flex size-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              MISSION ACTIVE
            </span>
          )}
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
              processTypeBadgeClass,
            )}
          >
            {processType}
          </span>
        </div>
      </div>

      {/* ── Agent desk grid ─────────────────────────────────────────────── */}
      <div
        className={cn(
          'grid gap-3',
          agentRows.length <= 2 ? 'grid-cols-2' :
          agentRows.length === 4 ? 'grid-cols-2' :
          'grid-cols-2 md:grid-cols-3',
        )}
      >
        {agentRows.map((agent, i) => {
          const accent = AGENT_ACCENT_COLORS[i % AGENT_ACCENT_COLORS.length]
          const isActive = agent.status === 'active'
          const isSelected = agent.id === selectedOutputAgentId
          const isSpawning = agent.status === 'spawning'

          // Fix 2: Standardised status dots
          // 🟢 Green = active  🟡 Yellow = has session (idle/ready)  ⚫ Gray = no session  🔴 Red = error
          const statusDotEl = isActive ? (
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
            </span>
          ) : isSpawning ? (
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/60" />
              <span className="relative inline-flex size-3 rounded-full bg-amber-400" />
            </span>
          ) : (
            <span
              className={cn(
                'size-3 shrink-0 rounded-full',
                agent.status === 'idle'  ? 'bg-yellow-500' :
                agent.status === 'ready' ? 'bg-yellow-500' :
                agent.status === 'error' ? 'bg-red-500' :
                'bg-neutral-400',  // 'none' — no session
              )}
            />
          )

          return (
            <div
              key={agent.id}
              className={cn(
                'relative overflow-hidden rounded-xl border bg-white transition-all dark:bg-neutral-900',
                isSelected
                  ? 'border-neutral-300 shadow-lg ring-1 ring-emerald-500/50 shadow-emerald-500/10 dark:border-neutral-600'
                  : 'border-neutral-200 dark:border-neutral-800',
                isActive && missionRunning && !isSelected && 'ring-1 ring-neutral-300 dark:ring-neutral-700',
              )}
            >
              {/* Top accent bar (3px) */}
              <div className={cn('h-[3px] w-full', accent.bar)} />

              <div className="p-4">
                {/* Header: avatar (left) + status dot (right) */}
                <div className="flex items-start justify-between">
                  {/* Avatar */}
                  <div
                    className={cn(
                      'flex size-12 items-center justify-center rounded-full text-lg font-bold text-white',
                      accent.avatar,
                    )}
                  >
                    {agent.name.charAt(0).toUpperCase()}
                  </div>
                  {/* Status dot */}
                  {statusDotEl}
                </div>

                {/* Agent name */}
                <h3 className="mt-3 truncate text-sm font-bold tracking-tight text-neutral-900 dark:text-white">
                  {agent.name}
                </h3>

                {/* Role / model row */}
                <div className="mt-1 flex items-center gap-1.5">
                  {agent.roleDescription ? (
                    <span className="truncate text-[10px] text-neutral-500 dark:text-neutral-600">
                      {agent.roleDescription}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      'shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-medium',
                      OFFICE_MODEL_BADGE[agent.modelId],
                    )}
                  >
                    {OFFICE_MODEL_LABEL[agent.modelId]}
                  </span>
                </div>

                {/* Activity line (monospace) */}
                <p className="mt-2 line-clamp-2 min-h-[2.4em] font-mono text-[10px] leading-relaxed text-neutral-500 dark:text-neutral-600">
                  {agent.lastLine ?? (agent.status === 'none' ? '// no session' : '// waiting for mission…')}
                </p>

                {/* Footer: task count badge */}
                {agent.taskCount > 0 ? (
                  <div className="mt-2">
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                      {agent.taskCount} task{agent.taskCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                ) : null}

                {/* View Output button — full-width */}
                <button
                  type="button"
                  onClick={() => onViewOutput(agent.id)}
                  className={cn(
                    'mt-3 w-full rounded-lg px-2 py-2 text-[11px] font-medium transition-colors',
                    isSelected
                      ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-200',
                  )}
                >
                  {isSelected ? '✓ Viewing Output' : 'View Output'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Fix 2: Status dot legend */}
      <div className="mt-3 flex items-center justify-end gap-3 px-1">
        <span className="flex items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-600">
          <span className="size-2 rounded-full bg-emerald-500" /> Active
        </span>
        <span className="flex items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-600">
          <span className="size-2 rounded-full bg-yellow-500" /> Idle
        </span>
        <span className="flex items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-600">
          <span className="size-2 rounded-full bg-neutral-400" /> No session
        </span>
        <span className="flex items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-600">
          <span className="size-2 rounded-full bg-red-500" /> Error
        </span>
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
  const [localHistory] = useState<MissionCheckpoint[]>(() => loadMissionHistory())

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

  const hasLocalHistory = localHistory.length > 0
  const hasApiSessions = sessions.length > 0

  if (loading && !hasLocalHistory) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-2 size-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-600 dark:border-t-neutral-300" />
          <p className="font-mono text-[10px] text-neutral-500 dark:text-neutral-600">// loading mission history…</p>
        </div>
      </div>
    )
  }

  if (!hasLocalHistory && !hasApiSessions) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <p className="mb-3 text-4xl opacity-30">📋</p>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">No mission history yet</p>
          <p className="mt-1 font-mono text-[10px] text-neutral-500 dark:text-neutral-600">// start a mission to see it recorded here</p>
        </div>
      </div>
    )
  }

  const PROCESS_TYPE_BADGE: Record<string, string> = {
    sequential:   'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800/50',
    hierarchical: 'bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/60 dark:text-violet-400 dark:border-violet-800/50',
    parallel:     'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/50',
  }

  const CHECKPOINT_STATUS_BADGE: Record<string, { label: string; icon: string; className: string }> = {
    running:   { label: 'Running',   icon: '▶', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/50' },
    paused:    { label: 'Paused',    icon: '⏸', className: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800/50' },
    completed: { label: 'Completed', icon: '●', className: 'bg-neutral-100 text-neutral-600 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700' },
    aborted:   { label: 'Aborted',   icon: '✕', className: 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800/50' },
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <h2 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-neutral-600">Mission History</h2>

      {/* Local checkpoint history */}
      {hasLocalHistory ? (
        <div className="space-y-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-700">📦 Local Checkpoints</p>
          {localHistory.map((cp) => {
            const completedTasks = cp.tasks.filter(t => t.status === 'done' || t.status === 'completed').length
            const totalTasks = cp.tasks.length
            const statusBadge = CHECKPOINT_STATUS_BADGE[cp.status] ?? CHECKPOINT_STATUS_BADGE['completed']!
            const processClass = PROCESS_TYPE_BADGE[cp.processType] ?? ''
            const timeRef = cp.completedAt ?? cp.updatedAt

            return (
              <div
                key={cp.id}
                className="rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900/80 dark:hover:border-neutral-700"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-700" aria-hidden>{statusBadge!.icon}</span>
                  <h3 className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    {cp.label}
                  </h3>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold', statusBadge!.className)}>
                    {statusBadge!.label}
                  </span>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold capitalize', processClass)}>
                    {cp.processType}
                  </span>
                </div>

                {/* Team avatars */}
                {cp.team.length > 0 ? (
                  <div className="mb-2 flex -space-x-1.5">
                    {cp.team.slice(0, 5).map((member, idx) => {
                      const ac = AGENT_ACCENT_COLORS[idx % AGENT_ACCENT_COLORS.length]
                      return (
                        <span
                          key={member.id}
                          title={member.name}
                          className={cn('flex size-6 items-center justify-center rounded-full border border-white text-[9px] font-bold text-white dark:border-neutral-900', ac.avatar)}
                        >
                          {member.name.charAt(0).toUpperCase()}
                        </span>
                      )
                    })}
                    {cp.team.length > 5 ? (
                      <span className="flex size-6 items-center justify-center rounded-full border border-white bg-neutral-200 text-[9px] font-bold text-neutral-600 dark:border-neutral-900 dark:bg-neutral-800 dark:text-neutral-500">
                        +{cp.team.length - 5}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex items-center gap-3 font-mono text-[9px] text-neutral-700">
                  {totalTasks > 0 ? (
                    <span>{completedTasks}/{totalTasks} tasks</span>
                  ) : null}
                  {timeRef > 0 ? <span>{timeAgoFromMs(timeRef)}</span> : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {/* API sessions history */}
      {hasApiSessions ? (
        <div className="space-y-3">
          {hasLocalHistory ? (
            <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-700">🌐 Gateway Sessions</p>
          ) : null}
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
                ? { label: 'Active', icon: '▶', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/50' }
                : status === 'idle'
                  ? { label: 'Idle', icon: '⏸', className: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800/50' }
                  : { label: 'Ended', icon: '●', className: 'bg-neutral-100 text-neutral-600 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-500 dark:border-neutral-700' }

            return (
              <div
                key={sessionId || label}
                className="rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900/80 dark:hover:border-neutral-700"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] text-neutral-500 dark:text-neutral-700" aria-hidden>{statusBadge.icon}</span>
                      <h3 className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {label.replace(/^Mission:\s*/, '')}
                      </h3>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold',
                          statusBadge.className,
                        )}
                      >
                        {statusBadge.label}
                      </span>
                    </div>
                    {lastMessage ? (
                      <p className="mt-1.5 line-clamp-2 font-mono text-[10px] text-neutral-600">
                        {lastMessage}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-3 font-mono text-[9px] text-neutral-700">
                      {updatedAt > 0 ? <span>{timeAgoFromMs(updatedAt)}</span> : null}
                      {tokenCount !== undefined ? (
                        <span>{tokenCount.toLocaleString()} tokens</span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : sessionId)}
                    className="shrink-0 rounded-lg border border-neutral-200 bg-neutral-100 px-2.5 py-1 text-[10px] font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-neutral-200"
                  >
                    {isExpanded ? 'Hide' : 'View'}
                  </button>
                </div>

                {isExpanded ? (
                  <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/60">
                    <p className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-700">
                      Session Details
                    </p>
                    <dl className="space-y-1.5">
                      <div className="flex gap-2">
                        <dt className="shrink-0 font-mono text-[9px] text-neutral-500 dark:text-neutral-700">ID</dt>
                        <dd className="truncate font-mono text-[9px] text-neutral-600 dark:text-neutral-400">{sessionId}</dd>
                      </div>
                      {lastMessage ? (
                        <div className="flex flex-col gap-0.5">
                          <dt className="font-mono text-[9px] text-neutral-700">Last output</dt>
                          <dd className="line-clamp-4 font-mono text-[9px] text-neutral-500">{lastMessage}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function AgentHubLayout({ agents }: AgentHubLayoutProps) {
  // ── Tab + sidebar state ────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('office')
  const [liveFeedVisible, setLiveFeedVisible] = useState(false)
  const [unreadFeedCount, setUnreadFeedCount] = useState(0)
  const [processType, setProcessType] = useState<'sequential' | 'hierarchical' | 'parallel'>('parallel')
  const [gatewayOk, setGatewayOk] = useState(true)

  // ── Approvals state ────────────────────────────────────────────────────────
  const [approvals, setApprovals] = useState<ApprovalRequest[]>(() => loadApprovals())

  // ── Restore-banner state (from localStorage checkpoint) ───────────────────
  const [restoreCheckpoint, setRestoreCheckpoint] = useState<MissionCheckpoint | null>(() => {
    const cp = loadMissionCheckpoint()
    return cp?.status === 'running' ? cp : null
  })
  const [restoreDismissed, setRestoreDismissed] = useState(false)

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
      if (!stored) return {}
      const parsed = JSON.parse(stored) as Record<string, unknown>
      const result: Record<string, string> = {}
      for (const [id, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          // Old format: plain string sessionKey
          result[id] = value
        } else if (value && typeof value === 'object' && typeof (value as AgentSessionInfo).sessionKey === 'string') {
          // New format: { sessionKey, model? }
          result[id] = (value as AgentSessionInfo).sessionKey
        }
      }
      return result
    } catch {
      return {}
    }
  })
  const [agentSessionModelMap, setAgentSessionModelMap] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const stored = window.localStorage.getItem('clawsuite:hub-agent-sessions')
      if (!stored) return {}
      const parsed = JSON.parse(stored) as Record<string, unknown>
      const result: Record<string, string> = {}
      for (const [id, value] of Object.entries(parsed)) {
        if (value && typeof value === 'object' && typeof (value as AgentSessionInfo).model === 'string') {
          result[id] = (value as AgentSessionInfo).model as string
        }
      }
      return result
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
  // Mission ID for checkpointing
  const missionIdRef = useRef<string>('')
  const missionStartedAtRef = useRef<number>(0)
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
  // Spec 4: idempotency ref — tracks task IDs that have already been dispatched
  const dispatchedTaskIdsRef = useRef<Set<string>>(new Set())
  // Spec 4: stable ref for missionState so executeMission always sees current value
  const missionStateRef = useRef(missionState)
  // Spec 4: stable ref for missionTasks for completion detection in polling loop
  const missionTasksRef = useRef(missionTasks)
  // Spec 4: track which session keys have had their tasks moved to review (avoid repeat)
  const completionDetectedRef = useRef<Set<string>>(new Set())

  teamRef.current = team
  missionGoalRef.current = missionGoal
  liveFeedVisibleRef.current = liveFeedVisible
  missionStateRef.current = missionState
  missionTasksRef.current = missionTasks

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
    const combined: Record<string, AgentSessionInfo> = {}
    for (const [id, sessionKey] of Object.entries(agentSessionMap)) {
      const model = agentSessionModelMap[id]
      combined[id] = model ? { sessionKey, model } : { sessionKey }
    }
    window.localStorage.setItem('clawsuite:hub-agent-sessions', JSON.stringify(combined))
  }, [agentSessionMap, agentSessionModelMap])

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

  // ── Feed event → agentActivity + approval parsing ─────────────────────────
  // Update last-line activity from feed events (agent_active, agent_spawned, etc.)
  // Also parse APPROVAL_REQUIRED: markers from assistant messages.
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

      // Parse APPROVAL_REQUIRED from assistant messages
      const content = event.message ?? ''
      if (content.includes('APPROVAL_REQUIRED:')) {
        const agentId = member.id
        const agentName = member.name
        const action = content.split('APPROVAL_REQUIRED:')[1]?.split('\n')[0]?.trim() ?? content
        addApproval({ agentId, agentName, action, context: content })
        setApprovals(loadApprovals())
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
          // TODO: SSE chunk events bypass the feed-event APPROVAL_REQUIRED parser.
          // If agents send approval markers mid-stream, they won't be caught here.
          // Fix: emit a feed event from handleUpdate when text contains APPROVAL_REQUIRED,
          // so the onFeedEvent handler in the main effect can pick it up.
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
        roleDescription: member.roleDescription,
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

    setMissionTasks((previous) => {
      const updated = previous.map((task) => {
        if (!ids.has(task.id) || task.status === status) return task
        return { ...task, status, updatedAt: Date.now() }
      })

      // Save checkpoint with updated task statuses
      const currentCp = loadMissionCheckpoint()
      if (currentCp) {
        saveMissionCheckpoint({
          ...currentCp,
          tasks: updated.map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            assignedTo: t.agentId,
          })),
        })
      }

      return updated
    })

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
    const isPC1 = member.modelId.startsWith('pc1-')
    const friendlyId = `hub-${baseName}-${suffix}`
    const label = isPC1 ? `[PC1] Mission: ${member.name}` : `Mission: ${member.name}`

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
      // Track model used at spawn time
      const modelString = MODEL_PRESET_MAP[member.modelId] ?? ''
      if (modelString) {
        setAgentSessionModelMap((prev) => ({ ...prev, [member.id]: modelString }))
      }
      setSpawnState((prev) => ({ ...prev, [member.id]: 'ready' }))
      setAgentSessionStatus((prev) => ({
        ...prev,
        [member.id]: { status: 'idle', lastSeen: Date.now() },
      }))
      const modelPreset = MODEL_PRESETS.find((p) => p.id === member.modelId)
      const modelSuffix = member.modelId !== 'auto' && modelPreset ? ` (${modelPreset.label})` : ''
      emitFeedEvent({
        type: 'agent_spawned',
        message: `${member.name} session re-created${modelSuffix}`,
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
    setAgentSessionModelMap((prev) => {
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

  // ── Approval handlers ──────────────────────────────────────────────────────
  const handleApprove = useCallback((id: string) => {
    const approval = approvals.find(a => a.id === id)
    if (!approval) return
    const sessionKey = agentSessionMap[approval.agentId]
    if (sessionKey) {
      fetch('/api/sessions/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey,
          message: `[APPROVED] You may proceed with: ${approval.action}`,
        }),
      }).catch(() => { /* best-effort */ })
    }
    const updated = approvals.map(a =>
      a.id === id ? { ...a, status: 'approved' as const, resolvedAt: Date.now() } : a
    )
    setApprovals(updated)
    saveApprovals(updated)
  }, [approvals, agentSessionMap])

  const handleDeny = useCallback((id: string) => {
    const approval = approvals.find(a => a.id === id)
    if (!approval) return
    const sessionKey = agentSessionMap[approval.agentId]
    if (sessionKey) {
      fetch('/api/sessions/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey,
          message: `[DENIED] You may NOT proceed with: ${approval.action}. Please stop and await further instructions.`,
        }),
      }).catch(() => { /* best-effort */ })
    }
    const updated = approvals.map(a =>
      a.id === id ? { ...a, status: 'denied' as const, resolvedAt: Date.now() } : a
    )
    setApprovals(updated)
    saveApprovals(updated)
  }, [approvals, agentSessionMap])

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
            // Track model used at spawn time
            const modelString = MODEL_PRESET_MAP[member.modelId] ?? ''
            if (modelString) {
              setAgentSessionModelMap((prev) => ({ ...prev, [member.id]: modelString }))
            }
            const modelPreset = MODEL_PRESETS.find((p) => p.id === member.modelId)
            const modelSuffix = member.modelId !== 'auto' && modelPreset ? ` (${modelPreset.label})` : ''
            emitFeedEvent({
              type: 'agent_spawned',
              message: `spawned ${member.name}${modelSuffix}`,
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
    // Hardened system prompts per PC1 role — injected when modelId starts with 'pc1-'
    const PC1_SYSTEM_PROMPTS: Partial<Record<ModelPresetId, string>> = {
      'pc1-planner':
        'You are a technical planner. Given a mission goal, produce a numbered implementation plan with clear, specific subtasks a developer can execute directly. Output ONLY the numbered list. No preamble, no explanation, no markdown headers.',
      'pc1-coder':
        'You are a TypeScript/React developer. Implement exactly what the plan says. Output ONLY code — no explanation, no prose, no markdown outside of code blocks. No new npm dependencies. Code must be production-ready.',
      'pc1-critic':
        'You are a senior code reviewer. Output ONLY a numbered patch list of specific fixes (file, line, what to change). If the code is production-ready with no issues, output exactly: LGTM — <one sentence reason>. Do not output reasoning or thinking.',
      'pc1-fast':
        'You are a concise assistant. Answer directly and briefly. No filler, no preamble.',
      'pc1-heavy':
        'You are a deep analyst. Think carefully, then output a structured, thorough analysis. Be specific and cite evidence from the provided context.',
      'pc1-fmt':
        'You are a formatter. Output ONLY valid, clean JSON or structured data matching the schema provided. No explanation, no prose.',
    }

    function buildAgentContext(member: TeamMember): string {
      const isPC1 = member.modelId.startsWith('pc1-')
      const pc1Prompt = isPC1 ? PC1_SYSTEM_PROMPTS[member.modelId] : undefined

      const parts = [
        // Inject hardened system prompt for PC1 models
        pc1Prompt && `[System] ${pc1Prompt}`,
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

      // Spec 4: idempotency — filter tasks already dispatched
      const newTasks = agentTasks.filter((task) => !dispatchedTaskIdsRef.current.has(task.id))
      if (newTasks.length === 0) return

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

        // Spec 4: mark tasks as dispatched in idempotency ref
        newTasks.forEach((task) => dispatchedTaskIdsRef.current.add(task.id))

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
        // Spec 4: pause gate
        if (missionStateRef.current === 'paused') continue
        const [agentId, agentTasks] = agentEntries[i]!
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
    const parallelEntries = Array.from(tasksByAgent.entries())
    for (let pi = 0; pi < parallelEntries.length; pi++) {
      // Spec 4: pause gate — skip dispatch if mission is paused
      if (missionStateRef.current === 'paused') continue
      const [agentId, agentTasks] = parallelEntries[pi]!
      const member = teamMembers.find((entry) => entry.id === agentId)
      const agentContext = member ? buildAgentContext(member) : ''
      const taskList = agentTasks.map((task, index) => `${index + 1}. ${task.title}`).join('\n')
      const body = `Mission Task Assignment for ${member?.name || agentId}:\n\n${taskList}\n\nMission Goal: ${missionGoalValue}\n\nPlease work through these tasks sequentially. Report progress on each.`
      const message = [agentContext, body].filter(Boolean).join('\n\n')
      await dispatchToAgent(agentId, agentTasks, message)
      // Spec 4: 100ms stagger between per-agent batches
      if (pi < parallelEntries.length - 1) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 100))
      }
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

        if (!cancelled) setGatewayOk(true)

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

          // ── Completion detection ────────────────────────────────────────────
          // When a session's last message signals task completion, move its
          // in-progress tasks to 'review' and fire a feed event (once per session).
          const COMPLETION_PHRASES = /done|completed|task complete/i
          for (const session of sessions) {
            const sessionId = readSessionId(session)
            if (!sessionId) continue
            if (completionDetectedRef.current.has(sessionId)) continue

            const lastMessage = readSessionLastMessage(session)
            if (!lastMessage || !COMPLETION_PHRASES.test(lastMessage)) continue

            const agentId = sessionKeyToAgentId.get(sessionId)
            if (!agentId) continue

            completionDetectedRef.current.add(sessionId)

            // Move this agent's in-progress tasks to review
            const tasksToMove = missionTasksRef.current
              .filter((t) => t.agentId === agentId && t.status === 'in_progress')
              .map((t) => t.id)
            if (tasksToMove.length > 0) {
              moveTasksToStatus(tasksToMove, 'review')
            }

            const agentName = readSessionName(session) || agentId
            emitFeedEvent({
              type: 'task_completed',
              message: `${agentName} completed — tasks moved to review`,
              agentName,
            })
          }
        }
      } catch {
        // Ignore polling errors; mission dispatch and local events still work.
        setGatewayOk(false)
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
    // Loop Lite always runs sequential — planner → coder → reviewer
    if (templateId === 'loop-lite') {
      setProcessType('sequential')
    }
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
    const newMissionId = `mission-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const createdTasks = parseMissionGoal(trimmedGoal, teamWithRuntimeStatus, newMissionId)
    if (createdTasks.length === 0) {
      toast('Could not parse actionable tasks from mission goal', { type: 'error' })
      return
    }

    dispatchingRef.current = true

    // Save initial checkpoint
    const missionId = newMissionId
    missionStartedAtRef.current = Date.now()
    saveMissionCheckpoint({
      id: missionId,
      label: truncateMissionGoal(trimmedGoal, 60),
      processType,
      team: teamWithRuntimeStatus.map(m => ({
        id: m.id,
        name: m.name,
        modelId: m.modelId,
        roleDescription: m.roleDescription,
        goal: m.goal,
        backstory: m.backstory,
      })),
      tasks: createdTasks.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        assignedTo: t.agentId,
      })),
      agentSessionMap: { ...agentSessionMap },
      status: 'running',
      startedAt: missionStartedAtRef.current,
      updatedAt: missionStartedAtRef.current,
    })
    // Dismiss any existing restore banner
    setRestoreCheckpoint(null)
    setRestoreDismissed(true)

    setMissionActive(true)
    setShowNewMission(false)
    setMissionState('running')
    setView('board')
    setActiveMissionGoal(trimmedGoal)
    setMissionTasks(createdTasks)
    setDispatchedTaskIdsByAgent({})
    const firstAssignedAgentId = createdTasks.find((task) => task.agentId)?.agentId
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

  // ── tasksByAgentId: map agentId → tasks dispatched to that agent ──────────
  const tasksByAgentId = useMemo((): Record<string, Array<import('./components/task-board').HubTask>> => {
    const result: Record<string, Array<import('./components/task-board').HubTask>> = {}
    const taskSource = boardTasks.length > 0 ? boardTasks : missionTasks
    for (const [agentId, taskIds] of Object.entries(dispatchedTaskIdsByAgent)) {
      const idSet = new Set(taskIds)
      result[agentId] = taskSource.filter((t) => idSet.has(t.id))
    }
    return result
  }, [boardTasks, missionTasks, dispatchedTaskIdsByAgent])

  // ── Stop mission helper ───────────────────────────────────────────────────
  function handleStopMission() {
    const currentCp = loadMissionCheckpoint()
    if (currentCp) {
      archiveMissionToHistory({ ...currentCp, status: 'aborted' })
      clearMissionCheckpoint()
    }
    // Best-effort abort: signal each agent session to stop current inference
    Object.values(agentSessionMap).forEach((sessionKey) => {
      fetch('/api/chat-abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey }),
      }).catch(() => {})
    })
    // Then tear down the sessions
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
    missionIdRef.current = ''
  }

  // ── Mission tab content ────────────────────────────────────────────────────
  function renderMissionContent() {
    const showRestoreBanner = restoreCheckpoint && !restoreDismissed && !missionActive

    // Compute progress metrics for the command header
    const totalTasks = boardTasks.length
    const doneTasks = boardTasks.filter((t) => t.status === 'done').length
    const reviewTasks = boardTasks.filter((t) => t.status === 'review').length
    const inProgressTasks = boardTasks.filter((t) => t.status === 'in_progress').length
    const percentComplete = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
    const donePercent = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0
    const reviewPercent = totalTasks > 0 ? (reviewTasks / totalTasks) * 100 : 0
    const inProgressPercent = totalTasks > 0 ? (inProgressTasks / totalTasks) * 100 : 0

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Restore banner */}
        {showRestoreBanner ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs dark:border-amber-800/40 dark:bg-amber-950/20">
            <span aria-hidden>⚡</span>
            <span className="flex-1 truncate text-amber-800 dark:text-amber-200">
              Resume previous mission?{' '}
              <span className="font-semibold">
                &ldquo;{truncateMissionGoal(restoreCheckpoint.label, 40)}&rdquo;
              </span>
              {' · '}started {timeAgoFromMs(restoreCheckpoint.startedAt)}
              {restoreCheckpoint.tasks.length > 0 ? (
                <> · {restoreCheckpoint.tasks.filter(t => t.status === 'done' || t.status === 'completed').length}/{restoreCheckpoint.tasks.length} tasks done</>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => {
                setMissionGoal(restoreCheckpoint.label)
                setProcessType(restoreCheckpoint.processType)
                setRestoreDismissed(true)
                setRestoreCheckpoint(null)
              }}
              className="shrink-0 rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-amber-600"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={() => {
                clearMissionCheckpoint()
                setRestoreCheckpoint(null)
                setRestoreDismissed(true)
              }}
              className="shrink-0 rounded-md border border-amber-300 px-2.5 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30"
            >
              Discard
            </button>
          </div>
        ) : null}

        {/* ── A) Command Header — visible when mission is active ── */}
        {missionActive ? (
          <div className="sticky top-0 z-30 shrink-0 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-neutral-950/70">
            {/* Primary row: goal title + status + progress bar + controls */}
            <div className="flex items-center gap-3 px-4 py-2.5">
              {/* Left: title + status pill + % */}
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {truncateMissionGoal(activeMissionGoal || missionGoal.trim(), 70)}
                </p>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    missionBadge.className,
                  )}
                >
                  {missionBadge.label}
                </span>
                {totalTasks > 0 ? (
                  <span className="shrink-0 font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
                    {percentComplete}%
                  </span>
                ) : null}
              </div>

              {/* Center: progress bar */}
              {totalTasks > 0 ? (
                <div className="hidden h-1.5 w-36 shrink-0 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800 md:flex">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${donePercent}%` }} />
                  <div className="h-full bg-amber-400 transition-all" style={{ width: `${reviewPercent}%` }} />
                  <div className="h-full bg-blue-400 transition-all" style={{ width: `${inProgressPercent}%` }} />
                </div>
              ) : null}

              {/* Right: mission controls */}
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMissionState('running')}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                    missionState === 'running'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40',
                  )}
                >
                  ▶ Start
                </button>
                <button
                  type="button"
                  onClick={() => setMissionState('paused')}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                    missionState === 'paused'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40',
                  )}
                >
                  ⏸ Pause
                </button>
                <button
                  type="button"
                  onClick={handleStopMission}
                  className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-200 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  ■ Stop
                </button>
              </div>
            </div>

            {/* Secondary row: budget + auto-assign + view toggle */}
            <div className="flex items-center gap-4 border-t border-neutral-100 px-4 py-1.5 dark:border-white/5">
              <label className="flex items-center gap-1.5">
                <span className="text-[10px] text-neutral-500 dark:text-neutral-500">Budget</span>
                <input
                  type="number"
                  min={0}
                  value={budgetLimit}
                  onChange={(e) => setBudgetLimit(e.target.value)}
                  className="w-24 rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[10px] text-neutral-700 outline-none focus:ring-1 focus:ring-accent-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                />
                <span className="text-[10px] text-neutral-400 dark:text-neutral-600">tokens</span>
              </label>

              <button
                type="button"
                onClick={() => setAutoAssign((p) => !p)}
                className="flex items-center gap-1.5 text-[10px] transition-colors hover:text-neutral-700 dark:hover:text-neutral-300"
              >
                <span className="text-neutral-500 dark:text-neutral-500">Auto-assign</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                    autoAssign
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
                  )}
                >
                  {autoAssign ? 'On' : 'Off'}
                </span>
              </button>

              {/* View toggle */}
              <div className="ml-auto flex items-center rounded-lg border border-neutral-200 bg-white p-0.5 dark:border-neutral-700 dark:bg-neutral-900">
                {(['board', 'timeline'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[10px] font-medium capitalize transition-colors',
                      view === v
                        ? 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100'
                        : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300',
                    )}
                  >
                    {v === 'board' ? 'Board' : 'Timeline'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* ── B) Main workspace ────────────────────────────────────────────── */}
        {!missionActive ? (
          showNewMission ? (
            <div className="flex min-h-0 flex-1 items-center justify-center px-8 py-6">
              <div className="w-full max-w-2xl rounded-2xl border border-primary-200 bg-white/80 px-8 py-6 text-center shadow-sm dark:border-neutral-700 dark:bg-neutral-900/70">
                <div className="mb-4 flex flex-wrap items-center justify-center gap-2 text-xs text-primary-400">
                  <span className="rounded-full bg-primary-100 px-2 py-0.5">1. Choose a team template</span>
                  <span className="text-primary-300">→</span>
                  <span className="rounded-full bg-primary-100 px-2 py-0.5">2. Describe your mission</span>
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

                  {suggestedTemplateName ? (
                    <p className="text-[11px] text-primary-400 dark:text-neutral-500">
                      Will use:{' '}
                      <span className="font-semibold text-accent-600 dark:text-accent-400">
                        {suggestedTemplateName}
                      </span>
                    </p>
                  ) : null}

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
            <div className="flex min-h-0 flex-1 items-center justify-center px-6">
              <div className="rounded-xl border border-primary-200 bg-white/80 px-6 py-5 text-center dark:border-neutral-700 dark:bg-neutral-900/70">
                <h2 className="text-sm font-semibold text-primary-900 dark:text-neutral-100">Mission stopped</h2>
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
          <div className="flex min-h-0 flex-1 items-center justify-center px-6">
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
          /* ── 2-column workspace: TaskBoard + LiveActivityPanel ── */
          <div className="flex min-h-0 flex-1">
            {/* Left: Task Board */}
            <div className="min-w-0 flex-1 overflow-hidden">
              <TaskBoard
                agents={boardAgents}
                initialTasks={missionTasks}
                selectedAgentId={selectedAgentId}
                onRef={handleTaskBoardRef}
                onTasksChange={setBoardTasks}
                activeMissionId={missionIdRef.current || undefined}
              />
            </div>

            {/* Right: Live Activity Panel (desktop only) */}
            {!isMobileHub ? (
              <div className="w-[380px] shrink-0">
                <LiveActivityPanel
                  agents={agentWorkingRows}
                  selectedAgentId={selectedOutputAgentId}
                  sessionKeyByAgentId={agentSessionMap}
                  tasksByAgentId={tasksByAgentId}
                  onViewAgent={handleAgentSelection}
                  onKillAgent={(agentId: string) => {
                    const member = teamWithRuntimeStatus.find((m) => m.id === agentId)
                    if (member) void handleKillSession(member)
                  }}
                  onRespawnAgent={(agentId: string) => {
                    const member = teamWithRuntimeStatus.find((m) => m.id === agentId)
                    if (member) void handleRetrySpawn(member)
                  }}
                  onCloseOutput={() => setSelectedOutputAgentId(undefined)}
                  missionRunning={isMissionRunning}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-gradient-to-br dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
      {/* ── Brand top accent border ──────────────────────────────────────── */}
      <div className="h-[2px] w-full bg-gradient-to-r from-orange-500 via-orange-400 to-amber-400 shrink-0" />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-5 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-white">
            Agent Hub
          </h1>
          <p className="font-mono text-[10px] text-neutral-500">// Mission Control</p>
        </div>
        {/* Status pill lives in the header */}
        <GatewayStatusPill
          status={effectiveGatewayStatus}
          spawnErrorNames={spawnErrorNames}
          onRetry={spawnErrorNames.length > 0 ? handleRetryAllSpawnErrors : undefined}
        />
      </div>

      {/* ── Tab Navigation Bar ────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {TAB_DEFS.map((tab) => {
          const pendingApprovals = tab.id === 'approvals'
            ? approvals.filter(a => a.status === 'pending').length
            : 0
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all',
                isActive
                  ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white'
                  : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-200',
              )}
            >
              {/* Active tab: orange bottom highlight */}
              {isActive ? (
                <span className="absolute inset-x-0 bottom-0 h-[2px] bg-orange-500" />
              ) : null}
              <span aria-hidden className="text-base leading-none">{tab.icon}</span>
              <span>{tab.label}</span>
              {/* Mission tab: animated running indicator */}
              {tab.id === 'mission' && isMissionRunning ? (
                <span className="relative ml-0.5 flex size-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                </span>
              ) : null}
              {/* Approvals tab: pending count badge */}
              {tab.id === 'approvals' && pendingApprovals > 0 ? (
                <span className="ml-0.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                  {pendingApprovals > 99 ? '99+' : pendingApprovals}
                </span>
              ) : null}
            </button>
          )
        })}

        {/* Spacer + Live Feed toggle */}
        <div className="ml-auto flex items-center gap-3 pr-3">
          <button
            type="button"
            onClick={() => {
              setLiveFeedVisible((v) => !v)
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors',
              liveFeedVisible
                ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200',
            )}
          >
            <span aria-hidden>📡</span>
            <span className="hidden sm:inline">Live Feed</span>
            {unreadFeedCount > 0 && !liveFeedVisible ? (
              <span className="ml-0.5 rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                {unreadFeedCount > 99 ? '99+' : unreadFeedCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {/* ── Gateway health banner ─────────────────────────────────────────── */}
      {!gatewayOk ? (
        <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-4 py-1.5 text-xs text-red-600 dark:text-red-400">
          ⚠️ Gateway disconnected — retrying…
        </div>
      ) : null}

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
              activeTemplateName={activeTemplateId ? TEMPLATE_DISPLAY_NAMES[activeTemplateId] : undefined}
              processType={processType}
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

          {/* Approvals tab */}
          {activeTab === 'approvals' ? (
            <ApprovalsPanel
              approvals={approvals}
              onApprove={handleApprove}
              onDeny={handleDeny}
            />
          ) : null}

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

        {/* ── Collapsible Live Feed sidebar ── */}
        {liveFeedVisible ? (
          <div className="flex w-72 shrink-0 flex-col border-l border-primary-200 bg-primary-50/30 dark:border-neutral-700 dark:bg-neutral-900/20">
            <div className="min-h-0 flex-1 overflow-hidden">
              <LiveFeedPanel />
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
          {TAB_DEFS.map((tab) => {
            const pendingApprovals = tab.id === 'approvals'
              ? approvals.filter(a => a.status === 'pending').length
              : 0
            return (
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
                {tab.id === 'approvals' && pendingApprovals > 0 ? (
                  <span className="absolute right-2 top-1 rounded-full bg-red-500 px-1 text-[8px] font-bold text-white leading-tight">
                    {pendingApprovals > 9 ? '9+' : pendingApprovals}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
