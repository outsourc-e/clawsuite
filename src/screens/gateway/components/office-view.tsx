import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { AgentWorkingRow, AgentWorkingStatus } from './agents-working-panel'
import type { ModelPresetId } from './team-panel'
import { AGENT_ACCENT_COLORS, AgentAvatar } from './agent-avatar'

export type OfficeViewProps = {
  agentRows: AgentWorkingRow[]
  missionRunning: boolean
  onViewOutput: (agentId: string) => void
  onNewMission?: () => void
  selectedOutputAgentId?: string
  activeTemplateName?: string
  processType: 'sequential' | 'hierarchical' | 'parallel'
  /** Fixed pixel height for the office container (compact mode) */
  containerHeight?: number
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

const DEFAULT_OFFICE_MODEL_BADGE = 'border border-neutral-200 bg-neutral-50 text-neutral-700'

export function getOfficeModelBadge(modelId: string): string {
  return OFFICE_MODEL_BADGE[modelId as ModelPresetId] ?? DEFAULT_OFFICE_MODEL_BADGE
}

export function getOfficeModelLabel(modelId: string): string {
  if (!modelId) return 'Unknown'
  return OFFICE_MODEL_LABEL[modelId as ModelPresetId] ?? modelId.split('/')[1] ?? modelId
}

export function getAgentStatusMeta(status: AgentWorkingStatus): {
  label: string
  className: string
  dotClassName: string
  pulse?: boolean
} {
  switch (status) {
    case 'active': return { label: 'Active', className: 'text-emerald-600', dotClassName: 'bg-emerald-500', pulse: true }
    case 'ready':
    case 'idle': return { label: 'Idle', className: 'text-neutral-600', dotClassName: 'bg-neutral-400' }
    case 'error': return { label: 'Error', className: 'text-red-600', dotClassName: 'bg-red-500' }
    case 'none': return { label: 'Offline', className: 'text-neutral-400', dotClassName: 'bg-neutral-400' }
    case 'spawning': return { label: 'Starting', className: 'text-blue-600', dotClassName: 'bg-blue-500', pulse: true }
    case 'paused': return { label: 'Paused', className: 'text-amber-700', dotClassName: 'bg-amber-500' }
    default: return { label: String(status), className: 'text-neutral-600', dotClassName: 'bg-neutral-400' }
  }
}

// ── Office Layout: 12 desk positions with generous spacing ──
const DESK_POSITIONS = [
  { x: 120, y: 180 }, { x: 310, y: 180 }, { x: 500, y: 180 }, { x: 690, y: 180 },
  { x: 120, y: 320 }, { x: 310, y: 320 }, { x: 500, y: 320 }, { x: 690, y: 320 },
  { x: 215, y: 460 }, { x: 405, y: 460 }, { x: 595, y: 460 }, { x: 785, y: 460 },
]

// Social spots: coffee machine, water cooler, lounge, snack bar
const SOCIAL_SPOTS = [
  { x: 880, y: 140, type: 'coffee' as const },
  { x: 880, y: 300, type: 'water' as const },
  { x: 60, y: 440, type: 'plant' as const },
  { x: 880, y: 460, type: 'snack' as const },
]

function truncateSpeech(text: string, max = 64): string {
  const n = text.replace(/\s+/g, ' ').trim()
  if (!n) return ''
  return n.length <= max ? n : `${n.slice(0, max - 1).trimEnd()}…`
}

function getSpeechLine(agent: AgentWorkingRow, phase: number): string {
  if (agent.status === 'active' && agent.lastLine) return truncateSpeech(agent.lastLine, 60)
  if (agent.currentTask) return `Working on ${truncateSpeech(agent.currentTask, 48)}`
  if (agent.status === 'spawning') return 'Booting up...'
  if (agent.status === 'paused') return 'On break ☕'
  if (agent.status === 'error') return 'Need help!'
  // Idle agents cycle through social activities
  const socialLines = ['Grabbing coffee ☕', 'Checking messages 📱', 'Stretching 🙆', 'Chatting with team 💬', 'Reading docs 📖', 'Getting water 💧']
  if (agent.status === 'idle' || agent.status === 'ready') {
    return socialLines[Math.floor(phase / 4) % socialLines.length]
  }
  return ''
}

function getStatusDotClass(status: AgentWorkingStatus): string {
  switch (status) {
    case 'active': return 'bg-emerald-500'
    case 'idle': case 'ready': case 'none': return 'bg-neutral-400'
    case 'spawning': return 'bg-blue-500'
    case 'paused': return 'bg-amber-500'
    case 'error': return 'bg-red-500'
    default: return 'bg-neutral-400'
  }
}

function getAgentStatusGlowClass(status: AgentWorkingStatus): string {
  switch (status) {
    case 'active':
      return 'office-status-glow-active'
    case 'spawning':
      return 'office-status-glow-starting'
    case 'paused':
      return 'office-status-glow-paused'
    case 'error':
      return 'office-status-glow-error'
    default:
      return 'office-status-glow-idle'
  }
}

function getAgentEmoji(agent: AgentWorkingRow): string | null {
  const row = agent as AgentWorkingRow & { emoji?: string; avatarEmoji?: string }
  const emoji = row.emoji?.trim() || row.avatarEmoji?.trim()
  return emoji || null
}

// ── SVG Office Furniture ──

function DeskSVG({ x, y, occupied, accent }: { x: number; y: number; occupied: boolean; accent?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* Desk surface */}
      <rect x="-40" y="-8" width="80" height="40" rx="4" fill={occupied ? '#f8fafc' : '#f1f5f9'} fillOpacity={occupied ? 0.78 : 0.7} stroke={occupied ? '#dbe4ee' : '#e6edf5'} strokeWidth="1" />
      {/* Desk legs */}
      <rect x="-36" y="32" width="4" height="16" rx="1" fill="#a7b4c6" />
      <rect x="32" y="32" width="4" height="16" rx="1" fill="#a7b4c6" />
      {/* Monitor */}
      {occupied ? (
        <>
          <rect x="-18" y="-28" width="36" height="22" rx="3" fill="#1e293b" />
          <rect x="-15" y="-25" width="30" height="16" rx="1.5" fill={accent || '#3b82f6'} opacity="0.8" />
          <rect x="-3" y="-6" width="6" height="6" rx="1" fill="#64748b" />
        </>
      ) : (
        <>
          <rect x="-18" y="-28" width="36" height="22" rx="3" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1" />
          <rect x="-3" y="-6" width="6" height="6" rx="1" fill="#cbd5e1" />
        </>
      )}
      {/* Chair */}
      <ellipse cx="0" cy="56" rx="14" ry="6" fill={occupied ? (accent ? `${accent}22` : '#dbeafe') : '#f1f5f9'} />
      <rect x="-10" y="48" width="20" height="10" rx="4" fill={occupied ? '#475569' : '#cbd5e1'} />
    </g>
  )
}

