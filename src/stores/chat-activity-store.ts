import { create } from 'zustand'

type ChatActivityState = {
  waitingForResponse: boolean
  isStreaming: boolean
  setWaiting: (v: boolean) => void
  setStreaming: (v: boolean) => void
}

export const useChatActivityStore = create<ChatActivityState>((set) => ({
  waitingForResponse: false,
  isStreaming: false,
  setWaiting: (v) => set({ waitingForResponse: v }),
  setStreaming: (v) => set({ isStreaming: v }),
}))
