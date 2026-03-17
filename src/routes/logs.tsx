import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { GatewayLogsScreen } from '@/screens/gateway/logs-screen'

export const Route = createFileRoute('/logs')({
  component: LogsRoute,
})

function LogsRoute() {
  usePageTitle('Gateway Logs')
  return <GatewayLogsScreen />
}
