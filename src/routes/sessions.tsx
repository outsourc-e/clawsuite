import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { SessionsScreen } from '@/screens/gateway/sessions-screen'

export const Route = createFileRoute('/sessions')({
  component: SessionsRoute,
})

function SessionsRoute() {
  usePageTitle('Sessions')
  return <SessionsScreen />
}
