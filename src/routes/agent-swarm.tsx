import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/agent-swarm')({
  beforeLoad: function redirectAgentSwarmRoute() {
    throw redirect({
      to: '/dashboard',
      replace: true,
    })
  },
  component: function AgentSwarmRoute() {
    return null
  },
})
