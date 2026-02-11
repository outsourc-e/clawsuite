import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { GatewayDataScreen } from '@/screens/gateway/gateway-data-screen'

export const Route = createFileRoute('/agents')({
  component: function AgentsRoute() {
    usePageTitle('Agents')
    return (
      <GatewayDataScreen
        title="Agents"
        endpoint="/api/gateway/agents"
        queryKey="agents"
        pollInterval={15_000}
      />
    )
  },
})
