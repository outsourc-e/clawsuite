import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  PlayIcon,
  Rocket01Icon,
  Search01Icon,
  Settings01Icon,
  TaskDone01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/prompt-kit/markdown'
import { OfficeView } from './components/office-view'
import type { AgentWorkingRow } from './components/agents-working-panel'
import { type GatewaySession } from '@/lib/gateway-api'
import { cn } from '@/lib/utils'
import { type MissionHistoryEntry, type MissionHistoryWorkerDetail, useConductorGateway } from './hooks/use-conductor-gateway'

type ConductorPhase = 'home' | 'preview' | 'active' | 'complete'
type QuickActionId = 'research' | 'build' | 'review' | 'deploy'

type HistoryMessage = {
  role?: string
  content?: string | Array<{ type?: string; text?: string }>
}

type MissionCostWorker = {
  id: string
  label: string
  totalTokens: number
  personaEmoji: string
  personaName: string
}

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
  ['--theme-shadow' as string]: 'color-mix(in srgb, var(--color-primary-950) 14%, transparent)',
  ['--theme-danger' as string]: 'var(--color-red-600, #dc2626)',
  ['--theme-danger-soft' as string]: 'color-mix(in srgb, var(--theme-danger) 12%, transparent)',
  ['--theme-danger-soft-strong' as string]: 'color-mix(in srgb, var(--theme-danger) 18%, transparent)',
  ['--theme-danger-border' as string]: 'color-mix(in srgb, var(--theme-danger) 35%, white)',
  ['--theme-warning' as string]: 'var(--color-amber-600, #d97706)',
  ['--theme-warning-soft' as string]: 'color-mix(in srgb, var(--theme-warning) 12%, transparent)',
  ['--theme-warning-soft-strong' as string]: 'color-mix(in srgb, var(--theme-warning) 18%, transparent)',
  ['--theme-warning-border' as string]: 'color-mix(in srgb, var(--theme-warning) 35%, white)',
}

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

const AGENT_NAMES = ['Nova', 'Pixel', 'Blaze', 'Echo', 'Sage', 'Drift', 'Flux', 'Volt']
const AGENT_EMOJIS = ['🤖', '⚡', '🔥', '🌊', '🌿', '💫', '🔮', '⭐']
const BLENDED_COST_PER_MILLION_TOKENS = 5

function getAgentPersona(index: number) {
  return {
    name: AGENT_NAMES[index % AGENT_NAMES.length],
    emoji: AGENT_EMOJIS[index % AGENT_EMOJIS.length],
  }
}

function estimateTokenCost(totalTokens: number): number {
  return (Math.max(0, totalTokens) / 1_000_000) * BLENDED_COST_PER_MILLION_TOKENS
}

function formatUsd(value: number): string {
  return `$${value.toFixed(value >= 0.1 ? 2 : 3)}`
}

