import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchSessions, type GatewaySession } from '@/lib/gateway-api'

type HistoryMessagePart = {
  type?: string
  text?: string
}

type HistoryMessage = {
  role?: string
  content?: string | HistoryMessagePart[]
}

type HistoryResponse = {
  messages?: HistoryMessage[]
  error?: string
}

type MissionPhase = 'idle' | 'decomposing' | 'running' | 'complete'

const ACTIVE_MISSION_STORAGE_KEY = 'conductor:active-mission'

type PersistedMission = {
  goal: string
  phase: MissionPhase
  missionStartedAt: string | null
  workerKeys: string[]
  workerLabels: string[]
  streamText: string
  planText: string
  completedAt: string | null
  tasks: ConductorTask[]
}

type StreamEvent =
  | { type: 'assistant'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool'; name?: string; phase?: string; data?: Record<string, unknown> }
  | { type: 'done'; state?: string; message?: string }
  | { type: 'error'; message: string }
  | { type: 'started'; runId?: string; sessionKey?: string }

export type ConductorWorker = {
  key: string
  label: string
  model: string | null
  status: 'running' | 'complete' | 'stale' | 'idle'
  updatedAt: string | null
  displayName: string
  totalTokens: number
  contextTokens: number
  tokenUsageLabel: string
  raw: GatewaySession
}

export type ConductorTask = {
  id: string
  title: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  workerKey: string | null
  output: string | null
}

export type MissionHistoryEntry = {
  id: string
  goal: string
  startedAt: string
  completedAt: string
  workerCount: number
  totalTokens: number
  status: 'completed' | 'failed'
  projectPath: string | null
}

const HISTORY_STORAGE_KEY = 'conductor:history'
const MAX_HISTORY_ENTRIES = 50

function extractTasksFromPlan(planText: string): ConductorTask[] {
  const tasks: ConductorTask[] = []
  const patterns = [
    /^\s*(\d+)\.\s+(.+)$/gm,
    /^\s*#{1,3}\s+(?:Step\s+)?(\d+)[.:]\s*(.+)$/gm,
    /^\s*-\s+\*\*(?:Task\s+)?(\d+)[.:]\s*\*\*\s*(.+)$/gm,
  ]

  const seen = new Set<string>()
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(planText)) !== null) {
      const num = match[1]
      const title = match[2].replace(/\*\*/g, '').trim()
      const id = `task-${num}`
      if (!seen.has(id) && title.length > 3 && title.length < 200) {
        seen.add(id)
        tasks.push({ id, title, status: 'pending', workerKey: null, output: null })
      }
    }
  }

  tasks.sort((a, b) => {
    const numA = parseInt(a.id.replace('task-', ''), 10)
    const numB = parseInt(b.id.replace('task-', ''), 10)
    return numA - numB
  })

  return tasks
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function toIso(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    const ms = new Date(value).getTime()
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  return null
}

function loadPersistedMission(): PersistedMission | null {
  try {
    const raw = globalThis.localStorage?.getItem(ACTIVE_MISSION_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const goal = typeof parsed.goal === 'string' ? parsed.goal : null
    const phase = parsed.phase
    const streamText = typeof parsed.streamText === 'string' ? parsed.streamText : null
    const planText = typeof parsed.planText === 'string' ? parsed.planText : null
    const workerKeys = Array.isArray(parsed.workerKeys) ? parsed.workerKeys.filter((value): value is string => typeof value === 'string') : null
    const workerLabels = Array.isArray(parsed.workerLabels) ? parsed.workerLabels.filter((value): value is string => typeof value === 'string') : null
    const missionStartedAt =
      parsed.missionStartedAt === null || parsed.missionStartedAt === undefined ? null : toIso(parsed.missionStartedAt)
    const completedAt = parsed.completedAt === null || parsed.completedAt === undefined ? null : toIso(parsed.completedAt)
    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks
          .map((task): ConductorTask | null => {
            const record = readRecord(task)
            if (!record) return null
            const id = readString(record.id)
            const title = readString(record.title)
            const status = record.status
            if (
              !id ||
              !title ||
              (status !== 'pending' && status !== 'running' && status !== 'complete' && status !== 'failed')
            ) {
              return null
            }

            return {
              id,
              title,
              status,
              workerKey: record.workerKey === null || record.workerKey === undefined ? null : readString(record.workerKey),
              output: record.output === null || record.output === undefined ? null : readString(record.output),
            }
          })
          .filter((task): task is ConductorTask => task !== null)
      : []

    if (
      !goal ||
      (phase !== 'decomposing' && phase !== 'running' && phase !== 'complete') ||
      streamText === null ||
      planText === null ||
      !workerKeys ||
      !workerLabels
    ) {
      return null
    }

    return {
      goal,
      phase,
      missionStartedAt,
      workerKeys,
      workerLabels,
      streamText,
      planText,
      completedAt,
      tasks,
    }
  } catch {
    return null
  }
}

function loadMissionHistory(): MissionHistoryEntry[] {
  try {
    const raw = globalThis.localStorage?.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry: unknown): entry is MissionHistoryEntry => {
        if (!entry || typeof entry !== 'object') return false
        const e = entry as Record<string, unknown>
        return typeof e.id === 'string' && typeof e.goal === 'string' && typeof e.startedAt === 'string'
      })
      .slice(0, MAX_HISTORY_ENTRIES)
  } catch {
    return []
  }
}

