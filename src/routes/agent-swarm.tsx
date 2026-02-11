import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { AgentViewPanel } from '@/components/agent-view/agent-view-panel'

export const Route = createFileRoute('/agent-swarm')({
  component: AgentSwarmRoute,
})

function AgentSwarmRoute() {
  usePageTitle('Agent Swarm')
  return (
    <div className="h-full overflow-auto bg-surface">
      <AgentViewPanel />
    </div>
  )
}