function MissionCostSection({
  totalTokens,
  workers,
  expanded,
  onToggle,
}: {
  totalTokens: number
  workers: MissionCostWorker[]
  expanded: boolean
  onToggle: () => void
}) {
  const estimatedCost = estimateTokenCost(totalTokens)

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-5 py-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Mission Cost</p>
          <p className="mt-1 text-sm text-[var(--theme-muted-2)]">Approximate at $5 / 1M tokens blended from input/output pricing.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2 text-xs font-medium text-[var(--theme-text)]">
          {expanded ? 'Hide' : 'Show'}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={16}
            strokeWidth={1.7}
            className={cn('transition-transform duration-200', expanded ? 'rotate-180' : 'rotate-0')}
          />
        </span>
      </button>

      {expanded ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">Total Tokens</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--theme-text)]">{totalTokens.toLocaleString()}</p>
            </div>
            <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">Estimated Cost</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--theme-text)]">{formatUsd(estimatedCost)}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)]">
            <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
              <span>Workers</span>
              <span>Cost</span>
            </div>
            {workers.length > 0 ? (
              <div className="divide-y divide-[var(--theme-border)]">
                {workers.map((worker) => (
                  <div key={worker.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="font-medium text-[var(--theme-text)]">{worker.personaEmoji} {worker.personaName}</span>
                    <span className="min-w-0 flex-1 truncate text-[var(--theme-muted)]">{worker.label}</span>
                    <span className="text-xs text-[var(--theme-muted)]">{worker.totalTokens.toLocaleString()} tok</span>
                    <span className="min-w-[4.5rem] text-right font-medium text-[var(--theme-text)]">{formatUsd(estimateTokenCost(worker.totalTokens))}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-3 text-sm text-[var(--theme-muted)]">Per-worker token details were not captured for this mission.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

const PLANNING_STEPS = ['Planning the mission…', 'Analyzing requirements…', 'Preparing agents…', 'Writing the spec…']
const WORKING_STEPS = [
  '📋 Reviewing the brief…',
  '🔍 Scanning existing patterns…',
  '✏️ Drafting the implementation…',
  '☕ Grabbing a coffee…',
  '🧠 Thinking through edge cases…',
  '🎨 Polishing the design…',
  '🔧 Wiring up components…',
  '📐 Checking the layout…',
  '🚀 Almost there…',
]

function CyclingStatus({ steps, intervalMs = 3000 }: { steps: string[]; intervalMs?: number }) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setStep((current) => (current + 1) % steps.length), intervalMs)
    return () => window.clearInterval(timer)
  }, [steps.length, intervalMs])

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="size-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
      <p className="text-sm text-[var(--theme-muted)] transition-opacity duration-500">{steps[step]}</p>
    </div>
  )
}

function PlanningIndicator() {
  return <CyclingStatus steps={PLANNING_STEPS} intervalMs={2500} />
}

function getOutputDisplayName(projectPath: string | null | undefined): string {
  if (!projectPath) return 'Output ready'
  return projectPath.split('/').pop() || 'index.html'
}

function formatMissionTimestamp(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function buildProjectPathCandidates(workers: Array<{ label: string }>, missionStartedAt: string | null | undefined): string[] {
  const timestamp = formatMissionTimestamp(missionStartedAt)
  const candidates = new Set<string>()

  for (const worker of workers) {
    const label = worker.label ?? ''
    const slug = label.replace(/^worker-/, '').trim()
    if (!slug) continue

    candidates.add(`/tmp/dispatch-${slug}`)
    candidates.add(`/tmp/dispatch-${slug}-page`)

    if (timestamp) {
      candidates.add(`/tmp/dispatch-${slug}-${timestamp}`)
      candidates.add(`/tmp/dispatch-${slug}-${timestamp}-page`)
    }
  }

  return [...candidates]
}

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

function formatDurationRange(startIso: string | null | undefined, endIso: string | null | undefined, now: number): string {
  const endMs = endIso ? new Date(endIso).getTime() : now
  if (!Number.isFinite(endMs)) return formatElapsedTime(startIso, now)
  return formatElapsedTime(startIso, endMs)
}

function formatRelativeTime(value: string | null | undefined, now: number): string {
  if (!value) return 'just now'
  const ms = new Date(value).getTime()
  if (!Number.isFinite(ms)) return 'just now'
  const diffSeconds = Math.max(0, Math.floor((now - ms) / 1000))
  if (diffSeconds < 10) return 'just now'
  if (diffSeconds < 60) return `${diffSeconds}s ago`
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  return `${diffHours}h ago`
}

function formatSteerTimestamp(value: number): string {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getWorkerDot(status: 'running' | 'complete' | 'stale' | 'idle') {
  if (status === 'complete') return { dotClass: 'bg-emerald-400', label: 'Complete' }
  if (status === 'running') return { dotClass: 'bg-sky-400 animate-pulse', label: 'Running' }
  if (status === 'idle') return { dotClass: 'bg-amber-400', label: 'Idle' }
  return { dotClass: 'bg-red-400', label: 'Stale' }
}

function getWorkerBorderClass(status: 'running' | 'complete' | 'stale' | 'idle') {
  if (status === 'complete') return 'border-l-emerald-400'
  if (status === 'running') return 'border-l-sky-400'
  if (status === 'idle') return 'border-l-amber-400'
  return 'border-l-red-400'
}

function getShortModelName(model: string | null | undefined): string {
  if (!model) return 'Unknown'
  const parts = model.split('/')
  return parts[parts.length - 1] || model
}

function extractMessageText(message: HistoryMessage | undefined): string {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function getLastAssistantMessage(messages: HistoryMessage[] | undefined): string {
  if (!Array.isArray(messages)) return ''
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'assistant') continue
    const text = extractMessageText(message)
    if (text.trim()) return text.trim()
  }
  return ''
}

function extractProjectPath(text: string): string | null {
  const structuredPatterns = [
    /\b(?:Created|Output|Wrote|Saved to|Built|Generated|Written to)\s+(\/tmp\/dispatch-[^\s"')`\]>]+)/gi,
    /\b(?:Created|Output|Wrote|Saved to|Built|Generated|Written to)\s*:\s*(\/tmp\/dispatch-[^\s"')`\]>]+)/gi,
  ]

  for (const pattern of structuredPatterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1]
      if (!raw) continue
      const cleaned = raw.replace(/[.,;:!?`]+$/, '')
      const normalized = cleaned.replace(/\/(index\.html|dist|build)\/?$/i, '')
      if (normalized.startsWith('/tmp/dispatch-')) return normalized
    }
  }

  const matches = text.match(/\/tmp\/dispatch-[^\s"')`\]>]+/g) ?? []
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;:!?\-`]+$/, '')
    const normalized = cleaned.replace(/\/(index\.html|dist|build)\/?$/i, '')
    if (normalized.startsWith('/tmp/dispatch-')) return normalized
  }

  const tmpMatches = text.match(/\/tmp\/[a-zA-Z0-9][^\s"')`\]>]+/g) ?? []
  for (const raw of tmpMatches) {
    const cleaned = raw.replace(/[.,;:!?\-`]+$/, '')
    const normalized = cleaned.replace(/\/(index\.html|dist|build)\/?$/i, '')
    if (normalized.length > 5) return normalized
  }

  return null
}

function deriveSessionStatus(session: GatewaySession): 'running' | 'completed' | 'failed' {
  const updatedMs = new Date(session.updatedAt as string).getTime()
  const staleness = Number.isFinite(updatedMs) ? Date.now() - updatedMs : 0
  const tokens = typeof session.totalTokens === 'number' ? session.totalTokens : 0
  const statusText = `${session.status ?? ''} ${session.state ?? ''}`.toLowerCase()

  if (statusText.includes('error') || statusText.includes('failed')) return 'failed'
  if (tokens > 0 && staleness > 30_000) return 'completed'
  if (staleness > 120_000 && tokens === 0) return 'failed'
  return 'running'
}

const ACTIVITY_PAGE_SIZE = 3

export function Conductor() {
  const conductor = useConductorGateway()
  const [goalDraft, setGoalDraft] = useState('')
  const [steerDraft, setSteerDraft] = useState('')
  const [steerHistory, setSteerHistory] = useState<string[]>([])
  const [steerHistoryTimestamps, setSteerHistoryTimestamps] = useState<number[]>([])
  const [steerError, setSteerError] = useState<string | null>(null)
  const [selectedAction, setSelectedAction] = useState<QuickActionId>('build')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [activityFilter, setActivityFilter] = useState<'all' | 'completed' | 'failed'>('all')
  const [activityPage, setActivityPage] = useState(0)
  const [completeCostExpanded, setCompleteCostExpanded] = useState(true)
  const [historyCostExpanded, setHistoryCostExpanded] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const steerInputRef = useRef<HTMLInputElement | null>(null)
  const modelsQuery = useQuery({
    queryKey: ['conductor', 'models'],
    queryFn: async () => {
      const res = await fetch('/api/models')
      const data = (await res.json()) as { ok?: boolean; models?: Array<{ id?: string; provider?: string; name?: string }> }
      return data.models ?? []
    },
    enabled: settingsOpen,
    staleTime: 60_000,
  })
  const availableModels = modelsQuery.data ?? []

  useEffect(() => {
    if (conductor.phase === 'idle' || conductor.phase === 'complete') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [conductor.phase])


  // Set body background to match Conductor theme so no gray shows behind keyboard/tab bar
  useEffect(() => {
    const prev = document.body.style.backgroundColor
    document.body.style.backgroundColor = 'var(--color-surface)'
    return () => { document.body.style.backgroundColor = prev }
  }, [])

  const phase: ConductorPhase = useMemo(() => {
    if (conductor.phase === 'idle') return 'home'
    if (conductor.phase === 'decomposing') return 'preview'
    if (conductor.phase === 'running') return 'active'
    return 'complete'
  }, [conductor.phase])

  const handleNewMission = () => {
    conductor.resetMission()
    setGoalDraft('')
    setSteerDraft('')
    setSteerHistory([])
    setSteerHistoryTimestamps([])
    setSteerError(null)
    setSelectedTaskId(null)
    setActivityPage(0)
  }

  const handleSubmit = async () => {
    const trimmed = goalDraft.trim()
    if (!trimmed) return
    setSteerDraft('')
    setSteerHistory([])
    setSteerHistoryTimestamps([])
    setSteerError(null)
    await conductor.sendMission(trimmed)
  }

  const focusSteerInput = () => {
    if (!steerInputRef.current) return
    steerInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => {
      steerInputRef.current?.focus()
    }, 150)
  }

  const handleSendSteer = async () => {
    const trimmed = steerDraft.trim()
    if (!trimmed || !conductor.orchestratorSessionKey) return

    try {
      await conductor.sendStream(conductor.orchestratorSessionKey, `[STEER] ${trimmed}`)
      setSteerDraft('')
      setSteerError(null)
      setSteerHistory((current) => [...current, trimmed])
      setSteerHistoryTimestamps((current) => [...current, Date.now()])
    } catch (error) {
      setSteerError(error instanceof Error ? error.message : 'Failed to send steer message')
    }
  }

  const updateSettings = (patch: Partial<typeof conductor.conductorSettings>) => {
    conductor.setConductorSettings({ ...conductor.conductorSettings, ...patch })
  }

  const totalWorkers = conductor.workers.length
  const completedWorkers = conductor.workers.filter((worker) => worker.status === 'complete').length
  const activeWorkerCount = conductor.activeWorkers.length
  const missionProgress = totalWorkers > 0 ? Math.round((completedWorkers / totalWorkers) * 100) : 0
  const totalTokens = conductor.workers.reduce((sum, worker) => sum + worker.totalTokens, 0)
  const selectedHistoryEntry = conductor.selectedHistoryEntry
  const completeMissionCostWorkers = useMemo<MissionCostWorker[]>(
    () =>
      conductor.workers.map((worker, index) => {
        const persona = getAgentPersona(index)
        return {
          id: worker.key,
          label: worker.label,
          totalTokens: worker.totalTokens,
          personaEmoji: persona.emoji,
          personaName: persona.name,
        }
      }),
    [conductor.workers],
  )
  const historyMissionCostWorkers = useMemo<MissionCostWorker[]>(
    () =>
      (selectedHistoryEntry?.workerDetails ?? []).map((worker, index) => ({
        id: `${selectedHistoryEntry?.id ?? 'history'}-${index}`,
        label: worker.label,
        totalTokens: worker.totalTokens,
        personaEmoji: worker.personaEmoji,
        personaName: worker.personaName,
      })),
    [selectedHistoryEntry],
  )
  const officeAgentRows = useMemo<AgentWorkingRow[]>(() => {
    if (conductor.workers.length > 0) {
      return conductor.workers.map((worker, index) => {
        const persona = getAgentPersona(index)
        const currentTask = conductor.tasks.find((task) => task.workerKey === worker.key && task.status === 'running')?.title
        const lastLine = conductor.workerOutputs[worker.key] ?? getLastAssistantMessage(worker.raw.messages as HistoryMessage[] | undefined)

        return {
          id: worker.key,
          name: persona.name,
          modelId: worker.model || 'auto',
          roleDescription: worker.displayName,
          status: worker.status === 'complete' ? 'idle' : worker.status === 'stale' ? 'error' : 'active',
          lastLine,
          lastAt: worker.updatedAt ? new Date(worker.updatedAt).getTime() : undefined,
          taskCount: conductor.tasks.filter((task) => task.workerKey === worker.key).length,
          currentTask,
          sessionKey: worker.key,
        }
      })
    }

    return [
      {
        id: 'conductor-placeholder-agent',
        name: 'Nova',
        modelId: conductor.conductorSettings.workerModel || 'auto',
        roleDescription: 'Waiting for workers',
        status: 'spawning',
        lastLine: conductor.goal || 'Preparing the office…',
        taskCount: 0,
        currentTask: conductor.goal || 'Preparing the office…',
        sessionKey: 'conductor-placeholder-agent',
      },
    ]
  }, [conductor.conductorSettings.workerModel, conductor.goal, conductor.tasks, conductor.workerOutputs, conductor.workers])

  const completePhaseProjectPath = useMemo(() => {
    const workerOutputTexts = [
      ...Object.values(conductor.workerOutputs),
      ...conductor.workers.map((worker) => getLastAssistantMessage(worker.raw.messages as HistoryMessage[] | undefined)),
    ].filter(Boolean)

    for (const text of workerOutputTexts) {
      const extractedPath = extractProjectPath(text)
      if (extractedPath) return extractedPath
    }

    for (const task of conductor.tasks) {
      if (!task.output) continue
      const extractedPath = extractProjectPath(task.output)
      if (extractedPath) return extractedPath
    }

    const streamPath = extractProjectPath(conductor.streamText)
    if (streamPath) return streamPath

    const candidates = buildProjectPathCandidates(conductor.workers, conductor.missionStartedAt)
    return candidates[0] ?? null
  }, [conductor.tasks, conductor.streamText, conductor.workerOutputs, conductor.workers, conductor.missionStartedAt])
  const completePhaseOutputLabel = useMemo(
    () => getOutputDisplayName(completePhaseProjectPath),
    [completePhaseProjectPath],
  )

  const previewUrl = completePhaseProjectPath
    ? `/api/preview-file?path=${encodeURIComponent(`${completePhaseProjectPath}/index.html`)}`
    : null

  const selectedHistoryOutputPath = conductor.selectedHistoryEntry?.outputPath ?? null
  const selectedHistoryOutputLabel = useMemo(
    () => getOutputDisplayName(selectedHistoryOutputPath),
    [selectedHistoryOutputPath],
  )
  const selectedHistoryPreviewUrl = selectedHistoryOutputPath
    ? `/api/preview-file?path=${encodeURIComponent(`${selectedHistoryOutputPath}/index.html`)}`
    : null

  const selectedHistoryPreviewReady = useQuery({
    queryKey: ['conductor', 'history-preview-probe', selectedHistoryPreviewUrl],
    queryFn: async () => {
      if (!selectedHistoryPreviewUrl) return false
      try {
        const res = await fetch(selectedHistoryPreviewUrl)
        if (!res.ok) return false
        const text = await res.text()
        return text.length > 20 && (text.includes('<') || text.includes('html'))
      } catch {
        return false
      }
    },
    enabled: !!selectedHistoryPreviewUrl && !!conductor.selectedHistoryEntry,
    refetchInterval: (query) => (query.state.data === true ? false : 2_500),
    staleTime: 5_000,
  })

  const previewReady = useQuery({
    queryKey: ['conductor', 'preview-probe', previewUrl],
    queryFn: async () => {
      if (!previewUrl) return false
      try {
        const res = await fetch(previewUrl)
        if (!res.ok) return false
        // Check it's actually HTML, not an error page
        const text = await res.text()
        return text.length > 20 && (text.includes('<') || text.includes('html'))
      } catch {
        return false
      }
    },
    enabled: !!previewUrl && phase === 'complete',
    refetchInterval: (query) => (query.state.data === true ? false : 2_500),
    staleTime: 5_000,
  })

  const completedTaskOutputs = useMemo(() => {
    return conductor.tasks
      .filter((task) => task.output)
      .map((task) => ({
        ...task,
        extractedPath: extractProjectPath(task.output ?? ''),
        previewUrl: (() => {
          const extractedPath = extractProjectPath(task.output ?? '')
          return extractedPath ? `/api/preview-file?path=${encodeURIComponent(`${extractedPath}/index.html`)}` : null
        })(),
        previewText: (task.output ?? '').trim().slice(0, 200),
      }))
  }, [conductor.tasks])

  const completeSummary = useMemo(() => {
    if (phase !== 'complete') return null
    const isFailed = !!conductor.streamError
    const lines = [
      isFailed ? `❌ ${conductor.streamError}` : '✅ Mission completed successfully',
      '',
      `**Goal:** ${conductor.goal}`,
      `**Duration:** ${formatElapsedTime(conductor.missionStartedAt, conductor.completedAt ? new Date(conductor.completedAt).getTime() : now)}`,
    ]
    if (totalWorkers > 0) {
      lines.push(`**Workers:** ${totalWorkers} ran · ${totalTokens.toLocaleString()} tokens`)
    }
    if (completePhaseProjectPath) {
      lines.push(`**Output:** ${completePhaseOutputLabel}`)
    }
    return lines.join('\n')
  }, [phase, completePhaseProjectPath, completePhaseOutputLabel, totalWorkers, conductor.goal, totalTokens, conductor.missionStartedAt, now])
  const hasMissionHistory = conductor.missionHistory.length > 0
  const filteredHistory = (() => {
    const history = conductor.missionHistory
    if (activityFilter === 'all') return history
    return history.filter((entry) => entry.status === activityFilter)
  })()
  const filteredSessions = (() => {
    const sessions = conductor.recentSessions
    if (activityFilter === 'all') return sessions
    return sessions
      .filter((session) => ((session.label as string) ?? '').startsWith('worker-'))
      .filter((session) => deriveSessionStatus(session as GatewaySession) === activityFilter)
  })()
  const activityItems: Array<MissionHistoryEntry | GatewaySession> = hasMissionHistory ? filteredHistory : filteredSessions
  const totalPages = Math.max(1, Math.ceil(activityItems.length / ACTIVITY_PAGE_SIZE))
  const safeActivityPage = Math.min(activityPage, totalPages - 1)
  const pageItems = activityItems.slice(
    safeActivityPage * ACTIVITY_PAGE_SIZE,
    (safeActivityPage + 1) * ACTIVITY_PAGE_SIZE,
  )
  const canPrev = safeActivityPage > 0
  const canNext = safeActivityPage < totalPages - 1

  useEffect(() => {
    if (activityPage !== safeActivityPage) {
      setActivityPage(safeActivityPage)
    }
  }, [activityPage, safeActivityPage])

  useEffect(() => {
    if (!selectedTaskId) return
    if (conductor.tasks.some((task) => task.id === selectedTaskId)) return
    setSelectedTaskId(null)
  }, [conductor.tasks, selectedTaskId])

  useEffect(() => {
    if (phase !== 'complete') return
    setCompleteCostExpanded(true)
  }, [phase, conductor.completedAt])

  useEffect(() => {
    if (!selectedHistoryEntry) return
    setHistoryCostExpanded(false)
  }, [selectedHistoryEntry])

  if (phase === 'home') {
    if (selectedHistoryEntry) {
      const historyWorkerDetails = selectedHistoryEntry.workerDetails ?? []
      const historySummary = selectedHistoryEntry.completeSummary ?? selectedHistoryEntry.streamText
      const historyStatusLabel = selectedHistoryEntry.status === 'completed' ? 'Complete' : 'Stopped'
      const historyStatusClasses =
        selectedHistoryEntry.status === 'completed'
          ? 'border border-emerald-400/35 bg-emerald-500/10 text-emerald-300'
          : 'border border-red-400/35 bg-red-500/10 text-red-300'

      return (
        <div className="flex min-h-dvh flex-col overflow-y-auto bg-[var(--theme-bg)] text-[var(--theme-text)]" style={THEME_STYLE}>
          <main className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col px-4 py-4 pb-[calc(var(--tabbar-h,80px)+1rem)] md:px-6 md:py-8">
            <div className="space-y-6">
              <button
                type="button"
                onClick={() => conductor.setSelectedHistoryEntry(null)}
                className="inline-flex items-center gap-2 self-start rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-border2)] hover:text-[var(--theme-text)]"
              >
                <span aria-hidden="true">←</span> Back
              </button>

              <div className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className={cn('text-xs font-semibold uppercase tracking-[0.24em]', selectedHistoryEntry.status === 'completed' ? 'text-[var(--theme-accent)]' : 'text-red-400')}>
                      {selectedHistoryEntry.status === 'completed' ? 'Mission Complete' : 'Mission Stopped'}
                    </p>
                    <h1 className="mt-2 text-xl font-semibold tracking-tight text-[var(--theme-text)] sm:text-2xl">{selectedHistoryEntry.goal}</h1>
                    <p className="mt-2 text-xs text-[var(--theme-muted-2)]">
                      {selectedHistoryEntry.workerCount}/{Math.max(selectedHistoryEntry.workerCount, 1)} workers finished · {formatDurationRange(selectedHistoryEntry.startedAt, selectedHistoryEntry.completedAt, now)} total elapsed
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => {
                        conductor.setSelectedHistoryEntry(null)
                        handleNewMission()
                      }}
                      className="rounded-xl bg-[var(--theme-accent)] px-5 text-white hover:bg-[var(--theme-accent-strong)]"
                    >
                      New Mission
                    </Button>
                  </div>
                </div>
              </div>

              {selectedHistoryOutputPath && selectedHistoryPreviewReady.data === true ? (
                <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Output Preview</p>
                      <p className="mt-1 text-xs text-[var(--theme-muted-2)]">{selectedHistoryOutputLabel}</p>
                    </div>
                    <a
                      href={selectedHistoryPreviewUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent)]"
                    >
                      Open in new tab ↗
                    </a>
                  </div>
                  <div className="mt-4 overflow-auto rounded-2xl border border-[var(--theme-border)] bg-white">
                    <iframe
                      src={selectedHistoryPreviewUrl!}
                      className="h-[500px] w-full"
                      sandbox="allow-scripts allow-same-origin"
                      title="Mission history output preview"
                    />
                  </div>
                </section>
              ) : selectedHistoryOutputPath ? (
                <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
                  <div className="flex items-center gap-3 text-sm text-[var(--theme-muted)]">
                    <div className="size-4 animate-spin rounded-full border-2 border-[var(--theme-border)] border-t-[var(--theme-accent)]" />
                    Loading output preview…
                  </div>
                </section>
              ) : null}

              <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Agent Summary</p>
                  </div>
                  <span className={cn('rounded-full px-3 py-1 text-xs font-medium', historyStatusClasses)}>
                    {historyStatusLabel}
                  </span>
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-5 py-4">
                  {historySummary ? (
                    <Markdown className="max-h-[400px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">{historySummary}</Markdown>
                  ) : (
                    <p className="text-sm text-[var(--theme-muted)]">No summary captured.</p>
                  )}
                </div>
                {historyWorkerDetails.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {historyWorkerDetails.map((worker: MissionHistoryWorkerDetail, index) => (
                      <div key={`${selectedHistoryEntry.id}-worker-${index}`} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm">
                        <span className={cn('size-2 rounded-full', selectedHistoryEntry.status === 'completed' ? 'bg-emerald-400' : 'bg-red-400')} />
                        <span className="font-medium text-[var(--theme-text)]">{worker.personaEmoji} {worker.personaName}</span>
                        <span className="text-[var(--theme-muted)]">{worker.label}</span>
                        <span className="ml-auto text-xs text-[var(--theme-muted)]">{getShortModelName(worker.model)} · {worker.totalTokens.toLocaleString()} tok</span>
                      </div>
                    ))}
                  </div>
                )}
                {(selectedHistoryEntry.totalTokens > 0 || historyMissionCostWorkers.length > 0) && (
                  <div className="mt-4">
                    <MissionCostSection
                      totalTokens={selectedHistoryEntry.totalTokens}
                      workers={historyMissionCostWorkers}
                      expanded={historyCostExpanded}
                      onToggle={() => setHistoryCostExpanded((current) => !current)}
                    />
                  </div>
                )}
                {selectedHistoryEntry.streamText && selectedHistoryEntry.completeSummary && (
                  <details className="mt-4 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-5 py-4">
                    <summary className="cursor-pointer text-xs font-medium text-[var(--theme-muted)]">Raw Agent Output</summary>
                    <div className="mt-4 border-t border-[var(--theme-border)] pt-4">
                      <Markdown className="max-h-[400px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">{selectedHistoryEntry.streamText}</Markdown>
                    </div>
                  </details>
                )}
              </section>

              {selectedHistoryEntry.outputText && (
                <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Worker Output</p>
                  <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-5 py-4">
                    <Markdown className="max-h-[600px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">{selectedHistoryEntry.outputText}</Markdown>
                  </div>
                </section>
              )}

              {!historySummary && historyWorkerDetails.length === 0 && !selectedHistoryOutputPath && !selectedHistoryEntry.workerSummary?.length && !selectedHistoryEntry.outputText && (
                <section className="overflow-hidden rounded-3xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-card)] p-6">
                  <p className="text-center text-sm text-[var(--theme-muted)]">
                    No detailed output was captured for this mission.
                    <br />
                    <span className="text-xs text-[var(--theme-muted-2)]">Missions run after this update will save full agent summaries and output previews.</span>
                  </p>
                </section>
              )}
            </div>
          </main>
        </div>
      )
    }

    return (
      <div className="flex min-h-dvh flex-col overflow-y-auto bg-[var(--theme-bg)] text-[var(--theme-text)]" style={THEME_STYLE}>
        <main className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col items-stretch justify-center px-4 py-4 pb-[calc(var(--tabbar-h,80px)+1rem)] md:px-6 md:py-8">
          <div className="w-full space-y-8">
            <div className="space-y-3 text-center">
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="inline-flex items-center justify-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-2 text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]"
                  aria-label="Open conductor settings"
                >
                  <HugeiconsIcon icon={Settings01Icon} size={18} strokeWidth={1.7} />
                </button>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-muted)]">
                Conductor
                <span className="size-2 rounded-full bg-emerald-400" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--theme-text)] md:text-4xl">
                What should the team do next?
              </h1>
              <p className="text-sm text-[var(--theme-muted-2)]">
                Describe the mission. The agent will decompose it in chat, then the worker sessions will appear here live.
              </p>
              <button
                type="button"
                onClick={handleNewMission}
                className="text-xs text-[var(--theme-muted)] transition-colors hover:text-[var(--theme-accent)]"
              >
                ↻ Reset
              </button>
            </div>

            <section className="w-full overflow-hidden rounded-3xl border border-[var(--theme-border2)] bg-[var(--theme-card)] shadow-[0_24px_80px_var(--theme-shadow)]">
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
                      onClick={() => {
                        setSelectedAction(action.id)
                        setGoalDraft((current) => {
                          const trimmed = current.trim()
                          if (!trimmed) return action.prompt
                          return `${action.label}: ${trimmed}`
                        })
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
                  onClick={() => void handleSubmit()}
                  disabled={!goalDraft.trim() || conductor.isSending}
                  className="min-w-[140px] rounded-xl bg-[var(--theme-accent)] text-white hover:bg-[var(--theme-accent-strong)]"
                >
                  {conductor.isSending ? 'Dispatching...' : 'Launch Mission'}
                  <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.7} />
                </Button>
              </div>
            </section>

            {(hasMissionHistory || conductor.recentSessions.length > 0) && (
              <section className="w-full space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">Recent Activity</h2>
                  <div className="ml-auto flex items-center gap-1">
                    <span className="text-[10px] text-[var(--theme-muted-2)]">{safeActivityPage + 1}/{totalPages}</span>
                    <button
                      type="button"
                      disabled={!canPrev}
                      onClick={() => setActivityPage((page) => page - 1)}
                      className={cn(
                        'flex size-7 items-center justify-center rounded-lg border border-[var(--theme-border)] text-[var(--theme-muted)] transition-colors',
                        canPrev ? 'hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]' : 'opacity-30',
                      )}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      disabled={!canNext}
                      onClick={() => setActivityPage((page) => page + 1)}
                      className={cn(
                        'flex size-7 items-center justify-center rounded-lg border border-[var(--theme-border)] text-[var(--theme-muted)] transition-colors',
                        canNext ? 'hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]' : 'opacity-30',
                      )}
                    >
                      ›
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {(['all', 'completed', 'failed'] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => {
                        setActivityFilter(filter)
                        setActivityPage(0)
                      }}
                      className={cn(
                        'rounded-full border px-3 py-1 text-[11px] font-medium capitalize transition-colors',
                        activityFilter === filter
                          ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-strong)]'
                          : 'border-[var(--theme-border)] text-[var(--theme-muted-2)] hover:border-[var(--theme-accent)] hover:text-[var(--theme-text)]',
                      )}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
                {pageItems.length > 0 ? (
                  <div className="space-y-1.5">
                    {hasMissionHistory
                      ? pageItems.map((item) => {
                          const entry = item as MissionHistoryEntry
                          return (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => conductor.setSelectedHistoryEntry(entry)}
                              className="flex w-full items-center gap-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-3 text-left text-sm transition-colors cursor-pointer hover:border-[var(--theme-border2)]"
                            >
                              <span
                                className={cn('size-2 rounded-full', entry.status === 'completed' ? 'bg-emerald-400' : 'bg-red-400')}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-[var(--theme-text)]">{entry.goal}</span>
                                <span className="mt-0.5 block text-xs text-[var(--theme-muted-2)]">
                                  {formatDurationRange(entry.startedAt, entry.completedAt, now)} · {entry.workerCount} workers
                                </span>
                              </span>
                              <span className="hidden text-xs text-[var(--theme-muted)] sm:inline">{entry.totalTokens.toLocaleString()} tok</span>
                              <span className="text-xs text-[var(--theme-muted-2)]">
                                {formatRelativeTime(entry.completedAt, now)}
                              </span>
                            </button>
                          )
                        })
                      : pageItems.map((item) => {
                          const recentSession = item as GatewaySession
                          const label = recentSession.label ?? recentSession.key ?? ''
                          const displayName = label.replace(/^worker-/, '').replace(/[-_]+/g, ' ')
                          const tokens = typeof recentSession.totalTokens === 'number' ? recentSession.totalTokens : 0
                          const model = getShortModelName(recentSession.model)
                          const updatedAt =
                            typeof recentSession.updatedAt === 'string'
                              ? recentSession.updatedAt
                              : typeof recentSession.startedAt === 'string'
                                ? recentSession.startedAt
                                : typeof recentSession.createdAt === 'string'
                                  ? recentSession.createdAt
                                  : null
                          const sessionStatus = deriveSessionStatus(recentSession)
                          const dotClass =
                            sessionStatus === 'completed'
                              ? 'bg-emerald-400'
                              : sessionStatus === 'failed'
                                ? 'bg-red-400'
                                : 'bg-sky-400 animate-pulse'

                          return (
                            <div
                              key={recentSession.key}
                              className="flex items-center gap-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-2.5 text-sm"
                            >
                              <span className={cn('size-2 rounded-full', dotClass)} />
                              <span className="min-w-0 flex-1 truncate font-medium text-[var(--theme-text)] capitalize">{displayName}</span>
                              <span className="text-xs capitalize text-[var(--theme-muted)]">{sessionStatus}</span>
                              <span className="text-xs text-[var(--theme-muted)]">{model}</span>
                              <span className="text-xs text-[var(--theme-muted)]">{tokens.toLocaleString()} tok</span>
                              <span className="text-xs text-[var(--theme-muted-2)]">{formatRelativeTime(updatedAt, now)}</span>
                            </div>
                          )
                        })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--theme-border)] px-4 py-6 text-center text-sm text-[var(--theme-muted)]">
                    No {activityFilter === 'all' ? '' : `${activityFilter} `}{hasMissionHistory ? 'missions' : 'sessions'} found
                  </div>
                )}
              </section>
            )}
          </div>

          {settingsOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--theme-bg)_55%,transparent)] px-4 py-6 backdrop-blur-md"
              onClick={() => setSettingsOpen(false)}
            >
              <div
                className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[var(--theme-border2)] bg-[var(--theme-card)] p-5 shadow-[0_24px_80px_var(--theme-shadow)] sm:p-6"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Mission Defaults</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--theme-text)]">Conductor settings</h2>
                    <p className="mt-2 text-sm text-[var(--theme-muted-2)]">Set the models and defaults every new mission should inherit.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(false)}
                    className="inline-flex size-10 items-center justify-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] text-lg text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]"
                    aria-label="Close settings"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-6 space-y-4">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--theme-text)]">Orchestrator Model</span>
                    <select
                      value={conductor.conductorSettings.orchestratorModel}
                      onChange={(event) => updateSettings({ orchestratorModel: event.target.value })}
                      className="w-full appearance-none rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none transition-colors focus:border-[var(--theme-accent)]"
                    >
                      <option value="">Default (auto)</option>
                      {availableModels.map((m) => (
                        <option key={`orch-${m.id}`} value={m.id ?? ''}>{m.name ?? m.id}{m.provider ? ` (${m.provider})` : ''}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--theme-text)]">Worker Model</span>
                    <select
                      value={conductor.conductorSettings.workerModel}
                      onChange={(event) => updateSettings({ workerModel: event.target.value })}
                      className="w-full appearance-none rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none transition-colors focus:border-[var(--theme-accent)]"
                    >
                      <option value="">Default (auto)</option>
                      {availableModels.map((m) => (
                        <option key={`worker-${m.id}`} value={m.id ?? ''}>{m.name ?? m.id}{m.provider ? ` (${m.provider})` : ''}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--theme-text)]">Project Directory</span>
                    <input
                      type="text"
                      value={conductor.conductorSettings.projectsDir}
                      onChange={(event) => updateSettings({ projectsDir: event.target.value })}
                      placeholder="~/conductor-projects"
                      className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none transition-colors placeholder:text-[var(--theme-muted-2)] focus:border-[var(--theme-accent)]"
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--theme-text)]">Max Parallel Workers</span>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={conductor.conductorSettings.maxParallel}
                      onChange={(event) =>
                        updateSettings({
                          maxParallel: Math.min(5, Math.max(1, Number(event.target.value) || 1)),
                        })
                      }
                      className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none transition-colors focus:border-[var(--theme-accent)]"
                    />
                  </label>

                  <label className="flex items-start gap-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-4">
                    <input
                      type="checkbox"
                      checked={conductor.conductorSettings.supervised}
                      onChange={(event) => updateSettings({ supervised: event.target.checked })}
                      className="mt-1 size-4 rounded border-[var(--theme-border2)] accent-[var(--theme-accent)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[var(--theme-text)]">Supervised Mode</span>
                      <span className="mt-1 block text-sm text-[var(--theme-muted-2)]">Require approval before each task</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    )
  }

  if (phase === 'preview') {
    return (
      <div className="flex min-h-dvh flex-col bg-[var(--theme-bg)] text-[var(--theme-text)]" style={THEME_STYLE}>
        <main className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col items-stretch justify-center px-4 py-4 pb-[calc(var(--tabbar-h,80px)+1rem)] md:px-6 md:py-8">
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-accent)]">Mission Decomposition</p>
              <h1 className="text-2xl font-semibold tracking-tight">{conductor.goal}</h1>
              <p className="text-sm text-[var(--theme-muted-2)]">
                The agent is breaking the mission into workers. Once they spawn, this view flips into the active board.
              </p>
            </div>

            <section className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--theme-border)] pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Mission Planning</p>
                  <p className="mt-1 text-xs text-[var(--theme-muted-2)]">Analyzing your request and preparing agents</p>
                </div>
                <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300 animate-pulse">
                  Working
                </span>
              </div>
              <div className="mt-4 min-h-[200px] overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-5 py-4">
                {conductor.planText ? (
                  <div className="space-y-4">
                    <Markdown className="max-h-[500px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">
                      {conductor.planText.replace(/(.{20,}?)\1+/g, '$1')}
                    </Markdown>
                    <PlanningIndicator />
                  </div>
                ) : (
                  <PlanningIndicator />
                )}
              </div>
              {conductor.streamError && (
                <div className="mt-4 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-600">
                  {conductor.streamError}
                </div>
              )}
              {conductor.timeoutWarning && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-5 py-3">
                  <p className="text-sm text-amber-700">⚠️ Planning is taking longer than expected...</p>
                  <Button
                    type="button"
                    onClick={handleNewMission}
                    className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
                  >
                    Cancel
                  </Button>
                </div>
              )}
              {conductor.tasks.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">
                    Identified Tasks ({conductor.tasks.length})
                  </p>
                  {conductor.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2 text-sm"
                    >
                      <span className="size-2 rounded-full bg-zinc-500" />
                      <span className="text-[var(--theme-text)]">{task.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    )
  }

  if (phase === 'complete') {
    return (
      <div className="flex min-h-dvh flex-col bg-[var(--theme-bg)] text-[var(--theme-text)]" style={THEME_STYLE}>
        <main className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col justify-center px-4 py-4 pb-[calc(var(--tabbar-h,80px)+1rem)] md:px-6 md:py-8">
          <div className="space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-muted)]">
                Conductor
                <span className="size-2 rounded-full bg-emerald-400" />
              </div>
            </div>
            {conductor.streamError && (
              <div className="rounded-2xl border border-[var(--theme-danger-border)] bg-[var(--theme-danger-soft)] px-5 py-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="pt-0.5 text-[var(--theme-danger)]">❌</span>
                    <div>
                      <p className="text-sm font-semibold text-[var(--theme-danger)]">Mission failed</p>
                      <p className="mt-1 text-sm text-[var(--theme-danger)]/90">{conductor.streamError}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      onClick={() => void conductor.retryMission()}
                      className="rounded-xl border border-[var(--theme-danger-border)] bg-[var(--theme-danger-soft)] px-4 text-[var(--theme-danger)] hover:bg-[var(--theme-danger-soft-strong)]"
                    >
                      Retry Mission
                    </Button>
                    <Button
                      type="button"
                      onClick={handleNewMission}
                      className="rounded-xl bg-[var(--theme-accent)] px-4 text-white hover:bg-[var(--theme-accent-strong)]"
                    >
                      New Mission
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className={cn('text-xs font-semibold uppercase tracking-[0.24em]', conductor.streamError ? 'text-red-400' : 'text-[var(--theme-accent)]')}>
                    {conductor.streamError ? 'Mission Stopped' : 'Mission Complete'}
                  </p>
                  <h1 className="mt-2 text-xl font-semibold tracking-tight text-[var(--theme-text)] sm:text-2xl">{conductor.goal}</h1>
                  <p className="mt-2 text-xs text-[var(--theme-muted-2)]">
                    {completedWorkers}/{Math.max(totalWorkers, completedWorkers)} workers finished · {formatElapsedTime(conductor.missionStartedAt, conductor.completedAt ? new Date(conductor.completedAt).getTime() : now)} total elapsed
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={handleNewMission}
                    className="rounded-xl bg-[var(--theme-accent)] px-5 text-white hover:bg-[var(--theme-accent-strong)]"
                  >
                    New Mission
                  </Button>
                </div>
              </div>
            </div>

            {completePhaseProjectPath && previewReady.data === true ? (
              <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Output Preview</p>
                    <p className="mt-1 text-xs text-[var(--theme-muted-2)]">
                      {completePhaseProjectPath.split('/').pop() || 'index.html'}
                    </p>
                  </div>
                  <a
                    href={previewUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent)]"
                  >
                    Open in new tab ↗
                  </a>
                </div>
                <div className="mt-4 overflow-auto rounded-2xl border border-[var(--theme-border)] bg-white">
                  <iframe
                    src={previewUrl!}
                    className="h-[500px] w-full"
                    sandbox="allow-scripts allow-same-origin"
                    title="Mission output preview"
                  />
                </div>
              </section>
            ) : (completePhaseProjectPath || Object.keys(conductor.workerOutputs).length === 0) && !conductor.streamError ? (
              <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
                <div className="flex items-center gap-3 text-sm text-[var(--theme-muted)]">
                  <div className="size-4 animate-spin rounded-full border-2 border-[var(--theme-border)] border-t-[var(--theme-accent)]" />
                  Loading output preview…
                </div>
              </section>
            ) : null}

            {conductor.tasks.length > 1 && completedTaskOutputs.length > 0 && (
              <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Task Outputs</p>
                    <p className="mt-1 text-xs text-[var(--theme-muted-2)]">Per-task output snapshots from completed workers.</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {completedTaskOutputs.map((task) => (
                    <div
                      key={task.id}
                      className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-emerald-400" />
                            <p className="truncate text-sm font-medium text-[var(--theme-text)]">{task.title}</p>
                          </div>
                        </div>
                        {task.previewUrl && (
                          <a
                            href={task.previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent)]"
                          >
                            Preview
                          </a>
                        )}
                      </div>
                      <p className="mt-3 text-sm text-[var(--theme-muted)]">
                        {task.previewText}
                        {(task.output ?? '').trim().length > 200 ? '…' : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Agent Summary</p>
                </div>
                <span className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium',
                  conductor.streamError
                    ? 'border border-red-400/35 bg-red-500/10 text-red-300'
                    : 'border border-emerald-400/35 bg-emerald-500/10 text-emerald-300',
                )}>
                  {conductor.streamError ? 'Stopped' : 'Complete'}
                </span>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-5 py-4">
                {completeSummary ? (
                  <Markdown className="max-h-[400px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">{completeSummary}</Markdown>
                ) : conductor.streamText ? (
                  <Markdown className="max-h-[400px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">{conductor.streamText}</Markdown>
                ) : (
                  <p className="text-sm text-[var(--theme-muted)]">No summary captured.</p>
                )}
              </div>
              {conductor.workers.length > 0 && (
                <div className="mt-4 space-y-2">
                  {conductor.workers.map((worker, index) => {
                    const persona = getAgentPersona(index)
                    const shortModelName = getShortModelName(worker.model)
                    return (
                      <div key={worker.key} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm">
                        <span className="size-2 rounded-full bg-emerald-400" />
                        <span className="font-medium text-[var(--theme-text)]">{persona.emoji} {persona.name}</span>
                        <span className="text-[var(--theme-muted)]">{worker.label}</span>
                        <span className="ml-auto text-xs text-[var(--theme-muted)]">{shortModelName} · {worker.totalTokens.toLocaleString()} tok</span>
                      </div>
                    )
                  })}
                </div>
              )}
              {(totalTokens > 0 || completeMissionCostWorkers.length > 0) && (
                <div className="mt-4">
                  <MissionCostSection
                    totalTokens={totalTokens}
                    workers={completeMissionCostWorkers}
                    expanded={completeCostExpanded}
                    onToggle={() => setCompleteCostExpanded((current) => !current)}
                  />
                </div>
              )}
              {conductor.streamText && completeSummary && (
                <details className="mt-4 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-5 py-4">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--theme-muted)]">Raw Agent Output</summary>
                  <div className="mt-4 border-t border-[var(--theme-border)] pt-4">
                    <Markdown className="max-h-[400px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">{conductor.streamText}</Markdown>
                  </div>
                </details>
              )}
            </section>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--theme-bg)] text-[var(--theme-text)]" style={THEME_STYLE}>
      <main className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col justify-center px-4 py-4 pb-[calc(var(--tabbar-h,80px)+1rem)] md:px-6 md:py-8">
        <div className="flex w-full flex-col gap-6">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-muted)]">
              Conductor
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>
          <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-5 py-5 shadow-[0_24px_80px_var(--theme-shadow)]">
            <div className="text-center">
              <h1 className="line-clamp-2 text-xl font-semibold tracking-tight text-[var(--theme-text)] sm:text-2xl">{conductor.goal}</h1>
              <div className="mt-2 flex items-center justify-center gap-2 text-xs text-[var(--theme-muted)]">
                <span>{formatElapsedTime(conductor.missionStartedAt, now)}</span>
                <span className="text-[var(--theme-border)]">·</span>
                <span>{completedWorkers}/{Math.max(totalWorkers, 1)} complete</span>
                <span className="text-[var(--theme-border)]">·</span>
                <span>{activeWorkerCount} active</span>
              </div>
            </div>
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-[var(--theme-border)]">
              <div className="h-full rounded-full bg-[var(--theme-accent)] transition-[width] duration-500 ease-out" style={{ width: `${missionProgress}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => void conductor.stopMission()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--theme-danger-border, color-mix(in srgb, var(--theme-danger) 35%, white))] bg-[var(--theme-danger-soft, color-mix(in srgb, var(--theme-danger) 12%, transparent))] px-3 py-1.5 text-xs font-medium text-[var(--theme-danger)] transition-colors hover:bg-[var(--theme-danger-soft-strong, color-mix(in srgb, var(--theme-danger) 18%, transparent))]"
              >
                <span>■</span> Stop Mission
              </button>
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-muted)] opacity-50"
              >
                <span>⏸</span> Pause
              </button>
              <button
                type="button"
                onClick={focusSteerInput}
                disabled={!conductor.orchestratorSessionKey}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  conductor.orchestratorSessionKey
                    ? 'border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-muted)] hover:border-[var(--theme-accent)] hover:text-[var(--theme-text)]'
                    : 'cursor-not-allowed border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-muted)] opacity-50',
                )}
              >
                <span>💬</span> Steer
              </button>
            </div>
          </section>
          {conductor.timeoutWarning && (
            <section className="rounded-2xl border border-[var(--theme-warning-border)] bg-[var(--theme-warning-soft)] px-5 py-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--theme-warning)]">⏳ Mission appears stalled — no activity for 60 seconds</p>
                  <p className="mt-1 text-xs text-[var(--theme-muted)]">Sometimes the workers are still alive, but the stream went quiet. Your call.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    onClick={conductor.dismissTimeoutWarning}
                    className="rounded-xl border border-[var(--theme-warning-border)] bg-[var(--theme-card)] px-4 text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
                  >
                    Keep Waiting
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void conductor.stopMission()}
                    className="rounded-xl border border-[var(--theme-warning-border)] bg-[var(--theme-warning-soft)] px-4 text-[var(--theme-warning)] hover:bg-[var(--theme-warning-soft-strong)]"
                  >
                    Stop Mission
                  </Button>
                </div>
              </div>
            </section>
          )}
          <section className="h-[360px] overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-[0_24px_80px_var(--theme-shadow)]">
            <OfficeView
              agentRows={officeAgentRows}
              missionRunning
              onViewOutput={() => {}}
              processType="parallel"
              companyName="Conductor Office"
              containerHeight={360}
              hideHeader
            />
          </section>

          {conductor.tasks.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <div className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">
                  Tasks ({conductor.tasks.filter((task) => task.status === 'complete').length}/{conductor.tasks.length})
                </h2>
                {conductor.tasks.map((task) => {
                  const isSelected = selectedTaskId === task.id
                  const statusDot =
                    task.status === 'complete'
                      ? 'bg-emerald-400'
                      : task.status === 'running'
                        ? 'bg-sky-400 animate-pulse'
                        : task.status === 'failed'
                          ? 'bg-red-400'
                          : 'bg-zinc-500'
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setSelectedTaskId(isSelected ? null : task.id)}
                      className={cn(
                        'w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                        isSelected
                          ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)]'
                          : 'border-[var(--theme-border)] bg-[var(--theme-card)] hover:border-[var(--theme-accent)]',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn('size-2 shrink-0 rounded-full', statusDot)} />
                        <span className="min-w-0 truncate font-medium text-[var(--theme-text)]">{task.title}</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="space-y-3">
                {selectedTaskId ? (
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">Task Output</h2>
                  </div>
                ) : null}
                {(() => {
                  const selectedTask = selectedTaskId ? conductor.tasks.find((task) => task.id === selectedTaskId) : null
                  const displayWorkers = selectedTask?.workerKey
                    ? conductor.workers.filter((worker) => worker.key === selectedTask.workerKey)
                    : conductor.workers
                  return (
                    <div className="grid gap-3 md:grid-cols-2">
                      {displayWorkers.map((worker, index) => {
                        const dot = getWorkerDot(worker.status)
                        const persona = getAgentPersona(index)
                        const workerOutput =
                          conductor.workerOutputs[worker.key] ?? getLastAssistantMessage(worker.raw.messages as HistoryMessage[] | undefined)
                        const workerStartedAt =
                          typeof worker.raw.createdAt === 'string'
                            ? worker.raw.createdAt
                            : typeof worker.raw.startedAt === 'string'
                              ? worker.raw.startedAt
                              : conductor.missionStartedAt
                        const workerEndTime =
                          worker.status === 'complete' || worker.status === 'stale'
                            ? new Date(worker.updatedAt ?? new Date().toISOString()).getTime()
                            : now
                        return (
                          <div
                            key={worker.key}
                            className={cn(
                              'overflow-hidden rounded-2xl border border-[var(--theme-border)] border-l-4 bg-[var(--theme-card)] px-4 py-3',
                              getWorkerBorderClass(worker.status),
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={cn('size-2.5 rounded-full', dot.dotClass)} />
                                  <p className="truncate text-sm font-medium text-[var(--theme-text)]">
                                    {persona.emoji} {persona.name} <span className="text-[var(--theme-muted)]">·</span> {worker.label}
                                  </p>
                                </div>
                                <p className="mt-1 text-xs text-[var(--theme-muted-2)]">{worker.displayName}</p>
                              </div>
                              <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
                                {dot.label}
                              </span>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2">
                                <p className="text-[var(--theme-muted)]">Model</p>
                                <p className="mt-1 truncate text-[var(--theme-text)]">{getShortModelName(worker.model)}</p>
                              </div>
                              <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2">
                                <p className="text-[var(--theme-muted)]">Tokens</p>
                                <p className="mt-1 text-[var(--theme-text)]">{worker.tokenUsageLabel}</p>
                              </div>
                              <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2">
                                <p className="text-[var(--theme-muted)]">Elapsed</p>
                                <p className="mt-1 text-[var(--theme-text)]">{formatElapsedTime(workerStartedAt, workerEndTime)}</p>
                              </div>
                              <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2">
                                <p className="text-[var(--theme-muted)]">Last update</p>
                                <p className="mt-1 text-[var(--theme-text)]">{formatRelativeTime(worker.updatedAt, now)}</p>
                              </div>
                            </div>

                            <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-4">
                              {workerOutput ? (
                                <Markdown className="max-h-[400px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">{workerOutput}</Markdown>
                              ) : (
                                <CyclingStatus steps={WORKING_STEPS} intervalMs={3500} />
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {displayWorkers.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-8 text-center text-sm text-[var(--theme-muted)] md:col-span-2">
                          <div className="flex items-center justify-center gap-3">
                            <div className="size-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
                            <span>Spawning workers…</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                {conductor.workers.map((worker, index) => {
                  const dot = getWorkerDot(worker.status)
                  const persona = getAgentPersona(index)
                  const workerOutput = conductor.workerOutputs[worker.key] ?? getLastAssistantMessage(worker.raw.messages as HistoryMessage[] | undefined)
                  const workerStartedAt =
                    typeof worker.raw.createdAt === 'string'
                      ? worker.raw.createdAt
                      : typeof worker.raw.startedAt === 'string'
                        ? worker.raw.startedAt
                        : conductor.missionStartedAt
                  const workerEndTime =
                    worker.status === 'complete' || worker.status === 'stale'
                      ? new Date(worker.updatedAt ?? new Date().toISOString()).getTime()
                      : now
                  return (
                    <div
                      key={worker.key}
                      className={cn(
                        'overflow-hidden rounded-2xl border border-[var(--theme-border)] border-l-4 bg-[var(--theme-card)] px-4 py-3',
                        getWorkerBorderClass(worker.status),
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn('size-2.5 rounded-full', dot.dotClass)} />
                            <p className="truncate text-sm font-medium text-[var(--theme-text)]">
                              {persona.emoji} {persona.name} <span className="text-[var(--theme-muted)]">·</span> {worker.label}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-[var(--theme-muted-2)]">{worker.displayName}</p>
                        </div>
                        <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
                          {dot.label}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2">
                          <p className="text-[var(--theme-muted)]">Model</p>
                          <p className="mt-1 truncate text-[var(--theme-text)]">{getShortModelName(worker.model)}</p>
                        </div>
                        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2">
                          <p className="text-[var(--theme-muted)]">Tokens</p>
                          <p className="mt-1 text-[var(--theme-text)]">{worker.tokenUsageLabel}</p>
                        </div>
                        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2">
                          <p className="text-[var(--theme-muted)]">Elapsed</p>
                          <p className="mt-1 text-[var(--theme-text)]">{formatElapsedTime(workerStartedAt, workerEndTime)}</p>
                        </div>
                        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2">
                          <p className="text-[var(--theme-muted)]">Last update</p>
                          <p className="mt-1 text-[var(--theme-text)]">{formatRelativeTime(worker.updatedAt, now)}</p>
                        </div>
                      </div>

                      <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-4">
                        {workerOutput ? (
                          <Markdown className="max-h-[400px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">{workerOutput}</Markdown>
                        ) : (
                          <CyclingStatus steps={WORKING_STEPS} intervalMs={3500} />
                        )}
                      </div>
                    </div>
                  )
                })}
                {conductor.workers.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-8 text-center text-sm text-[var(--theme-muted)] md:col-span-2">
                    <div className="flex items-center justify-center gap-3">
                      <div className="size-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
                      <span>Spawning workers…</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-5 py-5 shadow-[0_24px_80px_var(--theme-shadow)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Steer</p>
                <p className="mt-1 text-xs text-[var(--theme-muted-2)]">Send live instructions to the orchestrator without restarting the mission.</p>
              </div>
              <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
                {conductor.orchestratorSessionKey ? 'Live' : 'Waiting'}
              </span>
            </div>

            {steerHistory.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {steerHistory.map((message, index) => (
                  <div
                    key={`${steerHistoryTimestamps[index] ?? index}-${message}`}
                    className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-1.5 text-xs text-[var(--theme-muted)]"
                  >
                    <span className="truncate text-[var(--theme-text)]">{message}</span>
                    <span className="shrink-0 text-[var(--theme-muted-2)]">{formatSteerTimestamp(steerHistoryTimestamps[index] ?? Date.now())}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <form
              className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSendSteer()
              }}
            >
              <input
                ref={steerInputRef}
                type="text"
                value={steerDraft}
                onChange={(event) => setSteerDraft(event.target.value)}
                placeholder="Send instructions to the agent..."
                disabled={!conductor.orchestratorSessionKey || conductor.isSendingStream}
                className="min-w-0 flex-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none transition-colors placeholder:text-[var(--theme-muted-2)] focus:border-[var(--theme-accent)] disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!steerDraft.trim() || !conductor.orchestratorSessionKey || conductor.isSendingStream}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium transition-colors sm:min-w-[96px]',
                  !steerDraft.trim() || !conductor.orchestratorSessionKey || conductor.isSendingStream
                    ? 'cursor-not-allowed border border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-muted)] opacity-60'
                    : 'border border-[var(--theme-border)] bg-[var(--theme-accent-soft)] text-[var(--theme-text)] hover:border-[var(--theme-accent)] hover:bg-[var(--theme-accent-soft-strong)]',
                )}
              >
                <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.8} />
                {conductor.isSendingStream ? 'Sending' : 'Send'}
              </button>
            </form>

            {!conductor.orchestratorSessionKey ? (
              <p className="mt-3 text-xs text-[var(--theme-muted)]">Waiting for the orchestrator session before steer messages can be sent.</p>
            ) : null}

            {steerError ? (
              <div className="mt-3 rounded-2xl border border-[var(--theme-danger-border)] bg-[var(--theme-danger-soft)] px-4 py-3 text-xs text-[var(--theme-danger)]">
                {steerError}
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  )
}
