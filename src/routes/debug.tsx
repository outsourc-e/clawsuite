import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { DebugConsoleScreen } from '@/screens/debug/debug-console-screen'

export const Route = createFileRoute('/debug')({
  component: DebugRoute,
})

function DebugRoute() {
  usePageTitle('Debug Console')
  return <DebugConsoleScreen />
}
