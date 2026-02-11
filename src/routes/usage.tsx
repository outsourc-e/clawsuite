import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { GatewayDataScreen } from '@/screens/gateway/gateway-data-screen'

export const Route = createFileRoute('/usage')({
  component: function UsageRoute() {
    usePageTitle('Usage')
    return (
      <GatewayDataScreen
        title="Usage"
        endpoint="/api/gateway/usage"
        queryKey="usage-gateway"
        pollInterval={15_000}
      />
    )
  },
})
