import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: function redirectToWorkspace() {
    // First launch: redirect to setup wizard if gateway not configured
    if (typeof window !== 'undefined') {
      const configured = localStorage.getItem('clawsuite-gateway-configured') === 'true'
      if (!configured) {
        throw redirect({ to: '/wizard' as string, replace: true })
      }
      const isMobile = window.innerWidth < 768
      throw redirect({
        to: (isMobile ? '/chat/main' : '/dashboard') as string,
        replace: true,
      })
    }
    // SSR: always redirect to wizard (safe default — client will re-check)
    throw redirect({ to: '/wizard' as string, replace: true })
  },
  component: function IndexRoute() {
    return null
  },
})
