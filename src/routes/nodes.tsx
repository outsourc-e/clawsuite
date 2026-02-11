import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { GatewayPlaceholder } from '@/screens/gateway/gateway-placeholder'

export const Route = createFileRoute('/nodes')({
  component: function NodesRoute() {
    usePageTitle('Nodes')
    return <GatewayPlaceholder title="Nodes" />
  },
})
