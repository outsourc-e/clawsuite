import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

export const MODEL_PRESETS = [
  { id: 'auto', label: 'Auto', desc: 'Best model for the task' },
  { id: 'opus', label: 'Opus 4.6', desc: 'Deep reasoning' },
  { id: 'sonnet', label: 'Sonnet 4.6', desc: 'Fast & capable' },
  { id: 'codex', label: 'Codex', desc: 'Code specialist' },
  { id: 'flash', label: 'Gemini Flash', desc: 'Quick & cheap' },
] as const

export const TEAM_TEMPLATES = [
  {
    id: 'research',
    name: 'Research Team',
    agents: ['analyst', 'writer', 'reviewer'],
    icon: '🔍',
  },
  {
    id: 'coding',
    name: 'Coding Sprint',
    agents: ['architect', 'developer', 'tester'],
    icon: '💻',
  },
  {
    id: 'content',
    name: 'Content Pipeline',
    agents: ['researcher', 'writer', 'editor'],
    icon: '📝',
  },
] as const

export type ModelPresetId = (typeof MODEL_PRESETS)[number]['id']
export type TeamTemplateId = (typeof TEAM_TEMPLATES)[number]['id']

export type TeamMember = {
  id: string
  name: string
  modelId: ModelPresetId
  roleDescription: string
  status: string
}

type TeamPanelProps = {
  team: TeamMember[]
  onApplyTemplate: (templateId: TeamTemplateId) => void
  onAddAgent: () => void
  onUpdateAgent: (
    agentId: string,
    updates: Partial<Pick<TeamMember, 'modelId' | 'roleDescription'>>,
  ) => void
  onSelectAgent?: (agentId?: string) => void
}

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-emerald-500',
  idle: 'bg-amber-500',
  available: 'bg-primary-400',
  paused: 'bg-red-500',
}

export function TeamPanel({
  team,
  onApplyTemplate,
  onAddAgent,
  onUpdateAgent,
  onSelectAgent,
}: TeamPanelProps) {
  const [expandedAgentId, setExpandedAgentId] = useState<string>()

  useEffect(() => {
    if (!expandedAgentId) return
    const exists = team.some((member) => member.id === expandedAgentId)
    if (exists) return
    setExpandedAgentId(undefined)
    onSelectAgent?.(undefined)
  }, [expandedAgentId, onSelectAgent, team])

  const modelLabelById = useMemo(
    () =>
      new Map<string, string>(MODEL_PRESETS.map((preset) => [preset.id, preset.label])),
    [],
  )

  function handleToggleAgent(agentId: string) {
    setExpandedAgentId((current) => {
      const next = current === agentId ? undefined : agentId
      onSelectAgent?.(next)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col border-r border-primary-200 bg-primary-50/40 dark:bg-neutral-900/20">
      <div className="border-b border-primary-200 px-3 py-3">
        <h2 className="text-sm font-semibold text-primary-900 dark:text-neutral-100">
          Team Setup
        </h2>
        <p className="text-[11px] text-primary-500">Choose a template or build your own.</p>
        <div className="mt-2 space-y-1.5">
          {TEAM_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onApplyTemplate(template.id)}
              className="flex w-full items-center justify-between rounded-lg border border-primary-200 bg-white px-2.5 py-2 text-left transition-colors hover:bg-primary-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
            >
              <span className="text-xs font-medium text-primary-800 dark:text-neutral-100">
                {template.icon} {template.name}
              </span>
              <span className="text-[10px] text-primary-500">{template.agents.length} agents</span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-b border-primary-200 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-500">
            Your Team
          </h3>
          <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-medium text-primary-700 dark:bg-neutral-800 dark:text-neutral-300">
            {team.length}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2">
        {team.length === 0 ? (
          <div className="rounded-lg border border-dashed border-primary-300 bg-white/70 px-3 py-4 text-center text-xs text-primary-500 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-400">
            No agents yet. Apply a template or add one manually.
          </div>
        ) : null}

        {team.map((agent) => {
          const statusColor = STATUS_COLOR[agent.status] ?? 'bg-primary-400'
          const expanded = expandedAgentId === agent.id
          const modelLabel = modelLabelById.get(agent.modelId) ?? 'Auto'

          return (
            <div
              key={agent.id}
              className={cn(
                'rounded-xl border border-primary-200 bg-white/90 p-2 shadow-sm transition-colors dark:border-neutral-700 dark:bg-neutral-900/70',
                expanded &&
                  'border-accent-300 dark:border-accent-700 bg-accent-50/60 dark:bg-accent-950/10',
              )}
            >
              <button
                type="button"
                onClick={() => handleToggleAgent(agent.id)}
                className="flex w-full items-start gap-2 text-left"
              >
                <span className={cn('mt-1 size-2.5 shrink-0 rounded-full', statusColor)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-primary-900 dark:text-neutral-100">
                    {agent.name}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-medium text-primary-700 dark:bg-neutral-800 dark:text-neutral-300">
                      {modelLabel}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-primary-500">
                      {agent.status}
                    </span>
                  </div>
                </div>
              </button>

              {expanded ? (
                <div className="mt-2 space-y-2 border-t border-primary-200 pt-2 dark:border-neutral-700">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-primary-500">
                      Model
                    </span>
                    <select
                      value={agent.modelId}
                      onChange={(event) => {
                        onUpdateAgent(agent.id, {
                          modelId: event.target.value as ModelPresetId,
                        })
                      }}
                      className="w-full rounded-md border border-primary-200 bg-white px-2 py-1.5 text-xs text-primary-900 outline-none ring-accent-400 focus:ring-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                    >
                      {MODEL_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label} - {preset.desc}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-primary-500">
                      Role Description
                    </span>
                    <textarea
                      value={agent.roleDescription}
                      onChange={(event) => {
                        onUpdateAgent(agent.id, {
                          roleDescription: event.target.value,
                        })
                      }}
                      rows={3}
                      placeholder="Define responsibilities and deliverables"
                      className="w-full resize-none rounded-md border border-primary-200 bg-white px-2 py-1.5 text-xs text-primary-900 outline-none ring-accent-400 focus:ring-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                    />
                  </label>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="border-t border-primary-200 px-3 py-3">
        <button
          type="button"
          onClick={onAddAgent}
          className="inline-flex w-full items-center justify-center rounded-lg border border-primary-200 bg-white px-3 py-2 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          + Add Agent
        </button>
      </div>
    </div>
  )
}
