import { createFileRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { BotIcon, Rocket01Icon } from '@hugeicons/core-free-icons'
import { motion } from 'motion/react'
import { usePageTitle } from '@/hooks/use-page-title'
import { AgentViewPanel } from '@/components/agent-view/agent-view-panel'
import { useAgentView } from '@/hooks/use-agent-view'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/agent-swarm')({
  component: AgentSwarmRoute,
})

function AgentSwarmRoute() {
  usePageTitle('Agent Swarm')
  const { activeCount, queuedAgents, setOpen } = useAgentView()
  const hasAgents = activeCount > 0 || queuedAgents.length > 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22 }}
      className="h-full overflow-auto bg-surface px-3 py-3 sm:px-4 sm:py-4"
    >
      <div className="mx-auto max-w-[1200px]">
        {/* Page Header */}
        <header className="mb-6 rounded-2xl border border-primary-200 bg-primary-50/85 p-4 shadow-sm backdrop-blur-xl sm:p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-100/70 px-3 py-1 text-xs text-primary-600 tabular-nums">
            <HugeiconsIcon icon={BotIcon} size={16} strokeWidth={1.5} />
            <span>Orchestration</span>
          </div>
          <h1 className="mt-2 text-xl font-semibold text-balance text-primary-900 sm:text-2xl">
            Agent Swarm
          </h1>
          <p className="mt-1 text-sm text-pretty text-primary-600">
            Multi-agent orchestration for complex workflows. Spawn specialized agents that work together.
          </p>
        </header>

        {/* Empty State or Panel */}
        {hasAgents ? (
          <AgentViewPanel />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-primary-200 bg-primary-50/60 px-6 py-16 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary-100 text-primary-500">
              <HugeiconsIcon icon={Rocket01Icon} size={32} strokeWidth={1.5} />
            </div>
            <h2 className="mb-2 text-lg font-medium text-primary-900">No active agents</h2>
            <p className="mb-6 max-w-md text-sm text-primary-600">
              Agents will appear here when spawned during chat sessions. Start a conversation and let the AI orchestrate sub-agents for complex tasks.
            </p>
            <Button
              variant="default"
              onClick={() => setOpen(true)}
              className="gap-2"
            >
              <HugeiconsIcon icon={BotIcon} size={16} strokeWidth={1.5} />
              Open Agent Panel
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
