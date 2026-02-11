import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { NodesScreen } from '@/screens/gateway/nodes-screen'

export const Route = createFileRoute('/nodes')({
  component: function NodesRoute() {
    usePageTitle('Nodes')
    return <NodesScreen />
  },
})
