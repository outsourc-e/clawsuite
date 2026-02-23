import { cn } from '@/lib/utils'
import type { AgentWorkingRow, AgentWorkingStatus } from './agents-working-panel'
import type { ModelPresetId } from './team-panel'
import { AGENT_ACCENT_COLORS, AgentAvatar } from './agent-avatar'

export type OfficeViewProps = {
  agentRows: AgentWorkingRow[]
  missionRunning: boolean
  onViewOutput: (agentId: string) => void
  selectedOutputAgentId?: string
  activeTemplateName?: string
  processType: 'sequential' | 'hierarchical' | 'parallel'
}

export const OFFICE_MODEL_BADGE: Record<ModelPresetId, string> = {
  auto: 'rounded-full border border-neutral-200 bg-neutral-100 text-neutral-600',
  opus: 'border border-orange-200 bg-orange-50 text-orange-700',
  sonnet: 'border border-blue-200 bg-blue-50 text-blue-700',
  codex: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  flash: 'border border-violet-200 bg-violet-50 text-violet-700',
  minimax: 'border border-amber-200 bg-amber-50 text-amber-700',
}

export const OFFICE_MODEL_LABEL: Record<ModelPresetId, string> = {
  auto: 'Auto',
  opus: 'Opus',
  sonnet: 'Sonnet',
  codex: 'Codex',
  flash: 'Flash',
  minimax: 'MiniMax',
}

function toTitleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function getAgentStatusMeta(status: AgentWorkingStatus): {
  label: string
  className: string
  dotClassName: string
  pulse?: boolean
} {
  switch (status) {
    case 'active':
      return {
        label: 'Active',
        className: 'text-blue-600',
        dotClassName: 'bg-blue-500',
        pulse: true,
      }
    case 'ready':
    case 'idle':
      return {
        label: 'Ready',
        className: 'text-emerald-600',
        dotClassName: 'bg-emerald-500',
      }
    case 'error':
      return {
        label: 'Error',
        className: 'text-red-600',
        dotClassName: 'bg-red-500',
      }
    case 'none':
      return {
        label: 'No session',
        className: 'text-neutral-400',
        dotClassName: 'bg-neutral-400',
      }
    case 'spawning':
      return {
        label: 'Spawning',
        className: 'text-amber-600',
        dotClassName: 'bg-amber-400',
        pulse: true,
      }
    case 'paused':
      return {
        label: 'Paused',
        className: 'text-amber-700',
        dotClassName: 'bg-amber-500',
      }
    default:
      return {
        label: toTitleCase(String(status)),
        className: 'text-neutral-600',
        dotClassName: 'bg-neutral-400',
      }
  }
}

