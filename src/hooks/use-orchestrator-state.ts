import { useMemo } from 'react'
import { useChatActivityStore } from '@/stores/chat-activity-store'
import { useSwarmStore } from '@/stores/agent-swarm-store'

export type OrchestratorState = 'idle' | 'thinking' | 'working' | 'orchestrating' | 'listening'

type OrchestratorInfo = {
  state: OrchestratorState
  label: string
  activeAgentCount: number
}

export function useOrchestratorState(opts?: {
  waitingForResponse?: boolean
  isStreaming?: boolean
}): OrchestratorInfo {
  const sessions = useSwarmStore((s) => s.sessions)
  const storeWaiting = useChatActivityStore((s) => s.waitingForResponse)
  const storeStreaming = useChatActivityStore((s) => s.isStreaming)

  const waiting = opts?.waitingForResponse ?? storeWaiting
  const streaming = opts?.isStreaming ?? storeStreaming

  return useMemo(() => {
    const activeAgents = sessions.filter(
      (s) => s.swarmStatus === 'running' || s.swarmStatus === 'thinking',
    )
    const count = activeAgents.length

    if (count > 0) {
      return {
        state: 'orchestrating',
        label: `Orchestrating ${count} agent${count > 1 ? 's' : ''}`,
        activeAgentCount: count,
      }
    }

    if (streaming) {
      return { state: 'working', label: 'Working...', activeAgentCount: 0 }
    }

    if (waiting) {
      return { state: 'thinking', label: 'Thinking...', activeAgentCount: 0 }
    }

    return { state: 'idle', label: 'Idle', activeAgentCount: 0 }
  }, [sessions, streaming, waiting])
}
