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
  /** Timestamp of last activity change */
  changedAt: number
  setActivity: (activity: AgentActivity) => void
}

export const useChatActivityStore = create<ChatActivityState>((set, get) => ({
  activity: 'idle',
  changedAt: Date.now(),
  setActivity: (activity) => {
    if (get().activity !== activity) {
      set({ activity, changedAt: Date.now() })
    }
  },
}))
