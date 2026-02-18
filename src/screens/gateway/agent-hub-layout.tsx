import { useEffect, useMemo, useState } from 'react'
import {
  AgentsSidebar,
  type AgentRuntime,
} from './components/agents-sidebar'
import { TaskBoard } from './components/task-board'
import { LiveFeedPanel } from './components/live-feed-panel'

type AgentHubLayoutProps = {
  agents: AgentRuntime[]
  onAddAgent: () => void
}

export function AgentHubLayout({ agents, onAddAgent }: AgentHubLayoutProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>()

  useEffect(() => {
    if (!selectedAgentId) return

    const stillExists = agents.some((agent) => agent.id === selectedAgentId)
    if (!stillExists) {
      setSelectedAgentId(undefined)
    }
  }, [agents, selectedAgentId])

  const taskBoardAgents = useMemo(
    () => agents.map((agent) => ({ id: agent.id, name: agent.name })),
    [agents],
  )

  return (
    <div className="relative isolate flex h-full min-h-0">
      <div className="w-60 shrink-0 overflow-y-auto border-r border-primary-200">
        <AgentsSidebar
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={(agent) => {
            setSelectedAgentId((current) =>
              current === agent.id ? undefined : agent.id,
            )
          }}
          onAddAgent={onAddAgent}
        />
      </div>

      <div className="relative z-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto">
        <TaskBoard agents={taskBoardAgents} selectedAgentId={selectedAgentId} />
      </div>

      <div className="relative z-10 w-72 shrink-0 overflow-y-auto border-l border-primary-200">
        <LiveFeedPanel />
      </div>
    </div>
  )
}