function appendMissionHistory(entry: MissionHistoryEntry): void {
  try {
    const current = loadMissionHistory()
    const updated = [entry, ...current].slice(0, MAX_HISTORY_ENTRIES)
    globalThis.localStorage?.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // Ignore persistence failures.
  }
}

function persistMission(state: PersistedMission): void {
  try {
    globalThis.localStorage?.setItem(ACTIVE_MISSION_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore persistence failures.
  }
}

function readContextTokens(session: GatewaySession): number {
  return (
    readNumber(session.contextTokens) ??
    readNumber(session.maxTokens) ??
    readNumber(session.contextWindow) ??
    readNumber(session.usage && typeof session.usage === 'object' ? (session.usage as Record<string, unknown>).contextTokens : null) ??
    0
  )
}

function deriveWorkerStatus(session: GatewaySession, updatedAt: string | null): ConductorWorker['status'] {
  const status = readString(session.status)?.toLowerCase()
  if (status && ['complete', 'completed', 'done', 'success', 'succeeded'].includes(status)) return 'complete'
  if (status && ['idle', 'waiting', 'sleeping'].includes(status)) return 'idle'
  if (status && ['error', 'errored', 'failed', 'cancelled', 'canceled', 'killed'].includes(status)) return 'stale'

  const updatedMs = updatedAt ? new Date(updatedAt).getTime() : 0
  const staleness = updatedMs > 0 ? Date.now() - updatedMs : 0
  const totalTokens = readNumber(session.totalTokens) ?? readNumber(session.tokenCount) ?? 0

  if (totalTokens > 0 && staleness > 10_000) return 'complete'
  if (staleness > 120_000) return 'stale'
  return 'running'
}

function workersLookComplete(workers: ConductorWorker[], staleAfterMs: number): boolean {
  if (workers.length === 0) return false

  return workers.every((worker) => {
    if (worker.totalTokens <= 0) return false
    if (!worker.updatedAt) return false
    const updatedMs = new Date(worker.updatedAt).getTime()
    if (!Number.isFinite(updatedMs)) return false
    return Date.now() - updatedMs >= staleAfterMs
  })
}

function formatDisplayName(session: GatewaySession): string {
  const label = readString(session.label)
  if (label) return label.replace(/^worker-/, '').replace(/[-_]+/g, ' ')
  const title = readString(session.title) ?? readString(session.derivedTitle)
  if (title) return title
  const key = readString(session.key) ?? 'worker'
  return key.split(':').pop()?.replace(/[-_]+/g, ' ') ?? key
}

function formatTokenUsage(totalTokens: number, contextTokens: number): string {
  if (contextTokens > 0) return `${totalTokens.toLocaleString()} / ${contextTokens.toLocaleString()} tok`
  return `${totalTokens.toLocaleString()} tok`
}

function toWorker(session: GatewaySession): ConductorWorker | null {
  const key = readString(session.key)
  if (!key) return null
  const label = readString(session.label) ?? 'worker'
  const updatedAt = toIso(session.updatedAt ?? session.startedAt ?? session.createdAt)
  const totalTokens = readNumber(session.totalTokens) ?? readNumber(session.tokenCount) ?? 0
  const contextTokens = readContextTokens(session)

  return {
    key,
    label,
    model: readString(session.model),
    status: deriveWorkerStatus(session, updatedAt),
    updatedAt,
    displayName: formatDisplayName(session),
    totalTokens,
    contextTokens,
    tokenUsageLabel: formatTokenUsage(totalTokens, contextTokens),
    raw: session,
  }
}

function extractWorkerLabels(text: string): string[] {
  const matches = text.match(/worker-[a-z0-9][a-z0-9_-]*/gi) ?? []
  return [...new Set(matches.map((match) => match.trim()))]
}

function extractHistoryMessageText(message: HistoryMessage | undefined): string {
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
    const text = extractHistoryMessageText(message).trim()
    if (text) return text
  }
  return ''
}

