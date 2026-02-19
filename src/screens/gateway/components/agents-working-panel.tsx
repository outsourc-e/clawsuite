import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ModelPresetId } from './team-panel'

export type AgentWorkingStatus =
  | 'spawning'
  | 'ready'
  | 'active'
  | 'idle'
  | 'paused'
  | 'error'
  | 'none'

export type AgentWorkingRow = {
  id: string
  name: string
  modelId: ModelPresetId
  status: AgentWorkingStatus
  lastLine?: string
  lastAt?: number
  taskCount: number
  currentTask?: string
  sessionKey?: string
}

type AgentsWorkingPanelProps = {
  agents: AgentWorkingRow[]
  className?: string
  onSelectAgent?: (agentId: string) => void
  onKillAgent?: (agentId: string) => void
  onRespawnAgent?: (agentId: string) => void
  selectedAgentId?: string
}

const MODEL_BADGE: Record<ModelPresetId, string> = {
  auto: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  opus: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  sonnet: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  codex: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  flash: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
}

const MODEL_LABEL: Record<ModelPresetId, string> = {
  auto: 'Auto',
  opus: 'Opus 4.6',
  sonnet: 'Sonnet 4.6',
  codex: 'Codex',
  flash: 'Flash',
}

function timeAgo(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp)
  const seconds = Math.floor(delta / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

function StatusDot({
  status,
  className,
}: {
  status: AgentWorkingStatus
  className?: string
}) {
  if (status === 'active') {
    return (
      <span className={cn('relative inline-flex size-2.5 shrink-0', className)}>
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
        <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
      </span>
    )
  }
  if (status === 'spawning') {
    return (
      <span className={cn('relative inline-flex size-2.5 shrink-0', className)}>
        <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/70" />
        <span className="relative inline-flex size-2.5 rounded-full bg-amber-400" />
      </span>
    )
  }

  const DOT_COLOR: Record<AgentWorkingStatus, string> = {
    active: 'bg-emerald-500',
    spawning: 'bg-amber-400',
    ready: 'bg-neutral-400 dark:bg-neutral-500',
    idle: 'bg-amber-500',
    paused: 'bg-orange-500',
    error: 'bg-neutral-300 dark:bg-neutral-600',
    none: 'bg-neutral-300 dark:bg-neutral-600',
  }

  return (
    <span className={cn('relative inline-flex size-2.5 shrink-0', className)}>
      <span
        className={cn('relative inline-flex size-2.5 rounded-full', DOT_COLOR[status])}
      />
    </span>
  )
}

function AgentCard({
  agent,
  isSelected,
  onSelect,
  onKill,
  onRespawn,
}: {
  agent: AgentWorkingRow
  isSelected: boolean
  onSelect: () => void
  onKill?: () => void
  onRespawn?: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  const placeholderText =
    agent.status === 'active'
      ? 'Working...'
      : agent.status === 'spawning'
        ? 'Spawning...'
        : agent.status === 'idle'
          ? 'Idle'
          : agent.status === 'ready'
            ? 'Ready'
            : agent.status === 'paused'
              ? 'Paused'
              : agent.status === 'error'
                ? 'Error — click ↻ to respawn'
                : 'No session'

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      onClick={onSelect}
      className={cn(
        'rounded-xl border border-white/10 bg-white/70 dark:bg-neutral-900/50 px-3 py-2 transition-colors cursor-pointer',
        'hover:bg-white/90 dark:hover:bg-neutral-900/70',
        isSelected &&
          'ring-2 ring-accent-400 dark:ring-accent-600 bg-accent-50/40 dark:bg-accent-950/10',
      )}
    >
      {/* Top row: status dot + name + model badge + respawn */}
      <div className="flex min-w-0 items-center gap-2">
        <StatusDot status={agent.status} className="mt-px shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-primary-900 dark:text-neutral-100">
          {agent.name}
        </span>
        <span
          className={cn(
            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
            MODEL_BADGE[agent.modelId],
          )}
        >
          {MODEL_LABEL[agent.modelId]}
        </span>
        {agent.status === 'error' && onRespawn ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRespawn()
            }}
            className="shrink-0 text-sm text-neutral-400 transition-colors hover:text-neutral-600 dark:hover:text-neutral-200"
            title="Respawn agent"
          >
            ↻
          </button>
        ) : null}
      </div>

      {/* Middle: last line (2-line max with fade) */}
      <div className="relative mt-1.5 overflow-hidden" style={{ maxHeight: '2.6em' }}>
        <p
          className={cn(
            'line-clamp-2 text-[11px] leading-[1.3] text-primary-600 dark:text-neutral-400',
            !agent.lastLine && 'italic text-primary-400 dark:text-neutral-500',
          )}
        >
          {agent.lastLine ?? placeholderText}
        </p>
        {agent.lastLine ? (
          <div className="pointer-events-none absolute bottom-0 right-0 h-4 w-12 bg-gradient-to-l from-white/70 to-transparent dark:from-neutral-900/50" />
        ) : null}
      </div>

      {/* Bottom: timestamp + action buttons */}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
          {agent.lastAt
            ? timeAgo(agent.lastAt)
            : agent.taskCount > 0
              ? `${agent.taskCount} task${agent.taskCount !== 1 ? 's' : ''}`
              : '—'}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSelect()
            }}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-primary-500 transition-colors hover:bg-primary-100 hover:text-primary-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            View
          </button>
          {onKill ? (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuOpen((prev) => !prev)
                }}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-primary-400 transition-colors hover:bg-primary-100 hover:text-primary-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                ⋯
              </button>
              {menuOpen ? (
                <>
                  {/* Backdrop to close */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuOpen(false)
                    }}
                    aria-hidden
                  />
                  <div className="absolute bottom-full right-0 z-20 mb-1 min-w-[110px] rounded-lg border border-primary-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuOpen(false)
                        onKill()
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20"
                    >
                      Kill session
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function AgentCompactCard({
  agent,
  isSelected,
  onSelect,
}: {
  agent: AgentWorkingRow
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-40 shrink-0 rounded-xl border border-white/10 bg-white/70 px-2.5 py-2 text-left transition-colors dark:bg-neutral-900/50',
        'hover:bg-white/90 dark:hover:bg-neutral-900/70',
        isSelected && 'ring-2 ring-accent-400 dark:ring-accent-600',
      )}
    >
      <div className="flex items-center gap-1.5">
        <StatusDot status={agent.status} />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-primary-900 dark:text-neutral-100">
          {agent.name}
        </span>
        <span
          className={cn(
            'shrink-0 rounded-full px-1 py-px text-[9px] font-medium',
            MODEL_BADGE[agent.modelId],
          )}
        >
          {MODEL_LABEL[agent.modelId]}
        </span>
      </div>
      <p className="mt-1 truncate text-[10px] italic text-primary-400 dark:text-neutral-500">
        {agent.lastLine ?? (agent.status === 'active' ? 'Working...' : 'Idle')}
      </p>
    </button>
  )
}

