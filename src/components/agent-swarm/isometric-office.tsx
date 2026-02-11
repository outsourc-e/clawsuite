/**
 * IsometricOffice — Pixel art virtual office for AI agent swarm.
 * Top-down 2D office with checkered floor, desks, monitors, and pixel robot characters.
 * Inspired by openclaw-world and Gather.town style.
 */
import { motion, AnimatePresence } from 'motion/react'
import { useMemo } from 'react'
import { PixelAvatar, PERSONA_COLORS } from './pixel-avatar'
import { assignPersona } from '@/lib/agent-personas'
import type { SwarmSession } from '@/stores/agent-swarm-store'
import { cn } from '@/lib/utils'

type IsometricOfficeProps = {
  sessions: SwarmSession[]
  className?: string
}

/** Agent desk positions in the office (percentage based) */
const DESK_POSITIONS = [
  { x: 18, y: 28, deskX: 18, deskY: 18 },
  { x: 42, y: 28, deskX: 42, deskY: 18 },
  { x: 66, y: 28, deskX: 66, deskY: 18 },
  { x: 18, y: 55, deskX: 18, deskY: 45 },
  { x: 42, y: 55, deskX: 42, deskY: 45 },
  { x: 66, y: 55, deskX: 66, deskY: 45 },
  { x: 30, y: 78, deskX: 30, deskY: 68 },
  { x: 55, y: 78, deskX: 55, deskY: 68 },
]

/** Meeting table — agents gather here when collaborating */
const MEETING_TABLE = { x: 45, y: 52 }

function CheckeredFloor() {
  const tiles = []
  const cols = 20
  const rows = 14
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isDark = (r + c) % 2 === 0
      tiles.push(
        <rect
          key={`${r}-${c}`}
          x={c * 50}
          y={r * 50}
          width="50"
          height="50"
          fill={isDark ? '#1a1a2e' : '#16213e'}
        />
      )
    }
  }
  return <>{tiles}</>
}

function Desk({ x, y }: { x: number; y: number }) {
  return (
    <g style={{ transform: `translate(${x}%, ${y}%)` }}>
      {/* Desk surface */}
      <rect x="-25" y="0" width="50" height="20" rx="2" fill="#4a5568" opacity="0.8" />
      {/* Desk legs */}
      <rect x="-22" y="18" width="4" height="8" fill="#2d3748" />
      <rect x="18" y="18" width="4" height="8" fill="#2d3748" />
      {/* Monitor */}
      <rect x="-12" y="-16" width="24" height="16" rx="2" fill="#2563eb" />
      <rect x="-10" y="-14" width="20" height="12" rx="1" fill="#1e40af" />
      {/* Monitor stand */}
      <rect x="-3" y="0" width="6" height="4" fill="#4a5568" />
      {/* Screen glow */}
      <rect x="-8" y="-12" width="16" height="8" rx="1" fill="#3b82f6" opacity="0.3" />
    </g>
  )
}

