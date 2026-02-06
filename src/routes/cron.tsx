import { createFileRoute } from '@tanstack/react-router'
import { CronManagerScreen } from '@/screens/cron/cron-manager-screen'

export const Route = createFileRoute('/cron')({
  component: function CronRoute() {
    return <CronManagerScreen />
  },
})