function CoffeeMachineSVG({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-20" y="-30" width="40" height="50" rx="5" fill="#78716c" />
      <rect x="-14" y="-24" width="28" height="20" rx="3" fill="#292524" />
      <circle cx="0" cy="-14" r="6" fill="#dc2626" opacity="0.8" />
      <text x="0" y="-11" fontSize="6" fill="white" textAnchor="middle">☕</text>
      <rect x="-16" y="20" width="32" height="6" rx="2" fill="#a8a29e" />
      <text x="0" y="38" fontSize="8" fill="#78716c" textAnchor="middle">Coffee</text>
    </g>
  )
}

function WaterCoolerSVG({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-14" y="-20" width="28" height="40" rx="4" fill="#e2e8f0" stroke="#cbd5e1" />
      <circle cx="0" cy="-26" r="10" fill="#bfdbfe" stroke="#93c5fd" strokeWidth="1.5" />
      <circle cx="-5" cy="0" r="2" fill="#0ea5e9" />
      <circle cx="5" cy="0" r="2" fill="#ef4444" />
      <text x="0" y="32" fontSize="8" fill="#64748b" textAnchor="middle">Water</text>
    </g>
  )
}

function SnackBarSVG({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-24" y="-16" width="48" height="28" rx="4" fill="#fef3c7" stroke="#fbbf24" strokeWidth="1" />
      <text x="0" y="2" fontSize="14" textAnchor="middle">🍪</text>
      <text x="0" y="24" fontSize="8" fill="#92400e" textAnchor="middle">Snacks</text>
    </g>
  )
}

function PlantSVG({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-10" y="6" width="20" height="14" rx="3" fill="#92400e" />
      <circle cx="0" cy="-4" r="14" fill="#16a34a" opacity="0.9" />
      <circle cx="-8" cy="0" r="8" fill="#22c55e" opacity="0.8" />
      <circle cx="8" cy="2" r="7" fill="#15803d" opacity="0.8" />
    </g>
  )
}

