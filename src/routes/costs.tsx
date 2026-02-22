import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { CostsScreen } from '@/screens/costs/costs-screen'

export const Route = createFileRoute('/costs')({
  ssr: false,
  component: function CostsRoute() {
    usePageTitle('Costs')
    return <CostsScreen />
  },
})
