import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { ChannelsScreen } from '@/screens/gateway/channels-screen'

export const Route = createFileRoute('/channels')({
  component: function ChannelsRoute() {
    usePageTitle('Channels')
    return <ChannelsScreen />
  },
})
