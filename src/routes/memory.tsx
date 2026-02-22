import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { MemoryBrowserScreen } from '@/screens/memory/memory-browser-screen'

export const Route = createFileRoute('/memory')({
  ssr: false,
  component: function MemoryRoute() {
    usePageTitle('Memory')
    return <MemoryBrowserScreen />
  },
})
