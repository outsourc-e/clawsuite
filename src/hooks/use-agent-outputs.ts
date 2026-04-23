import { useCallback, useEffect, useState } from 'react'

/**
 * Outputs feed for the Operations screen.
 *
 * Fetches recent agent runs (chat turns + cron results) from the gateway
 * via a lightweight polling interval. When the feed endpoint is not yet
 * implemented on the connected gateway, this hook returns an empty list
 * instead of throwing — lets the Operations screen render a "no outputs
 * yet" state instead of crashing.
 *
 * This stub replaces the previously-deleted `use-agent-outputs` module
 * (lost during the 2026-04-20 operations restore — the consumer file
 * `full-outputs-view.tsx` was committed but the hook was not). The shape
 * below matches the fields the consumer reads, derived from
 * `full-outputs-view.tsx` references.
 */

export type AgentOutputStatus = 'ok' | 'error' | 'running' | (string & {})

export type AgentOutputFailureKind =
  | 'delivery'
  | 'config'
  | 'approval'
  | 'runtime'
  | (string & {})

export type AgentOutput = {
  id: string
  agentId: string
  agentName: string
  agentEmoji: string
  jobId: string
  jobName: string
  timestamp: number
  status: AgentOutputStatus
  statusLabel?: string
  failureKind?: AgentOutputFailureKind
  summary: string
  fullOutput: string
  durationMs?: number
  model?: string
  sessionKey?: string
  chatSessionKey?: string
  error?: string
}

export type AgentOutputFilter = 'all' | 'ok' | 'error' | 'running' | (string & {})

export type AgentOutputFilterOption = {
  id: AgentOutputFilter
  label: string
  emoji: string
}

type UseAgentOutputsResult = {
  outputs: Array<AgentOutput>
  availableFilters: Array<AgentOutputFilterOption>
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
}

const FILTER_OPTION_MAP: Record<string, AgentOutputFilterOption> = {
  all: { id: 'all', label: 'All', emoji: '📜' },
  ok: { id: 'ok', label: 'Success', emoji: '✅' },
  error: { id: 'error', label: 'Errors', emoji: '❌' },
  running: { id: 'running', label: 'Running', emoji: '⏳' },
}

async function fetchOutputs(): Promise<Array<AgentOutput>> {
  try {
    const res = await fetch('/api/agent-outputs', {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const body = (await res.json()) as { outputs?: Array<AgentOutput> } | Array<AgentOutput>
    if (Array.isArray(body)) return body
    if (body && Array.isArray(body.outputs)) return body.outputs
    return []
  } catch {
    return []
  }
}

export function useAgentOutputs(filter: AgentOutputFilter): UseAgentOutputsResult {
  const [outputs, setOutputs] = useState<Array<AgentOutput>>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await fetchOutputs()
      setOutputs(next)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load outputs'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => {
      void refresh()
    }, 30_000)
    return () => clearInterval(id)
  }, [refresh])

  const filtered =
    filter === 'all'
      ? outputs
      : outputs.filter((o) => o.status === filter)

  const statusIds = Array.from(new Set(outputs.map((o) => o.status))).filter(
    (s): s is AgentOutputFilter => typeof s === 'string',
  )
  const availableFilters: Array<AgentOutputFilterOption> = [
    FILTER_OPTION_MAP.all,
    ...statusIds.map(
      (id) =>
        FILTER_OPTION_MAP[id] ?? {
          id,
          label: id.charAt(0).toUpperCase() + id.slice(1),
          emoji: '•',
        },
    ),
  ]

  return {
    outputs: filtered,
    availableFilters,
    loading,
    error,
    refresh,
  }
}
