import { useEffect, useState } from 'react'
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

const DEFAULT_OFFICE_MODEL_BADGE =
  'border border-neutral-200 bg-neutral-50 text-neutral-700'

export function getOfficeModelBadge(modelId: string): string {
  return OFFICE_MODEL_BADGE[modelId as ModelPresetId] ?? DEFAULT_OFFICE_MODEL_BADGE
}

export function getOfficeModelLabel(modelId: string): string {
  if (!modelId) return 'Unknown'
  const presetLabel = OFFICE_MODEL_LABEL[modelId as ModelPresetId]
  if (presetLabel) return presetLabel
  return modelId.split('/')[1] || modelId
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

type OfficeDeskSlot = {
  col: number
  row: number
}

const OFFICE_DESK_SLOTS: OfficeDeskSlot[] = [
  { col: 0, row: 0 },
  { col: 1, row: 0 },
  { col: 2, row: 0 },
  { col: 0, row: 1 },
  { col: 1, row: 1 },
  { col: 2, row: 1 },
  { col: -1, row: 1 },
  { col: 3, row: 1 },
  { col: 0, row: 2 },
  { col: 2, row: 2 },
]

function getOfficeStatusDotClass(status: AgentWorkingStatus): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-500'
    case 'idle':
    case 'ready':
      return 'bg-amber-400'
    case 'spawning':
    case 'paused':
      return 'bg-yellow-500'
    case 'error':
      return 'bg-red-500'
    default:
      return 'bg-neutral-400'
  }
}

function projectIsometric(col: number, row: number) {
  const tileW = 132
  const tileH = 68
  const originX = 460
  const originY = 132

  return {
    x: originX + (col - row) * (tileW / 2),
    y: originY + (col + row) * (tileH / 2),
  }
}

function DeskSprite({
  x,
  y,
  accent,
}: {
  x: number
  y: number
  accent: string
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <polygon points="0,0 52,26 0,52 -52,26" fill="#dbeafe" stroke="#bfdbfe" strokeWidth="1.5" />
      <polygon points="0,6 44,28 0,50 -44,28" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
      <polygon points="-8,10 24,26 -8,42 -40,26" fill="#e2e8f0" />
      <rect x="-20" y="-8" width="30" height="16" rx="2" fill="#334155" />
      <rect x="-17" y="-5" width="24" height="10" rx="1" fill="#0ea5e9" opacity="0.8" />
      <rect x="11" y="-4" width="4" height="10" fill="#64748b" />
      <rect x="-41" y="20" width="6" height="22" fill="#94a3b8" />
      <rect x="35" y="20" width="6" height="22" fill="#94a3b8" />
      <rect x="-5" y="36" width="10" height="8" fill={accent} opacity="0.9" />
      <rect x="-7" y="44" width="14" height="4" fill="#64748b" />
    </g>
  )
}

function PlantSprite({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="0" cy="0" r="14" fill="#16a34a" />
      <circle cx="-10" cy="4" r="8" fill="#22c55e" />
      <circle cx="10" cy="6" r="8" fill="#15803d" />
      <rect x="-10" y="10" width="20" height="10" rx="2" fill="#b45309" />
    </g>
  )
}

function WaterCoolerSprite({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-14" y="-2" width="28" height="44" rx="4" fill="#e2e8f0" stroke="#cbd5e1" />
      <circle cx="0" cy="-8" r="10" fill="#bfdbfe" stroke="#93c5fd" />
      <rect x="-8" y="44" width="16" height="6" rx="2" fill="#94a3b8" />
      <circle cx="-6" cy="18" r="1.8" fill="#0ea5e9" />
      <circle cx="6" cy="18" r="1.8" fill="#ef4444" />
    </g>
  )
}

