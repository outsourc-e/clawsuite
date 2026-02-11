import { create } from 'zustand'

export type AgentActivity =
  | 'idle'
  | 'reading'      // user sent a message, agent hasn't started responding
  | 'thinking'     // waiting for first token
  | 'responding'   // streaming response
  | 'tool-use'     // executing a tool call
  | 'orchestrating' // subagents active

type ChatActivityState = {
  activity: AgentActivity
  /** Activity set by local chat UI */
  localActivity: AgentActivity
  /** Activity detected from gateway polling */
  gatewayActivity: AgentActivity
  /** Timestamp of last activity change */
  changedAt: number
  setLocalActivity: (activity: AgentActivity) => void
  setGatewayActivity: (activity: AgentActivity) => void
  /** Polling interval ref */
  _pollTimer: ReturnType<typeof setInterval> | null
  startGatewayPoll: () => void
  stopGatewayPoll: () => void
}

function resolveActivity(local: AgentActivity, gateway: AgentActivity): AgentActivity {
  // Local UI states take priority when active
  if (local !== 'idle') return local
  // Fall back to gateway-detected state
  return gateway
}

async function pollGatewayState(): Promise<AgentActivity> {
  try {
    const res = await fetch('/api/session-status')
    if (!res.ok) return 'idle'
    const data = await res.json()
    const payload = data.payload ?? data

    // Check if main session was recently updated (within last 10s)
    const sessions = payload.sessions?.active ?? []
    const mainSession = sessions.find?.((s: Record<string, unknown>) =>
      typeof s === 'object' && !String(s.key ?? '').includes('subagent:'),
    )

    if (mainSession) {
      const updatedAt = typeof mainSession.updatedAt === 'number' ? mainSession.updatedAt : 0
      const staleness = Date.now() - updatedAt
      if (staleness < 5000) return 'responding'
      if (staleness < 15000) return 'thinking'
    }

    // Check message counts for activity
    const msgCounts = payload.messageCounts
    if (msgCounts && typeof msgCounts === 'object') {
      const pending = msgCounts.pending ?? msgCounts.queued ?? 0
      if (pending > 0) return 'thinking'
    }

    // Check latency for recent activity
    const latency = payload.latency
    if (typeof latency === 'number' && latency > 0 && latency < 30000) {
      return 'responding'
    }

    return 'idle'
  } catch {
    return 'idle'
  }
}

export const useChatActivityStore = create<ChatActivityState>((set, get) => ({
  activity: 'idle',
  localActivity: 'idle',
  gatewayActivity: 'idle',
  changedAt: Date.now(),
  _pollTimer: null,

  setLocalActivity: (localActivity) => {
    const state = get()
    const activity = resolveActivity(localActivity, state.gatewayActivity)
    if (state.localActivity !== localActivity || state.activity !== activity) {
      set({ localActivity, activity, changedAt: Date.now() })
    }
  },

  setGatewayActivity: (gatewayActivity) => {
    const state = get()
    const activity = resolveActivity(state.localActivity, gatewayActivity)
    if (state.gatewayActivity !== gatewayActivity || state.activity !== activity) {
      set({ gatewayActivity, activity, changedAt: Date.now() })
    }
  },

  startGatewayPoll: () => {
    const state = get()
    if (state._pollTimer) return
    const tick = async () => {
      const detected = await pollGatewayState()
      get().setGatewayActivity(detected)
    }
    void tick()
    const timer = setInterval(tick, 3000)
    set({ _pollTimer: timer })
  },

  stopGatewayPoll: () => {
    const timer = get()._pollTimer
    if (timer) {
      clearInterval(timer)
      set({ _pollTimer: null })
    }
  },
}))