async function fetchWorkerOutput(sessionKey: string, limit = 5): Promise<string> {
  const response = await fetch(`/api/history?sessionKey=${encodeURIComponent(sessionKey)}&limit=${limit}`)
  const payload = (await response.json().catch(() => ({}))) as HistoryResponse
  if (!response.ok) {
    throw new Error(payload.error || `Failed to load history for ${sessionKey}`)
  }
  return getLastAssistantMessage(payload.messages)
}

async function readSseStream(response: Response, onEvent: (event: StreamEvent) => void): Promise<void> {
  if (!response.ok) {
    throw new Error((await response.text().catch(() => '')) || `Request failed (${response.status})`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('Streaming response unavailable')

  const decoder = new TextDecoder()
  let buffer = ''

  const flushChunk = (chunk: string) => {
    const blocks = chunk.split('\n\n')
    buffer = blocks.pop() ?? ''

    for (const block of blocks) {
      const lines = block.split(/\r?\n/)
      let eventName = 'message'
      const dataLines: string[] = []

      for (const line of lines) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }

      if (dataLines.length === 0) continue

      const rawData = dataLines.join('\n')
      let payload: Record<string, unknown> = {}
      try {
        payload = JSON.parse(rawData) as Record<string, unknown>
      } catch {
        payload = { text: rawData }
      }

      const stream = readString(payload.stream) ?? eventName
      const nestedData = readRecord(payload.data)
      const eventPayload = nestedData ?? payload

      if (stream === 'assistant') {
        onEvent({ type: 'assistant', text: readString(eventPayload.text) ?? '' })
      } else if (stream === 'thinking') {
        onEvent({ type: 'thinking', text: readString(eventPayload.text) ?? '' })
      } else if (stream === 'tool') {
        onEvent({
          type: 'tool',
          name: readString(eventPayload.name) ?? undefined,
          phase: readString(eventPayload.phase) ?? undefined,
          data: nestedData ?? readRecord(payload.data) ?? undefined,
        })
      } else if (stream === 'done') {
        onEvent({
          type: 'done',
          state: readString(eventPayload.state) ?? undefined,
          message: readString(eventPayload.message) ?? readString(eventPayload.errorMessage) ?? undefined,
        })
      } else if (stream === 'started') {
        onEvent({
          type: 'started',
          runId: readString(eventPayload.runId) ?? undefined,
          sessionKey: readString(eventPayload.sessionKey) ?? undefined,
        })
      } else if (stream === 'error') {
        onEvent({ type: 'error', message: readString(eventPayload.message) ?? 'Stream error' })
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    flushChunk(buffer)
  }

  if (buffer.trim()) {
    flushChunk(`${buffer}\n\n`)
  }
}

export function useConductorGateway() {
  const [initialMission] = useState<PersistedMission | null>(() => loadPersistedMission())
  const [phase, setPhase] = useState<MissionPhase>(() => initialMission?.phase ?? 'idle')
  const [goal, setGoal] = useState(() => initialMission?.goal ?? '')
  const [streamText, setStreamText] = useState(() => initialMission?.streamText ?? '')
  const [planText, setPlanText] = useState(() => initialMission?.planText ?? '')
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([])
  const [missionStartedAt, setMissionStartedAt] = useState<string | null>(() => initialMission?.missionStartedAt ?? null)
  const [completedAt, setCompletedAt] = useState<string | null>(() => initialMission?.completedAt ?? null)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [timeoutWarning, setTimeoutWarning] = useState(false)
  const [missionWorkerKeys, setMissionWorkerKeys] = useState<Set<string>>(() => new Set(initialMission?.workerKeys ?? []))
  const [missionWorkerLabels, setMissionWorkerLabels] = useState<Set<string>>(() => new Set(initialMission?.workerLabels ?? []))
  const [workerOutputs, setWorkerOutputs] = useState<Record<string, string>>({})
  const [tasks, setTasks] = useState<ConductorTask[]>(() => initialMission?.tasks ?? [])
  const [missionHistory, setMissionHistory] = useState<MissionHistoryEntry[]>(() => loadMissionHistory())
  const doneRef = useRef(initialMission?.phase === 'complete')
  const seenToolCallRef = useRef(false)

  const sessionsQuery = useQuery({
    queryKey: ['conductor', 'gateway', 'sessions'],
    queryFn: async () => {
      const payload = await fetchSessions()
      const sessions = Array.isArray(payload.sessions) ? payload.sessions : []
      const missionStartMs = missionStartedAt ? new Date(missionStartedAt).getTime() : 0
      return sessions
        .filter((session) => {
          const label = readString(session.label) ?? ''
          const key = readString(session.key) ?? ''
          if (!label.startsWith('worker-') && !key.includes(':subagent:')) return false

          if (missionWorkerKeys.size > 0) {
            return missionWorkerKeys.has(key)
          }

          if (missionWorkerLabels.size > 0 && missionWorkerLabels.has(label)) {
            return true
          }

          const createdIso = toIso(session.createdAt ?? session.startedAt ?? session.updatedAt)
          if (!createdIso || !missionStartMs) return false
          return new Date(createdIso).getTime() >= missionStartMs
        })
        .map(toWorker)
        .filter((session): session is ConductorWorker => session !== null)
        .sort((a, b) => {
          const statusRank = { running: 0, idle: 1, complete: 2, stale: 3 }
          const rankDiff = statusRank[a.status] - statusRank[b.status]
          if (rankDiff !== 0) return rankDiff
          return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
        })
    },
    enabled: phase !== 'idle',
    refetchInterval: phase === 'decomposing' || phase === 'running' || (phase === 'complete' && Object.keys(workerOutputs).length === 0) ? 3_000 : false,
  })

  const recentSessionsQuery = useQuery({
    queryKey: ['conductor', 'recent-sessions'],
    queryFn: async () => {
      const payload = await fetchSessions()
      const sessions = Array.isArray(payload.sessions) ? payload.sessions : []
      const cutoff = Date.now() - 24 * 60 * 60_000
      return sessions
        .filter((session) => {
          const label = readString(session.label) ?? ''
          const key = readString(session.key) ?? ''
          const updatedAt = toIso(session.updatedAt ?? session.startedAt ?? session.createdAt)
          if (!updatedAt) return false
          return (label.startsWith('worker-') || key.includes(':subagent:')) && new Date(updatedAt).getTime() >= cutoff
        })
        .sort((a, b) => {
          const updatedA = new Date(toIso(a.updatedAt ?? a.startedAt ?? a.createdAt) ?? 0).getTime()
          const updatedB = new Date(toIso(b.updatedAt ?? b.startedAt ?? b.createdAt) ?? 0).getTime()
          return updatedB - updatedA
        })
        .slice(0, 20)
    },
    enabled: phase === 'idle',
    refetchInterval: false,
  })

  const workers = sessionsQuery.data ?? []
  const activeWorkers = useMemo(
    () => workers.filter((worker) => worker.status === 'running' || worker.status === 'idle'),
    [workers],
  )

  useEffect(() => {
    if (missionWorkerLabels.size === 0 || workers.length === 0) return
    const matchedKeys = workers
      .filter((worker) => missionWorkerLabels.has(worker.label))
      .map((worker) => worker.key)

    if (matchedKeys.length === 0) return

    setMissionWorkerKeys((current) => {
      const next = new Set(current)
      let changed = false
      for (const key of matchedKeys) {
        if (!next.has(key)) {
          next.add(key)
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [missionWorkerLabels, workers])

  useEffect(() => {
    if (phase !== 'decomposing') return

    if (workers.length > 0) {
      setPhase('running')
      return
    }

    const timer = setTimeout(() => {
      if (phase === 'decomposing') {
        setPhase('running')
      }
    }, 15_000)

    return () => clearTimeout(timer)
  }, [phase, workers.length])

  useEffect(() => {
    if (phase !== 'running' && phase !== 'decomposing') {
      setTimeoutWarning(false)
      return
    }

    const timer = window.setTimeout(() => {
      if (workers.length === 0 && phase === 'running') {
        setTimeoutWarning(true)
      }
      if (phase === 'decomposing' && !streamText) {
        setTimeoutWarning(true)
      }
    }, 60_000)

    return () => window.clearTimeout(timer)
  }, [phase, workers.length, streamText])

  useEffect(() => {
    if (phase !== 'running') return

    const shouldCompleteImmediately = doneRef.current && workersLookComplete(workers, 8_000)
    if (shouldCompleteImmediately) {
      setPhase('complete')
      setCompletedAt((value) => value ?? new Date().toISOString())
      return
    }

    if (activeWorkers.length > 0) return
    if (workers.length === 0 && !doneRef.current) return
    setPhase('complete')
    setCompletedAt((value) => value ?? new Date().toISOString())
  }, [activeWorkers.length, phase, workers])

  useEffect(() => {
    if (workers.length === 0) return

    let cancelled = false

    const fetchAll = async () => {
      for (const worker of workers) {
        if (worker.totalTokens <= 0) continue
        try {
          const output = await fetchWorkerOutput(worker.key, 5)
          if (cancelled || !output) continue
          setWorkerOutputs((current) => {
            if (current[worker.key] === output) return current
            return { ...current, [worker.key]: output }
          })
        } catch {
          // Ignore transient history fetch errors and retry on the next poll.
        }
      }
    }

    void fetchAll()

    const hasRunningWorkers = workers.some((worker) => worker.status === 'running' || worker.status === 'idle')
    if (!hasRunningWorkers) {
      return () => {
        cancelled = true
      }
    }

    const timer = window.setInterval(() => {
      void fetchAll()
    }, 5_000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [phase, workers])

  useEffect(() => {
    if (!planText) return
    const extracted = extractTasksFromPlan(planText)
    if (extracted.length === 0) return
    setTasks((current) => {
      if (current.length >= extracted.length) return current
      return extracted.map((task) => {
        const existing = current.find((item) => item.id === task.id)
        return existing ?? task
      })
    })
  }, [planText])

  useEffect(() => {
    if (tasks.length === 0 || workers.length === 0) return
    setTasks((current) => {
      const updated = current.map((task, index) => {
        const worker = workers[index]
        if (!worker) return task
        const workerOutput = workerOutputs[worker.key] ?? null
        const newStatus: ConductorTask['status'] =
          worker.status === 'complete'
            ? 'complete'
            : worker.status === 'stale'
              ? 'failed'
              : worker.status === 'running'
                ? 'running'
                : task.status
        if (task.workerKey === worker.key && task.status === newStatus && task.output === workerOutput) return task
        return { ...task, workerKey: worker.key, status: newStatus, output: workerOutput }
      })
      const changed = updated.some((task, index) => task !== current[index])
      return changed ? updated : current
    })
  }, [workers, workerOutputs, tasks.length])

  useEffect(() => {
    if (phase !== 'complete' || !goal || !completedAt || !missionStartedAt) return
    const missionId = `mission-${new Date(missionStartedAt).getTime()}`
    setMissionHistory((current) => {
      if (current.some((entry) => entry.id === missionId)) return current
      const entry: MissionHistoryEntry = {
        id: missionId,
        goal,
        startedAt: missionStartedAt,
        completedAt,
        workerCount: workers.length,
        totalTokens: workers.reduce((sum, worker) => sum + worker.totalTokens, 0),
        status: streamError ? 'failed' : 'completed',
        projectPath: null,
      }
      appendMissionHistory(entry)
      return [entry, ...current].slice(0, MAX_HISTORY_ENTRIES)
    })
  }, [phase, goal, completedAt, missionStartedAt, workers, streamError])

  useEffect(() => {
    if (phase === 'idle') {
      try {
        localStorage.removeItem(ACTIVE_MISSION_STORAGE_KEY)
      } catch {}
      return
    }

    persistMission({
      goal,
      phase,
      missionStartedAt,
      workerKeys: [...missionWorkerKeys],
      workerLabels: [...missionWorkerLabels],
      streamText: streamText.slice(0, 10_000),
      planText: planText.slice(0, 10_000),
      completedAt,
      tasks,
    })
  }, [phase, goal, missionStartedAt, completedAt, missionWorkerKeys, missionWorkerLabels, streamText, planText, tasks])

  const sendMission = useMutation({
    mutationFn: async (nextGoal: string) => {
      const trimmed = nextGoal.trim()
      if (!trimmed) throw new Error('Mission goal required')
      doneRef.current = false
      setTimeoutWarning(false)
      setGoal(trimmed)
      setStreamText('')
      setPlanText('')
      setStreamEvents([])
      setStreamError(null)
      setCompletedAt(null)
      setMissionWorkerKeys(new Set())
      setMissionWorkerLabels(new Set())
      setWorkerOutputs({})
      setTasks([])
      seenToolCallRef.current = false
      setMissionStartedAt(new Date().toISOString())
      setPhase('decomposing')

      const response = await fetch('/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'agent:main:main',
          message: `[DISPATCH] Read the workspace-dispatch skill at skills/workspace-dispatch/SKILL.md (relative to the ClawSuite project root) and execute this mission autonomously. Use sessions_spawn to create worker agents for each task. Do not ask for confirmation — start immediately.\n\nMission goal: ${trimmed}`,
        }),
      })

      await readSseStream(response, (event) => {
        setStreamEvents((current) => [...current, event])
        if (event.type === 'assistant') {
          setStreamText((current) => current + event.text)

          if (!seenToolCallRef.current) {
            setPlanText((current) => current + event.text)
          }

          const labels = extractWorkerLabels(event.text)
          if (labels.length > 0) {
            setMissionWorkerLabels((current) => {
              const next = new Set(current)
              let changed = false
              for (const label of labels) {
                if (!next.has(label)) {
                  next.add(label)
                  changed = true
                }
              }
              return changed ? next : current
            })
          }
        }
        if (event.type === 'tool') {
          seenToolCallRef.current = true
          setPhase((current) => (current === 'decomposing' ? 'running' : current))
        }
        if (event.type === 'tool' && event.name === 'sessions_spawn' && event.phase === 'result') {
          const childSessionKey = readString(event.data?.childSessionKey)
          if (childSessionKey) {
            setMissionWorkerKeys((current) => {
              if (current.has(childSessionKey)) return current
              const next = new Set(current)
              next.add(childSessionKey)
              return next
            })
          }
        }
        if (event.type === 'error') {
          doneRef.current = true
          setStreamError(event.message)
          setPhase('complete')
          setCompletedAt(new Date().toISOString())
        }
        if (event.type === 'done') {
          doneRef.current = true
          setCompletedAt(new Date().toISOString())
        }
      })
    },
    onError: (error) => {
      doneRef.current = true
      setStreamError(error instanceof Error ? error.message : String(error))
      setPhase('complete')
      setCompletedAt(new Date().toISOString())
    },
  })

  const resetMission = () => {
    doneRef.current = false
    try {
      localStorage.removeItem(ACTIVE_MISSION_STORAGE_KEY)
    } catch {}
    setPhase('idle')
    setGoal('')
    setStreamText('')
    setPlanText('')
    setStreamEvents([])
    setStreamError(null)
    setTimeoutWarning(false)
    setMissionStartedAt(null)
    setCompletedAt(null)
    setMissionWorkerKeys(new Set())
    setMissionWorkerLabels(new Set())
    setWorkerOutputs({})
    setTasks([])
    seenToolCallRef.current = false
  }

  const retryMission = async () => {
    if (!goal) return
    const currentGoal = goal
    resetMission()
    await new Promise((resolve) => setTimeout(resolve, 100))
    await sendMission.mutateAsync(currentGoal)
  }

  return {
    phase,
    goal,
    streamText,
    planText,
    streamEvents,
    streamError,
    timeoutWarning,
    missionStartedAt,
    completedAt,
    tasks,
    workers,
    activeWorkers,
    missionHistory,
    recentSessions: recentSessionsQuery.data ?? [],
    missionWorkerKeys,
    workerOutputs,
    sendMission: sendMission.mutateAsync,
    isSending: sendMission.isPending,
    resetMission,
    retryMission,
    refreshWorkers: sessionsQuery.refetch,
    isRefreshingWorkers: sessionsQuery.isFetching,
  }
}
