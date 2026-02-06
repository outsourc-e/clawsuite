import { createFileRoute } from '@tanstack/react-router'
import { SkillsScreen } from '@/screens/skills/skills-screen'

export const Route = createFileRoute('/skills')({
  component: SkillsRoute,
})

function SkillsRoute() {
  return <SkillsScreen />
}
