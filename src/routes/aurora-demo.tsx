import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/aurora-demo')({
  beforeLoad: function redirectAuroraDemoRoute() {
    throw redirect({
      to: '/dashboard',
      replace: true,
    })
  },
  component: function AuroraDemoRoute() {
    return null
  },
})
