import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: function redirectToWorkspace() {
    throw redirect({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'main' },
      replace: true,
    })
  },
  component: function IndexRoute() {
    return null
  },
})