function MeetingTable() {
  return (
    <div
      className="absolute"
      style={{
        left: `${MEETING_TABLE.x}%`,
        top: `${MEETING_TABLE.y}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div className="relative">
        {/* Table */}
        <div className="h-16 w-28 rounded-full bg-slate-600/60 shadow-lg" />
        {/* Chairs (dots around table) */}
        {[0, 60, 120, 180, 240, 300].map((angle) => {
          const rad = (angle * Math.PI) / 180
          const cx = Math.cos(rad) * 42
          const cy = Math.sin(rad) * 24
          return (
            <div
              key={angle}
              className="absolute size-3 rounded-full bg-slate-500/40"
              style={{
                left: `calc(50% + ${cx}px - 6px)`,
                top: `calc(50% + ${cy}px - 6px)`,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

function WaterCooler({ x, y }: { x: number; y: number }) {
  return (
    <div className="absolute flex flex-col items-center" style={{ left: `${x}%`, top: `${y}%` }}>
      <div className="h-5 w-3 rounded-t-sm bg-sky-300/60" />
      <div className="h-8 w-4 rounded-b-sm bg-slate-400/40" />
      <div className="mt-0.5 text-[7px] text-slate-500">💧</div>
    </div>
  )
}

function Plant({ x, y }: { x: number; y: number }) {
  return (
    <div className="absolute" style={{ left: `${x}%`, top: `${y}%` }}>
      <div className="flex flex-col items-center">
        <div className="size-6 rounded-full bg-emerald-600/60" />
        <div className="h-2 w-1.5 bg-amber-700/50" />
        <div className="h-3 w-5 rounded-sm bg-amber-600/40" />
      </div>
    </div>
  )
}

function AgentInOffice({
  session,
  position,
  index,
}: {
  session: SwarmSession
  position: { x: number; y: number }
  index: number
}) {
  const persona = assignPersona(
    session.key ?? session.friendlyId ?? `session-${index}`,
    session.task ?? session.initialMessage ?? session.label ?? '',
  )
  const colors = PERSONA_COLORS[persona.name] ?? { body: '#6b7280', accent: '#9ca3af' }

  return (
    <motion.div
      className="absolute flex flex-col items-center"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: 10 + index,
      }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ delay: index * 0.1 }}
    >
      {/* Chat bubble for thinking */}
      {session.swarmStatus === 'thinking' && (
        <motion.div
          className="mb-1 whitespace-nowrap rounded bg-slate-800/90 px-1.5 py-0.5 text-[8px] text-slate-300"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          💭 thinking...
        </motion.div>
      )}

      {/* Task bubble for running */}
      {session.swarmStatus === 'running' && session.task && (
        <div className="mb-1 max-w-[80px] truncate rounded bg-slate-800/80 px-1.5 py-0.5 text-[7px] text-slate-400">
          {session.task}
        </div>
      )}

      {/* Avatar */}
      <PixelAvatar
        color={colors.body}
        accentColor={colors.accent}
        size={40}
        status={session.swarmStatus}
      />

      {/* Name label */}
      <span className={cn('mt-0.5 text-[10px] font-bold', persona.color)}>
        {persona.name}
      </span>

      {/* Status dot */}
      <div className="flex items-center gap-1">
        <div className={cn(
          'size-1.5 rounded-full',
          session.swarmStatus === 'running' && 'bg-blue-400 animate-pulse',
          session.swarmStatus === 'thinking' && 'bg-amber-400 animate-pulse',
          session.swarmStatus === 'complete' && 'bg-emerald-400',
          session.swarmStatus === 'failed' && 'bg-red-400',
          session.swarmStatus === 'idle' && 'bg-slate-400',
        )} />
        <span className="text-[8px] text-slate-500">{persona.role}</span>
      </div>
    </motion.div>
  )
}

function EmptyOffice() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <span className="text-4xl">🏢</span>
        <p className="mt-2 text-sm text-slate-400">Virtual office is empty</p>
        <p className="text-xs text-slate-500">Spawn agents to see them work here</p>
      </div>
    </div>
  )
}

export function IsometricOffice({ sessions, className }: IsometricOfficeProps) {
  const agentSessions = useMemo(() => {
    return sessions.filter(s => s.swarmStatus !== 'idle').slice(0, 8)
  }, [sessions])

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-[#0d1117]', className)}>
      {/* Checkered floor */}
      <svg className="absolute inset-0 h-full w-full opacity-80" preserveAspectRatio="none">
        <CheckeredFloor />
      </svg>

      {/* Top wall/shelf area */}
      <div className="absolute inset-x-0 top-0 h-[8%] bg-slate-700/40 border-b border-slate-600/30">
        <div className="flex h-full items-center justify-center gap-8 px-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-4 w-12 rounded-sm bg-slate-600/30" />
          ))}
        </div>
      </div>

      {/* Desks with monitors (static furniture) */}
      {DESK_POSITIONS.map((pos, i) => (
        <div
          key={`desk-${i}`}
          className="absolute"
          style={{
            left: `${pos.deskX}%`,
            top: `${pos.deskY}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* Desk */}
          <div className="flex flex-col items-center">
            <div className="h-8 w-10 rounded-t-sm border border-blue-500/40 bg-slate-800/60">
              <div className="m-0.5 h-5 rounded-sm bg-blue-600/30" />
            </div>
            <div className="h-1.5 w-1 bg-slate-500" />
            <div className="h-4 w-14 rounded-sm bg-slate-600/40" />
          </div>
        </div>
      ))}

      {/* Meeting table */}
      <MeetingTable />

      {/* Decorations */}
      <WaterCooler x={5} y={45} />
      <Plant x={3} y={20} />
      <Plant x={93} y={20} />
      <Plant x={93} y={75} />

      {/* Start Chat button */}
      <div className="absolute left-3 top-[10%]">
        <div className="rounded bg-slate-800/80 px-2 py-1 text-[9px] text-slate-400 border border-slate-600/30">
          + Start Chat
        </div>
      </div>

      {/* Agent characters */}
      <AnimatePresence mode="popLayout">
        {agentSessions.map((session, index) => {
          const pos = DESK_POSITIONS[index % DESK_POSITIONS.length]
          return (
            <AgentInOffice
              key={session.key ?? session.friendlyId ?? index}
              session={session}
              position={pos}
              index={index}
            />
          )
        })}
      </AnimatePresence>

      {/* Empty state overlay */}
      {agentSessions.length === 0 && sessions.length === 0 && <EmptyOffice />}

      {/* Office info */}
      <div className="absolute bottom-3 left-3 rounded bg-slate-900/80 px-2 py-1 backdrop-blur">
        <span className="text-[9px] font-mono text-orange-400/60">🦞 ClawSuite Office</span>
      </div>

      <div className="absolute bottom-3 right-3 rounded bg-slate-900/80 px-2 py-1 backdrop-blur">
        <span className="text-[9px] text-slate-500">
          {agentSessions.length} agents · {sessions.length} sessions
        </span>
      </div>
    </div>
  )
}