export function OfficeView({
  agentRows,
  missionRunning,
  onViewOutput,
  onNewMission,
  selectedOutputAgentId,
  activeTemplateName: _activeTemplateName,
  containerHeight,
}: OfficeViewProps) {
  // When containerHeight is set, we use compact mode: header only (no footer), SVG fills remaining space
  const compact = Boolean(containerHeight)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), 200)
    return () => window.clearInterval(timer)
  }, [])

  if (agentRows.length === 0) {
    return (
      <div className={cn('flex items-center justify-center p-8', compact ? 'h-full' : 'min-h-[320px]')}>
        <div className="text-center">
          <p className="mb-3 text-4xl">🏢</p>
          <p className="text-sm font-medium text-neutral-600">Empty office</p>
          <p className="mt-1 text-xs text-neutral-500">Add agents in Configure to fill the office.</p>
        </div>
      </div>
    )
  }

  const sceneW = 960
  const sceneH = 560
  const activeCount = agentRows.filter((r) => r.status === 'active').length
  const sessionCount = agentRows.filter((r) => Boolean(r.sessionKey)).length
  const phase = tick * 0.2

  // Assign agents to desks, idle agents wander to social spots
  const agentPositions = agentRows.map((agent, index) => {
    const desk = DESK_POSITIONS[index % DESK_POSITIONS.length]
    const isIdle = agent.status === 'idle' || agent.status === 'ready'
    const isPaused = agent.status === 'paused'

    // Idle/paused agents wander between desk and social spots
    if (isIdle || isPaused) {
      const wanderCycle = Math.floor((tick + index * 17) / 25) % 4 // 0=desk, 1=walking, 2=social, 3=walking back
      const socialSpot = SOCIAL_SPOTS[(index + Math.floor(tick / 60)) % SOCIAL_SPOTS.length]
      const t = ((tick + index * 17) % 25) / 25

      if (wanderCycle === 0) {
        // At desk
        return { x: desk.x, y: desk.y - 20, atDesk: true, stationary: true }
      } else if (wanderCycle === 1) {
        // Walking to social spot
        return {
          x: desk.x + (socialSpot.x - desk.x) * t,
          y: desk.y - 20 + (socialSpot.y - desk.y + 10) * t,
          atDesk: false,
          stationary: false,
        }
      } else if (wanderCycle === 2) {
        // At social spot
        const bob = Math.sin(phase + index) * 2
        return { x: socialSpot.x + (index % 2 === 0 ? -20 : 20), y: socialSpot.y + bob, atDesk: false, stationary: true }
      } else {
        // Walking back
        const socialSpotBack = SOCIAL_SPOTS[(index + Math.floor(tick / 60)) % SOCIAL_SPOTS.length]
        return {
          x: socialSpotBack.x + (desk.x - socialSpotBack.x) * t,
          y: socialSpotBack.y + (desk.y - 20 - socialSpotBack.y) * t,
          atDesk: false,
          stationary: false,
        }
      }
    }

    // Active/spawning agents stay at desk
    return { x: desk.x, y: desk.y - 20, atDesk: true, stationary: true }
  })

  return (
    <div className={cn('flex flex-col bg-gradient-to-b from-slate-50 to-neutral-100 dark:from-slate-900 dark:to-slate-800', compact ? 'h-full' : 'min-h-[480px]')}>
      {/* Header bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-white/80 px-4 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-800/80">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-neutral-900 dark:text-white md:text-base">ClawSuite Office</span>
          <span className="truncate text-[11px] text-neutral-500 dark:text-slate-400">{agentRows.length} agents · {activeCount} working · {sessionCount} sessions</span>
        </div>
        <div className="flex items-center gap-2">
          {missionRunning ? (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400">
              <span className="relative flex size-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              Mission Live
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onNewMission?.()}
            className="rounded-full border border-orange-200 bg-orange-50 dark:border-orange-800/50 dark:bg-orange-900/20 px-3 py-1 text-[10px] font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
          >
            + New Mission
          </button>
        </div>
      </div>

      {/* Mobile: compact list instead of desk grid */}
      <div className="flex-1 overflow-y-auto p-3 md:hidden">
        <div className="space-y-2">
          {agentRows.map((agent, index) => {
            const accent = AGENT_ACCENT_COLORS[index % AGENT_ACCENT_COLORS.length]
            const statusMeta = getAgentStatusMeta(agent.status)
            const emoji = getAgentEmoji(agent)
            return (
              <button
                key={`${agent.id}-mobile`}
                type="button"
                onClick={() => onViewOutput(agent.id)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900/70"
              >
                <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', accent.avatar)}>
                  {emoji ? (
                    <span className="text-base leading-none" aria-hidden>{emoji}</span>
                  ) : (
                    <AgentAvatar index={index % 10} color={accent.hex} size={22} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{agent.name}</p>
                  <p className="truncate text-xs text-neutral-500 dark:text-slate-400">{getOfficeModelLabel(agent.modelId)}</p>
                </div>
                <span className={cn('shrink-0 text-xs font-semibold', statusMeta.className)}>{statusMeta.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Desktop office canvas */}
      <div className={cn('relative hidden flex-1 overflow-hidden md:flex', !compact && 'min-h-[440px]')}>
        <style>{`
          @keyframes office-idle-float {
            0%, 100% { transform: translateY(-3px); }
            50% { transform: translateY(3px); }
          }
          @keyframes office-status-glow-green {
            0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.38), 0 0 14px 2px rgba(16, 185, 129, 0.3); }
            50% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0), 0 0 22px 6px rgba(16, 185, 129, 0.38); }
          }
          @keyframes office-status-glow-amber {
            0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.32), 0 0 12px 2px rgba(245, 158, 11, 0.26); }
            50% { box-shadow: 0 0 0 7px rgba(245, 158, 11, 0), 0 0 18px 4px rgba(245, 158, 11, 0.34); }
          }
          @keyframes office-status-glow-blue {
            0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.3), 0 0 12px 2px rgba(59, 130, 246, 0.25); }
            50% { box-shadow: 0 0 0 7px rgba(59, 130, 246, 0), 0 0 18px 4px rgba(59, 130, 246, 0.32); }
          }
          @keyframes office-status-glow-neutral {
            0%, 100% { box-shadow: 0 0 0 0 rgba(115, 115, 115, 0.18), 0 0 10px 2px rgba(115, 115, 115, 0.2); }
            50% { box-shadow: 0 0 0 6px rgba(115, 115, 115, 0), 0 0 14px 3px rgba(115, 115, 115, 0.24); }
          }
          @keyframes office-status-glow-red {
            0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.34), 0 0 12px 2px rgba(239, 68, 68, 0.3); }
            50% { box-shadow: 0 0 0 7px rgba(239, 68, 68, 0), 0 0 19px 5px rgba(239, 68, 68, 0.36); }
          }
          .office-agent-stationary {
            animation: office-idle-float 3s ease-in-out infinite;
          }
          .office-status-glow-active {
            animation: office-status-glow-green 2.2s ease-in-out infinite;
          }
          .office-status-glow-idle {
            animation: office-status-glow-neutral 2.6s ease-in-out infinite;
          }
          .office-status-glow-starting {
            animation: office-status-glow-blue 2.4s ease-in-out infinite;
          }
          .office-status-glow-paused {
            animation: office-status-glow-amber 2.6s ease-in-out infinite;
          }
          .office-status-glow-error {
            animation: office-status-glow-red 2.2s ease-in-out infinite;
          }
        `}</style>

        {/* Floor pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-30 dark:opacity-20"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.35) 1px, transparent 0)',
            backgroundSize: '26px 26px',
          }}
        />

        <svg
          viewBox={`0 0 ${sceneW} ${sceneH}`}
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          {/* Floor zones */}
          <rect x="80" y="140" width="680" height="420" rx="16" fill="#f8fafc" fillOpacity="0.34" stroke="#e4ecf4" strokeWidth="0.8" className="dark:fill-slate-800/20 dark:stroke-slate-700/60" />

          {/* Social zone labels */}
          <text x="880" y="110" fontSize="9" fill="#94a3b8" textAnchor="middle" fontWeight="600" className="uppercase">Break Area</text>

          {/* Furniture */}
          {SOCIAL_SPOTS.map((spot, i) => (
            spot.type === 'coffee' ? <CoffeeMachineSVG key={i} x={spot.x} y={spot.y} /> :
            spot.type === 'water' ? <WaterCoolerSVG key={i} x={spot.x} y={spot.y} /> :
            spot.type === 'snack' ? <SnackBarSVG key={i} x={spot.x} y={spot.y} /> :
            <PlantSVG key={i} x={spot.x} y={spot.y} />
          ))}

          {/* Extra plants */}
          <PlantSVG x={60} y={160} />
          <PlantSVG x={60} y={560} />

          {/* All desks (empty ones too) */}
          {DESK_POSITIONS.map((desk, i) => {
            const occupied = i < agentRows.length
            const accent = occupied ? AGENT_ACCENT_COLORS[i % AGENT_ACCENT_COLORS.length] : undefined
            return <DeskSVG key={`desk-${i}`} x={desk.x} y={desk.y} occupied={occupied} accent={accent?.hex} />
          })}
        </svg>

        {/* Agent avatars (HTML overlay for interactivity) */}
        {agentRows.map((agent, index) => {
          const accent = AGENT_ACCENT_COLORS[index % AGENT_ACCENT_COLORS.length]
          const pos = agentPositions[index]
          const emoji = getAgentEmoji(agent)
          const isSelected = agent.id === selectedOutputAgentId
          const isActive = agent.status === 'active'
          const isIdle = agent.status === 'idle' || agent.status === 'ready'
          const statusMeta = getAgentStatusMeta(agent.status)
          const speechLine = getSpeechLine(agent, tick + index * 7)
          const showSpeech = Boolean(speechLine) && ((tick + index * 3) % 8 < 6)
          const movementTransform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`

          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => onViewOutput(agent.id)}
              className={cn(
                'group absolute z-10 flex flex-col items-center rounded-xl bg-transparent px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
                isSelected && 'ring-2 ring-orange-300/80',
              )}
              style={{
                left: 0,
                top: 0,
                transform: movementTransform,
                transition: 'transform 0.8s ease-in-out',
              }}
              title={`${agent.name} · ${statusMeta.label}`}
            >
              {/* Speech bubble */}
              {showSpeech ? (
                <span className="pointer-events-none relative mb-2 max-w-[180px] rounded-lg bg-white px-3 py-1.5 text-xs leading-snug text-neutral-700 shadow-lg dark:bg-slate-800 dark:text-slate-200">
                  <span className="block truncate">{speechLine}</span>
                  <span className="absolute left-1/2 top-full h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-white dark:bg-slate-800" />
                </span>
              ) : null}

              {/* Avatar */}
              <div
                className={cn(
                  'relative rounded-full transition-transform duration-300 group-hover:scale-105',
                  getAgentStatusGlowClass(agent.status),
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-center rounded-full bg-transparent',
                    pos.stationary && 'office-agent-stationary',
                  )}
                  style={{ width: isActive ? 46 : 40, height: isActive ? 46 : 40 }}
                >
                  {emoji ? (
                    <span className="select-none leading-none" style={{ fontSize: isActive ? 30 : 26 }} aria-hidden>
                      {emoji}
                    </span>
                  ) : (
                    <AgentAvatar
                      index={index % 10}
                      color={accent.hex}
                      size={isActive ? 44 : 38}
                    />
                  )}
                </div>
                {/* Status dot */}
                <span className={cn(
                  'absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-white dark:border-slate-800',
                  getStatusDotClass(agent.status),
                  statusMeta.pulse && 'animate-pulse',
                )} />
              </div>

              {/* Activity indicator */}
              {isActive ? (
                <span className="mt-1 flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                  <span className="size-1 animate-pulse rounded-full bg-emerald-500" />
                  <span className="size-1 animate-pulse rounded-full bg-emerald-500 [animation-delay:120ms]" />
                  <span className="size-1 animate-pulse rounded-full bg-emerald-500 [animation-delay:240ms]" />
                  <span className="ml-0.5">Working</span>
                </span>
              ) : isIdle && !pos.atDesk ? (
                <span className="mt-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                  On break
                </span>
              ) : null}

              {/* Name + model */}
              <span className="mt-1 max-w-full truncate text-[10px] font-semibold text-neutral-800 dark:text-white">{agent.name}</span>
              <span className="max-w-full truncate text-[9px] text-neutral-500 dark:text-slate-400">{getOfficeModelLabel(agent.modelId)}</span>
            </button>
          )
        })}
      </div>

      {/* Footer — hidden in compact mode */}
      {!compact ? (
        <div className="hidden items-center justify-between border-t border-neutral-200 bg-white/80 px-4 py-2 text-[11px] text-neutral-500 backdrop-blur dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-400 md:flex">
          <span>{agentRows.length}/{DESK_POSITIONS.length} desks occupied</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500" /> Working</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-neutral-400" /> Idle</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-red-500" /> Error</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-neutral-400" /> Empty</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
