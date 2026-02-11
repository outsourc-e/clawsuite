import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { GatewayDataScreen } from '@/screens/gateway/gateway-data-screen'

export const Route = createFileRoute('/sessions')({
  component: function SessionsRoute() {
    usePageTitle('Sessions')
    return (
      <GatewayDataScreen
        title="Sessions"
        endpoint="/api/gateway/sessions"
        queryKey="sessions-gateway"
        pollInterval={10_000}
      />
    )
  },
})