export function OfficeView({
  agentRows,
  missionRunning,
  onViewOutput,
  selectedOutputAgentId,
  activeTemplateName,
  processType,
}: OfficeViewProps) {
  if (agentRows.length === 0) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center p-8">
        <div className="text-center">
          <p className="mb-3 text-4xl">🏢</p>
          <p className="text-sm font-medium text-neutral-600">No agents in your team</p>
          <p className="mt-1 text-xs text-neutral-500">Switch to the Team tab to add agents.</p>
        </div>
      </div>
    )
  }

  const processTypeBadgeClass =
    processType === 'hierarchical' ? 'border-violet-300 bg-violet-50 text-violet-700'
      : processType === 'sequential' ? 'border-blue-300 bg-blue-50 text-blue-700'
        : 'border-emerald-300 bg-emerald-50 text-emerald-700'

  return (
    <div className="h-full min-h-[420px] overflow-y-auto bg-neutral-50 p-4">
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex -space-x-2">
          {agentRows.slice(0, 5).map((agent, i) => {
            const accent = AGENT_ACCENT_COLORS[i % AGENT_ACCENT_COLORS.length]
            return (
              <div
                key={agent.id}
                title={agent.name}
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border-2 border-white shadow-sm',
                  accent.avatar,
                )}
              >
                <AgentAvatar index={i} color={accent.hex} size={22} />
              </div>
            )
          })}
          {agentRows.length > 5 ? (
            <div className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-neutral-100 text-[10px] font-bold text-neutral-600">
              +{agentRows.length - 5}
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-sm font-semibold text-neutral-800">
            {agentRows.length} agent{agentRows.length !== 1 ? 's' : ''}
          </span>
          {activeTemplateName ? (
            <>
              <span className="text-neutral-300">·</span>
              <span className="truncate text-sm text-neutral-500">{activeTemplateName}</span>
            </>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {missionRunning && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">
              <span className="relative flex size-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              MISSION ACTIVE
            </span>
          )}
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
              processTypeBadgeClass,
            )}
          >
            {processType}
          </span>
        </div>
      </div>

      <div
        className={cn(
          'grid auto-rows-fr gap-4',
          agentRows.length <= 3 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3',
        )}
      >
        {agentRows.map((agent, i) => {
          const accent = AGENT_ACCENT_COLORS[i % AGENT_ACCENT_COLORS.length]
          const isActive = agent.status === 'active'
          const isSelected = agent.id === selectedOutputAgentId
          const isSpawning = agent.status === 'spawning'

          const statusDotEl = isActive ? (
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
            </span>
          ) : isSpawning ? (
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/60" />
              <span className="relative inline-flex size-3 rounded-full bg-amber-400" />
            </span>
          ) : (
            <span
              className={cn(
                'size-3 shrink-0 rounded-full',
                agent.status === 'idle' ? 'bg-yellow-500'
                  : agent.status === 'ready' ? 'bg-yellow-500'
                    : agent.status === 'error' ? 'bg-red-500'
                      : 'bg-neutral-400',
              )}
            />
          )

          return (
            <div
              key={agent.id}
              className={cn(
                'relative flex h-full min-h-[248px] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md',
                isSelected ? 'shadow-md ring-1 ring-orange-300' : '',
                isActive && missionRunning && !isSelected && 'ring-1 ring-emerald-200',
              )}
            >
              <div className={cn('h-[3px] w-full', accent.bar)} />

              <div className="flex h-full flex-col p-4">
                <div className="flex items-start justify-between">
                  <div
                    className={cn(
                      'flex size-12 items-center justify-center rounded-full border border-white/80 shadow-sm',
                      accent.avatar,
                    )}
                  >
                    <AgentAvatar index={i} color={accent.hex} size={28} />
                  </div>
                  {statusDotEl}
                </div>

                <h3 className="mt-3 truncate text-sm font-semibold tracking-tight text-neutral-900">
                  {agent.name}
                </h3>

                <div className="mt-1 flex flex-wrap items-start gap-1.5">
                  {agent.roleDescription ? (
                    <span className="line-clamp-2 min-w-0 text-xs text-neutral-600">
                      {agent.roleDescription}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      'shrink-0 px-2 py-0.5 font-mono text-[10px] font-medium',
                      OFFICE_MODEL_BADGE[agent.modelId],
                    )}
                  >
                    {OFFICE_MODEL_LABEL[agent.modelId]}
                  </span>
                </div>

                {agent.lastLine ? (
                  <p className="mt-2 line-clamp-2 min-h-[2.4em] font-mono text-xs leading-relaxed text-neutral-500">
                    {agent.lastLine}
                  </p>
                ) : (
                  <p
                    className={cn(
                      'mt-2 min-h-[2.4em] font-mono text-xs leading-relaxed',
                      getAgentStatusMeta(agent.status).className,
                    )}
                  >
                    ● {getAgentStatusMeta(agent.status).label}
                  </p>
                )}

                {agent.taskCount > 0 ? (
                  <div className="mt-2">
                    <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[9px] font-semibold text-neutral-600">
                      {agent.taskCount} task{agent.taskCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => onViewOutput(agent.id)}
                  className={cn(
                    'mt-auto w-full rounded-lg border px-2 py-2 text-[11px] font-medium transition-colors',
                    isSelected
                      ? 'border-orange-200 bg-orange-50 text-orange-700'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50',
                  )}
                >
                  {isSelected ? '✓ Viewing Output' : 'View Output'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 rounded-xl border border-neutral-200 bg-white px-4 py-2 shadow-sm">
        <span className="flex items-center gap-1 text-[10px] text-neutral-500">
          <span className="size-2 rounded-full bg-emerald-500" /> Active
        </span>
        <span className="flex items-center gap-1 text-[10px] text-neutral-500">
          <span className="size-2 rounded-full bg-yellow-500" /> Idle
        </span>
        <span className="flex items-center gap-1 text-[10px] text-neutral-500">
          <span className="size-2 rounded-full bg-neutral-400" /> No session
        </span>
        <span className="flex items-center gap-1 text-[10px] text-neutral-500">
          <span className="size-2 rounded-full bg-red-500" /> Error
        </span>
      </div>
    </div>
  )
}
