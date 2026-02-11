import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { GatewayPlaceholder } from '@/screens/gateway/gateway-placeholder'

export const Route = createFileRoute('/instances')({
  component: function InstancesRoute() {
    usePageTitle('Instances')
    return <GatewayPlaceholder title="Instances" />
  },
})
