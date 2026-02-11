import { useMemo } from 'react'
import { useAgentSwarmStore } from '@/stores/agent-swarm-store'

export type OrchestratorState = 'idle' | 'thinking' | 'working' | 'orchestrating' | 'listening'

type OrchestratorInfo = {
  state: OrchestratorState
  label: string
  activeAgentCount: number
}

export function useOrchestratorState(opts: {
  waitingForResponse?: boolean
  isStreaming?: boolean
}): OrchestratorInfo {
  const sessions = useAgentSwarmStore((s) => s.sessions)

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

    if (opts.isStreaming) {
      return { state: 'working', label: 'Working...', activeAgentCount: 0 }
    }

    if (opts.waitingForResponse) {
      return { state: 'thinking', label: 'Thinking...', activeAgentCount: 0 }
    }

    return { state: 'idle', label: 'Idle', activeAgentCount: 0 }
  }, [sessions, opts.isStreaming, opts.waitingForResponse])
}
