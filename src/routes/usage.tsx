import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { UsageScreen } from '@/screens/gateway/usage-screen'

export const Route = createFileRoute('/usage')({
  component: function UsageRoute() {
    usePageTitle('Usage')
    return <UsageScreen />
  },
})
