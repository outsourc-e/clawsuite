import { AnimatePresence, motion } from 'motion/react'
import type { AgentNodeStatus } from './agent-card'
import { cn } from '@/lib/utils'

export type SwarmConnectionPath = {
  id: string
  d: string
  status: AgentNodeStatus
}

type SwarmConnectionOverlayProps = {
  paths: Array<SwarmConnectionPath>
  className?: string
}

type LineMotion = {
  opacity: number | Array<number>
  dashOffset: number | Array<number>
  duration: number
  repeat: number
}

function getLineMotion(status: AgentNodeStatus): LineMotion {
  if (status === 'thinking') {
    return {
      opacity: [0.22, 0.42, 0.22],
      dashOffset: [0, -24],
      duration: 1.8,
      repeat: Infinity,
    }
  }
  if (status === 'complete' || status === 'failed') {
    return {
      opacity: 0,
      dashOffset: -12,
      duration: 0.3,
      repeat: 0,
    }
  }
  return {
    opacity: [0.45, 0.82, 0.45],
    dashOffset: [0, -36],
    duration: 0.9,
    repeat: Infinity,
  }
}

function getLineClassName(status: AgentNodeStatus): string {
  if (status === 'thinking') return 'text-orange-500'
  if (status === 'complete') return 'text-emerald-500'
  if (status === 'failed') return 'text-red-500'
  if (status === 'queued') return 'text-primary-500'
  return 'text-emerald-500'
}

export function SwarmConnectionOverlay({
  paths,
  className,
}: SwarmConnectionOverlayProps) {
  return (
    <svg
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 z-10', className)}
      preserveAspectRatio="none"
    >
      <AnimatePresence initial={false}>
        {paths.map(function renderPath(path) {
          const motionConfig = getLineMotion(path.status)
          return (
            <motion.path
              key={path.id}
              d={path.d}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeDasharray="8 8"
              strokeLinecap="round"
              className={getLineClassName(path.status)}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: 1,
                opacity: motionConfig.opacity,
                strokeDashoffset: motionConfig.dashOffset,
              }}
              exit={{ opacity: 0, pathLength: 0 }}
              transition={{
                pathLength: { duration: 0.25, ease: 'easeOut' },
                opacity: {
                  duration: motionConfig.duration,
                  ease: 'easeInOut',
                  repeat: motionConfig.repeat,
                },
                strokeDashoffset: {
                  duration: motionConfig.duration,
                  ease: 'linear',
                  repeat: motionConfig.repeat,
                },
              }}
            />
          )
        })}
      </AnimatePresence>
    </svg>
  )
}
