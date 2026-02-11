import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { GatewayDataScreen } from '@/screens/gateway/gateway-data-screen'

export const Route = createFileRoute('/channels')({
  component: function ChannelsRoute() {
    usePageTitle('Channels')
    return (
      <GatewayDataScreen
        title="Channels"
        endpoint="/api/gateway/channels"
        queryKey="channels"
        pollInterval={5_000}
      />
    )
  },
})
