import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { GatewayPlaceholder } from '@/screens/gateway/gateway-placeholder'

export const Route = createFileRoute('/channels')({
  component: function ChannelsRoute() {
    usePageTitle('Channels')
    return <GatewayPlaceholder title="Channels" />
  },
})
