import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/toast'

const DAEMON_URL = ''
const RECONNECT_DELAY_MS = 3_000
const EVENTS_URL = DAEMON_URL ? `${DAEMON_URL}/api/workspace/events` : '/api/workspace/events'
export const WORKSPACE_SSE_EVENT_NAME = 'workspace-sse'

type QueryKey = Array<string>
export type WorkspaceSseEvent = {
  type: string
  payload: Record<string, unknown> | null
}

function invalidateQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  keys: Array<QueryKey>,
) {
  for (const key of keys) {
    void queryClient.invalidateQueries({ queryKey: key })
  }
}

function parseSseData(event: MessageEvent<string>): Record<string, unknown> | null {
  if (!event.data) return null

  try {
    const parsed = JSON.parse(event.data) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function parseOutputPayload(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      return parsed as Record<string, unknown>
    } catch {
      return value.trim() ? { message: value } : null
    }
  }
  if (typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function getOutputLines(payload: Record<string, unknown>): string[] {
  const data = parseOutputPayload(payload.data)
  const candidates = [
    typeof data?.message === 'string' ? data.message : null,
    typeof data?.summary === 'string' ? data.summary : null,
    typeof payload.message === 'string' ? payload.message : null,
  ]

  const text = candidates.find((value) => typeof value === 'string' && value.trim().length > 0)
  if (!text) return []

  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function emitWorkspaceSseEvent(type: string, payload: Record<string, unknown> | null) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<WorkspaceSseEvent>(WORKSPACE_SSE_EVENT_NAME, {
      detail: { type, payload },
    }),
  )
}

export function useWorkspaceSse(options?: { silent?: boolean }) {
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)
  const hasConnectedRef = useRef(false)
  const disconnectToastShownRef = useRef(false)
  const silent = options?.silent === true

  useEffect(() => {
    let eventSource: EventSource | null = null
    let reconnectTimer: number | null = null
    let disposed = false

    function clearReconnectTimer() {
      if (reconnectTimer === null) return
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    function scheduleReconnect() {
      if (disposed || reconnectTimer !== null) return
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        if (!disposed) connect()
      }, RECONNECT_DELAY_MS)
    }

    function connect() {
      clearReconnectTimer()
      eventSource?.close()
      setConnected(false)

      const es = new EventSource(EVENTS_URL)
      eventSource = es

      es.onopen = () => {
        if (disposed) return
        if (!silent && hasConnectedRef.current && disconnectToastShownRef.current) {
          toast('Workspace daemon reconnected', { type: 'success' })
        }
        hasConnectedRef.current = true
        disconnectToastShownRef.current = false
        setConnected(true)
      }

      es.addEventListener('task_run.started', (event) => {
        const payload = parseSseData(event)
        emitWorkspaceSseEvent('task_run.started', payload)
        const runId =
          typeof payload?.task_run_id === 'string' ? payload.task_run_id : null
        if (runId) {
          queryClient.setQueryData(['workspace', 'task-run-live-output', runId], [])
        }

        invalidateQueries(queryClient, [
          ['workspace', 'task-runs'],
          ['workspace', 'missions'],
          ['workspace', 'mission-console'],
          ['workspace', 'projects'],
          ['workspace', 'project-snapshots'],
          ['workspace', 'stats'],
          ['workspace', 'home', 'missions'],
          ['workspace', 'home', 'task-runs'],
        ])
      })

      es.addEventListener('task_run.updated', () => {
        emitWorkspaceSseEvent('task_run.updated', null)
        invalidateQueries(queryClient, [
          ['workspace', 'task-runs'],
          ['workspace', 'mission-console'],
          ['workspace', 'home', 'task-runs'],
        ])
      })

      es.addEventListener('task_run.output', (event) => {
        const payload = parseSseData(event)
        emitWorkspaceSseEvent('task_run.output', payload)
        const runId =
          typeof payload?.task_run_id === 'string' ? payload.task_run_id : null
        if (!runId) return

        const nextLines = payload ? getOutputLines(payload) : []
        if (nextLines.length > 0) {
          queryClient.setQueryData<Array<string>>(
            ['workspace', 'task-run-live-output', runId],
            (current) => [...(current ?? []), ...nextLines].slice(-12),
          )
        }

        invalidateQueries(queryClient, [
          ['workspace', 'task-runs', runId, 'events'],
          ['workspace', 'home', 'task-runs'],
        ])
      })

      es.addEventListener('task_run.completed', (event) => {
        const payload = parseSseData(event)
        emitWorkspaceSseEvent('task_run.completed', payload)
        invalidateQueries(queryClient, [
          ['workspace', 'task-runs'],
          ['workspace', 'missions'],
          ['workspace', 'mission-console'],
          ['workspace', 'checkpoints'],
          ['workspace', 'projects'],
          ['workspace', 'project-snapshots'],
          ['workspace', 'layout', 'project-detail'],
          ['workspace', 'stats'],
          ['workspace', 'events'],
          ['workspace', 'home', 'missions'],
          ['workspace', 'home', 'task-runs'],
        ])

        const taskName =
          typeof payload?.task_name === 'string' && payload.task_name.trim().length > 0
            ? payload.task_name.trim()
            : 'Task'
        const status = payload?.status

        if (status === 'completed' || status === 'awaiting_review') {
          const message =
            status === 'awaiting_review'
              ? `✅ ${taskName} ready for review`
              : `✅ ${taskName} completed — ready for review`
          toast(message, {
            type: 'success',
            icon: '✅',
          })
          return
        }

        if (status === 'failed') {
          toast(`❌ ${taskName} failed`, {
            type: 'error',
            icon: '❌',
          })
        }
      })

      es.addEventListener('checkpoint.created', (event) => {
        emitWorkspaceSseEvent('checkpoint.created', parseSseData(event))
        invalidateQueries(queryClient, [
          ['workspace', 'checkpoints'],
          ['workspace', 'projects'],
          ['workspace', 'project-detail'],
          ['workspace', 'layout', 'project-detail'],
        ])
      })

      es.addEventListener('checkpoint.updated', (event) => {
        emitWorkspaceSseEvent('checkpoint.updated', parseSseData(event))
        invalidateQueries(queryClient, [
          ['workspace', 'checkpoints'],
          ['workspace', 'projects'],
          ['workspace', 'project-detail'],
          ['workspace', 'layout', 'project-detail'],
        ])
      })

      es.addEventListener('mission.updated', (event) => {
        emitWorkspaceSseEvent('mission.updated', parseSseData(event))
        invalidateQueries(queryClient, [
          ['workspace', 'missions'],
          ['workspace', 'mission-console'],
          ['workspace', 'projects'],
          ['workspace', 'project-snapshots'],
          ['workspace', 'layout', 'project-detail'],
          ['workspace', 'stats'],
          ['workspace', 'home', 'missions'],
          ['workspace', 'home', 'task-runs'],
        ])
      })

      es.addEventListener('agent.updated', (event) => {
        emitWorkspaceSseEvent('agent.updated', parseSseData(event))
        invalidateQueries(queryClient, [
          ['workspace', 'agents'],
          ['workspace', 'agents-directory'],
        ])
      })

      es.addEventListener('audit', (event) => {
        emitWorkspaceSseEvent('audit', parseSseData(event))
        invalidateQueries(queryClient, [['workspace', 'audit-log']])
      })

      es.onerror = () => {
        if (disposed) return
        if (!silent && hasConnectedRef.current && !disconnectToastShownRef.current) {
          disconnectToastShownRef.current = true
          toast('Workspace daemon disconnected — reconnecting...', {
            type: 'warning',
          })
        }
        setConnected(false)
        es.close()
        if (eventSource === es) {
          eventSource = null
        }
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      disposed = true
      clearReconnectTimer()
      eventSource?.close()
      eventSource = null
    }
  }, [queryClient, silent])

  return { connected }
}
