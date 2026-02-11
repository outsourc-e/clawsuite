import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { AgentsScreen } from '@/screens/gateway/agents-screen'

export const Route = createFileRoute('/agents')({
  component: function AgentsRoute() {
    usePageTitle('Agents')
    return <AgentsScreen />
  },
})