export function OfficeView({
  agentRows,
  missionRunning,
  onViewOutput,
  selectedOutputAgentId,
  activeTemplateName,
  processType,
}: OfficeViewProps) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

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

  const sceneWidth = 900
  const sceneHeight = 430
  const footerHeight = 42
  const sessionCount = agentRows.filter((row) => Boolean(row.sessionKey)).length
  const activeCount = agentRows.filter((row) => row.status === 'active').length
  const hour = now.getHours()
  const minute = now.getMinutes()
  const second = now.getSeconds()
  const minuteAngle = minute * 6 + second * 0.1 - 90
  const hourAngle = ((hour % 12) + minute / 60) * 30 - 90
  const deskEntries = agentRows.map((agent, index) => {
    const slot = OFFICE_DESK_SLOTS[index % OFFICE_DESK_SLOTS.length]
    const loop = Math.floor(index / OFFICE_DESK_SLOTS.length)
    const jitter = (loop % 3) * 12
    const point = projectIsometric(slot.col + (loop > 0 ? (loop % 2 === 0 ? -1 : 1) : 0), slot.row + Math.floor(loop / 2))
    return { agent, index, x: point.x + jitter, y: point.y + loop * 10 }
  })

  return (
    <div className="h-full min-h-[400px] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50/80 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-semibold text-neutral-900">ClawSuite Office</span>
          <span className="text-[11px] text-neutral-400">·</span>
          <span className="text-[11px] text-neutral-600">{agentRows.length} agents</span>
          <span className="text-[11px] text-neutral-400">·</span>
          <span className="text-[11px] text-neutral-600">{activeCount} active</span>
          {activeTemplateName ? (
            <>
              <span className="text-[11px] text-neutral-400">·</span>
              <span className="truncate text-[11px] text-neutral-500">{activeTemplateName}</span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {missionRunning ? (
            <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              <span className="relative flex size-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
          ) : null}
          <span className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
            {processType}
          </span>
        </div>
      </div>

      <div className="relative min-h-[400px]">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[430px] opacity-85"
          style={{
            backgroundColor: '#f8fbff',
            backgroundImage:
              'linear-gradient(45deg, #e0efff 25%, transparent 25%), linear-gradient(-45deg, #e0efff 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d3e7ff 75%), linear-gradient(-45deg, transparent 75%, #d3e7ff 75%)',
            backgroundSize: '44px 44px',
            backgroundPosition: '0 0, 0 22px, 22px -22px, -22px 0',
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/70 via-transparent to-white/20" />

        <svg
          viewBox={`0 0 ${sceneWidth} ${sceneHeight}`}
          className="absolute inset-0 h-[430px] w-full"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          <defs>
            <linearGradient id="wallFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#eef6ff" stopOpacity="0.7" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width={sceneWidth} height="92" fill="url(#wallFade)" />
          <rect x="0" y="92" width={sceneWidth} height="2" fill="#dbeafe" />

          <g opacity="0.7">
            <line x1="185" y1="96" x2="95" y2="235" stroke="#dbeafe" strokeWidth="2" />
            <line x1="715" y1="96" x2="805" y2="235" stroke="#dbeafe" strokeWidth="2" />
          </g>

          <rect x="54" y="46" width="92" height="58" rx="10" fill="#ffffff" stroke="#dbeafe" />
          <circle cx="100" cy="75" r="18" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
          <line
            x1="100"
            y1="75"
            x2={100 + Math.cos((hourAngle * Math.PI) / 180) * 9}
            y2={75 + Math.sin((hourAngle * Math.PI) / 180) * 9}
            stroke="#334155"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <line
            x1="100"
            y1="75"
            x2={100 + Math.cos((minuteAngle * Math.PI) / 180) * 13}
            y2={75 + Math.sin((minuteAngle * Math.PI) / 180) * 13}
            stroke="#0ea5e9"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="100" cy="75" r="2" fill="#334155" />

          <PlantSprite x={790} y={88} />
          <PlantSprite x={835} y={105} />
          <WaterCoolerSprite x={825} y={280} />

          {deskEntries.map(({ index, x, y }) => {
            const accent = AGENT_ACCENT_COLORS[index % AGENT_ACCENT_COLORS.length]
            return <DeskSprite key={`desk-${index}`} x={x} y={y} accent={accent.hex} />
          })}
        </svg>

        {deskEntries.map(({ agent, index, x, y }) => {
          const accent = AGENT_ACCENT_COLORS[index % AGENT_ACCENT_COLORS.length]
          const isSelected = agent.id === selectedOutputAgentId
          const isActive = agent.status === 'active'
          const statusMeta = getAgentStatusMeta(agent.status)
          const avatarSize = 34
          const left = `calc(${(x / sceneWidth) * 100}% - ${avatarSize / 2}px)`
          const top = `calc(${(y / sceneHeight) * 100}% + 8px)`

          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => onViewOutput(agent.id)}
              className={cn(
                'group absolute z-10 flex w-28 flex-col items-center rounded-lg px-1.5 py-1 text-left transition-transform',
                'hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
                isSelected ? 'ring-2 ring-orange-300 bg-white/80 shadow-sm' : 'bg-white/55',
              )}
              style={{ left, top }}
              title={`${agent.name} · ${statusMeta.label}`}
            >
              <div className="relative flex items-center justify-center">
                <div className={cn('rounded-md border border-white/90 p-1 shadow-sm backdrop-blur', accent.avatar)}>
                  <AgentAvatar index={index} color={accent.hex} size={avatarSize} />
                </div>
                <span
                  className={cn(
                    'absolute -right-1 -top-1 size-2.5 rounded-full border border-white',
                    getOfficeStatusDotClass(agent.status),
                  )}
                />
              </div>

              {isActive ? (
                <span className="mt-1 inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                  <span className="size-1 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="size-1 rounded-full bg-emerald-500 animate-pulse [animation-delay:120ms]" />
                  <span className="size-1 rounded-full bg-emerald-500 animate-pulse [animation-delay:240ms]" />
                </span>
              ) : null}

              <span className="mt-1 max-w-full truncate text-[10px] font-semibold text-neutral-800">{agent.name}</span>
              <span className="max-w-full truncate text-[9px] text-neutral-500">{getOfficeModelLabel(agent.modelId)}</span>
            </button>
          )
        })}

        <div className="pointer-events-none absolute bottom-14 left-3 rounded-lg border border-white/70 bg-white/75 px-2 py-1 text-[10px] text-neutral-600 shadow-sm backdrop-blur">
          <span className="font-medium text-neutral-800">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <span className="mx-1 text-neutral-300">·</span>
          <span>Office clock</span>
        </div>
      </div>

      <div className="flex h-[42px] items-center justify-between border-t border-neutral-200 bg-neutral-50 px-3 text-[11px] text-neutral-600">
        <span>ClawSuite Office · {agentRows.length} agents · {sessionCount} sessions</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-500" />
            Active
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-amber-400" />
            Idle
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-neutral-400" />
            No session
          </span>
        </div>
      </div>
    </div>
  )
}
