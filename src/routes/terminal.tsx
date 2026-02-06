import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { TerminalWorkspace } from '@/components/terminal/terminal-workspace'

export const Route = createFileRoute('/terminal')({
  component: TerminalRoute,
})

function TerminalRoute() {
  const navigate = useNavigate()

  function handleBack() {
    if (window.history.length > 1) {
      window.history.back()
      return
    }
    navigate({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'main' },
      replace: true,
    })
  }

  return (
    <div className="h-screen bg-surface text-primary-900">
      <TerminalWorkspace mode="fullscreen" onBack={handleBack} />
    </div>
  )
}
