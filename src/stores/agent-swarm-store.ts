/**
 * Agent Swarm Store — Real-time session monitoring via gateway polling.
 * Connects to /api/gateway/sessions and tracks live agent sessions.
 */
import { create } from 'zustand'
import { BASE_URL, type GatewaySession } from '@/lib/gateway-api'

export type SwarmSession = GatewaySession & {
  /** Derived status for UI rendering */
  swarmStatus: 'running' | 'thinking' | 'complete' | 'failed' | 'idle'
  /** Time since last update in ms */
  staleness: number
}

type SwarmState = {
  sessions: SwarmSession[]
  isConnected: boolean
  lastFetchedAt: number
  error: string | null
  /** Internal polling interval ref */
  _intervalId: ReturnType<typeof setInterval> | null

  // Actions
  fetchSessions: () => Promise<void>
  startPolling: (intervalMs?: number) => void
  stopPolling: () => void
}

function deriveSwarmStatus(session: GatewaySession): SwarmSession['swarmStatus'] {
  const status = (session.status ?? '').toLowerCase()
  if (['thinking', 'reasoning'].includes(status)) return 'thinking'
  if (['failed', 'error', 'cancelled', 'canceled', 'killed'].includes(status)) return 'failed'
  if (['complete', 'completed', 'success', 'succeeded', 'done'].includes(status)) return 'complete'
  if (['idle', 'waiting', 'sleeping'].includes(status)) return 'idle'
  return 'running'
}

function toSwarmSession(session: GatewaySession): SwarmSession {
  const updatedAt = typeof session.updatedAt === 'number'
    ? session.updatedAt
    : typeof session.updatedAt === 'string'
      ? new Date(session.updatedAt).getTime()
      : Date.now()

  return {
    ...session,
    swarmStatus: deriveSwarmStatus(session),
    staleness: Date.now() - updatedAt,
  }
}

export const useSwarmStore = create<SwarmState>((set, get) => ({
  sessions: [],
  isConnected: false,
  lastFetchedAt: 0,
  error: null,
  _intervalId: null,

  fetchSessions: async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/gateway/sessions`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()

      const rawSessions: GatewaySession[] = json?.data?.sessions ?? json?.sessions ?? []
      const swarmSessions = rawSessions.map(toSwarmSession)

      // Sort: running/thinking first, then by updatedAt desc
      swarmSessions.sort((a, b) => {
        const priority = { thinking: 0, running: 1, idle: 2, complete: 3, failed: 4 }
        const pa = priority[a.swarmStatus] ?? 2
        const pb = priority[b.swarmStatus] ?? 2
        if (pa !== pb) return pa - pb
        return b.staleness - a.staleness
      })

      set({
        sessions: swarmSessions,
        isConnected: true,
        lastFetchedAt: Date.now(),
        error: null,
      })
    } catch (err) {
      set({
        isConnected: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },

  startPolling: (intervalMs = 5000) => {
    const state = get()
    if (state._intervalId) return // already polling

    // Fetch immediately
    state.fetchSessions()

    const id = setInterval(() => {
      get().fetchSessions()
    }, intervalMs)

    set({ _intervalId: id })
  },

  stopPolling: () => {
    const { _intervalId } = get()
    if (_intervalId) {
      clearInterval(_intervalId)
      set({ _intervalId: null })
    }
  },
}))
