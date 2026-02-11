/**
 * IsometricOffice — Virtual office visualization for AI agent swarm.
 * Isometric 3D-like view with agents working at desks, moving around, and collaborating.
 */
import { motion, AnimatePresence } from 'motion/react'
import { useMemo } from 'react'
import { AgentCharacter } from './agent-character'
import { assignPersona } from '@/lib/agent-personas'
import type { SwarmSession } from '@/stores/agent-swarm-store'
import { cn } from '@/lib/utils'

type IsometricOfficeProps = {
  sessions: SwarmSession[]
  className?: string
}

/** Grid positions for agents on the isometric floor (max 8) */
const GRID_POSITIONS = [
  { x: 20, y: 25 },
  { x: 55, y: 25 },
  { x: 20, y: 55 },
  { x: 55, y: 55 },
  { x: 37, y: 15 },
  { x: 72, y: 40 },
  { x: 37, y: 70 },
  { x: 72, y: 70 },
]

function OfficeFurniture() {
  return (
    <>
      {/* Company monitor/desk in corner */}
      <div
        className="absolute"
        style={{ left: '75%', top: '8%' }}
      >
        <div className="flex flex-col items-center">
          <div className="h-10 w-20 rounded-t-md border border-orange-500/40 bg-slate-800/80 p-1">
            <div className="flex h-full items-center justify-center rounded-sm bg-slate-900/80">
              <span className="text-[7px] font-bold text-orange-400">ClawSuite</span>
            </div>
          </div>
          <div className="h-3 w-2 bg-slate-700" />
          <div className="h-1 w-8 rounded-sm bg-slate-600" />
        </div>
      </div>

      {/* Desk objects scattered */}
      <div className="absolute" style={{ left: '10%', top: '75%' }}>
        <div className="flex flex-col items-center opacity-40">
          <div className="h-6 w-8 rounded-sm bg-slate-700/60" />
          <span className="text-[7px] text-slate-500">📋 Tasks</span>
        </div>
      </div>

      <div className="absolute" style={{ left: '65%', top: '80%' }}>
        <div className="flex flex-col items-center opacity-40">
          <div className="h-5 w-6 rounded-sm bg-slate-700/60" />
          <span className="text-[7px] text-slate-500">💻 Code</span>
        </div>
      </div>
    </>
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
    // Filter to active/thinking sessions, limit to 8
    return sessions
      .filter(s => s.swarmStatus !== 'idle')
      .slice(0, 8)
  }, [sessions])

  if (agentSessions.length === 0 && sessions.length === 0) {
    return <EmptyOffice />
  }

  return (
    <div className={cn('relative h-full w-full overflow-hidden rounded-2xl bg-[#0a0a0f]', className)}>
      {/* Starfield / particle background */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 30 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute size-0.5 rounded-full bg-white/20"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{ opacity: [0.1, 0.4, 0.1] }}
            transition={{
              duration: 2 + Math.random() * 3,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* Isometric perspective container */}
      <div className="flex h-full items-center justify-center p-8">
        <div
          className="relative"
          style={{
            width: '600px',
            height: '400px',
            perspective: '800px',
          }}
        >
          {/* Isometric floor */}
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              transform: 'rotateX(55deg) rotateZ(-45deg)',
              transformStyle: 'preserve-3d',
            }}
          >
            {/* Floor surface */}
            <div className="absolute inset-0 rounded-lg border border-orange-500/30 bg-gradient-to-br from-slate-900/80 to-slate-950/80 shadow-[0_0_40px_rgba(249,115,22,0.15)]">
              {/* Grid lines */}
              <svg className="absolute inset-0 h-full w-full opacity-10" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                    <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgb(249 115 22)" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>

              {/* Floor label */}
              <div className="absolute bottom-3 left-3">
                <span className="text-[10px] font-mono text-orange-500/50 italic">
                  Agent Workspace
                </span>
              </div>
            </div>
          </motion.div>

          {/* Agents (positioned without isometric transform so they stay upright) */}
          <AnimatePresence mode="popLayout">
            {agentSessions.map((session, index) => {
              const pos = GRID_POSITIONS[index % GRID_POSITIONS.length]
              const persona = assignPersona(
                session.key ?? session.friendlyId ?? `session-${index}`,
                session.task ?? session.initialMessage ?? session.label ?? '',
              )

              return (
                <motion.div
                  key={session.key ?? session.friendlyId ?? index}
                  className="absolute"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <AgentCharacter
                    persona={persona}
                    status={session.swarmStatus}
                    task={session.task ?? session.initialMessage ?? undefined}
                  />
                </motion.div>
              )
            })}
          </AnimatePresence>

          {/* Office furniture (in isometric space) */}
          <OfficeFurniture />

          {/* Connection lines between collaborating agents */}
          {agentSessions.length >= 2 && (
            <svg className="absolute inset-0 h-full w-full pointer-events-none" style={{ zIndex: 0 }}>
              {agentSessions.slice(0, -1).map((_, i) => {
                const from = GRID_POSITIONS[i]
                const to = GRID_POSITIONS[i + 1]
                if (!from || !to) return null
                return (
                  <motion.line
                    key={`line-${i}`}
                    x1={`${from.x}%`}
                    y1={`${from.y}%`}
                    x2={`${to.x}%`}
                    y2={`${to.y}%`}
                    stroke="rgba(249,115,22,0.15)"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.5, delay: i * 0.3 }}
                  />
                )
              })}
            </svg>
          )}
        </div>
      </div>

      {/* Session count overlay */}
      <div className="absolute bottom-4 left-4 rounded-lg bg-slate-900/80 px-3 py-1.5 backdrop-blur">
        <span className="text-xs text-slate-400">
          {agentSessions.filter(s => s.swarmStatus === 'running' || s.swarmStatus === 'thinking').length} active
          {' · '}
          {sessions.length} total
        </span>
      </div>

      {/* Time indicator */}
      <div className="absolute bottom-4 right-4 rounded-lg bg-slate-900/80 px-3 py-1.5 backdrop-blur">
        <span className="text-[10px] font-mono text-orange-400/60">
          🦞 ClawSuite Office
        </span>
      </div>
    </div>
  )
}