export function AgentsWorkingPanel({
  agents,
  className,
  onSelectAgent,
  onKillAgent,
  onRespawnAgent,
  selectedAgentId,
}: AgentsWorkingPanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  const activeCount = agents.filter(
    (a) => a.status === 'active' || a.status === 'spawning',
  ).length

  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 bg-white/60 backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/40',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-neutral-200">
            Agents working
          </h3>
          {activeCount > 0 ? (
            <div className="flex items-center gap-1">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                Live
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-primary-400 dark:text-neutral-500">
            {activeCount > 0
              ? `${activeCount} active`
              : `${agents.length} agent${agents.length !== 1 ? 's' : ''}`}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="rounded p-0.5 text-primary-400 transition-colors hover:text-primary-600 dark:hover:text-neutral-200"
            aria-label={collapsed ? 'Expand agents panel' : 'Collapse agents panel'}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className={cn('size-3.5 transition-transform', collapsed && '-rotate-90')}
              aria-hidden
            >
              <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      {!collapsed ? (
        agents.length === 0 ? (
          <p className="px-3 pb-3 text-center text-[11px] text-primary-400 dark:text-neutral-500">
            No agents configured — choose a template to get started
          </p>
        ) : (
          <>
            {/* Desktop: vertical card list */}
            <div className="hidden space-y-1.5 px-2 pb-2 md:block">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  isSelected={selectedAgentId === agent.id}
                  onSelect={() => onSelectAgent?.(agent.id)}
                  onKill={onKillAgent ? () => onKillAgent(agent.id) : undefined}
                  onRespawn={onRespawnAgent ? () => onRespawnAgent(agent.id) : undefined}
                />
              ))}
            </div>

            {/* Mobile: horizontal scrollable compact cards */}
            <div className="flex gap-2 overflow-x-auto px-2 pb-2 md:hidden">
              {agents.map((agent) => (
                <AgentCompactCard
                  key={agent.id}
                  agent={agent}
                  isSelected={selectedAgentId === agent.id}
                  onSelect={() => onSelectAgent?.(agent.id)}
                />
              ))}
            </div>
          </>
        )
      ) : null}
    </div>
  )
}
