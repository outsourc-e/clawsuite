import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { GatewayDataScreen } from '@/screens/gateway/gateway-data-screen'

export const Route = createFileRoute('/nodes')({
  component: function NodesRoute() {
    usePageTitle('Nodes')
    return (
      <GatewayDataScreen
        title="Nodes"
        endpoint="/api/gateway/nodes"
        queryKey="nodes"
        pollInterval={15_000}
      />
    )
  },
})
