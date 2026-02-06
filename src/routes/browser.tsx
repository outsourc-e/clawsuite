import { createFileRoute } from '@tanstack/react-router'
import { BrowserPanel } from '@/components/browser-view/BrowserPanel'

export const Route = createFileRoute('/browser')({
  component: BrowserRoute,
})

function BrowserRoute() {
  return <BrowserPanel />
}
