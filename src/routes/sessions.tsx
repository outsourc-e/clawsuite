import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { GatewayPlaceholder } from '@/screens/gateway/gateway-placeholder'

export const Route = createFileRoute('/sessions')({
  component: function SessionsRoute() {
    usePageTitle('Sessions')
    return <GatewayPlaceholder title="Sessions" />
  },
})
