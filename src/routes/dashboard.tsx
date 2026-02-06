import { createFileRoute } from '@tanstack/react-router'
import { DashboardScreen } from '@/screens/dashboard/dashboard-screen'

export const Route = createFileRoute('/dashboard')({
  component: function DashboardRoute() {
    return <DashboardScreen />
  },
})
