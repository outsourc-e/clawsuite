import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { ActivityScreen } from '@/screens/activity/activity-screen'

export const Route = createFileRoute('/activity')({
  component: function ActivityRoute() {
    usePageTitle('Activity Log')
    return <ActivityScreen />
  },
})
