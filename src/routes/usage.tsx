import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { GatewayPlaceholder } from '@/screens/gateway/gateway-placeholder'

export const Route = createFileRoute('/usage')({
  component: function UsageRoute() {
    usePageTitle('Usage')
    return <GatewayPlaceholder title="Usage" />
  },
})
