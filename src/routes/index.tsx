import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: function redirectToWorkspace() {
    throw redirect({
      to: '/dashboard',
      replace: true,
    })
  },
  component: function IndexRoute() {
    return null
  },
})
