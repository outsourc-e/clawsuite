/**
 * PixelAvatar — SVG pixel art robot avatar for each agent persona.
 * Each persona gets a unique color scheme. Animated based on status.
 */
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

type PixelAvatarProps = {
  color: string // hex color for the body
  accentColor: string // hex for highlights
  size?: number
  status?: 'running' | 'thinking' | 'complete' | 'failed' | 'idle'
  className?: string
}

/** Color mappings per persona role */
export const PERSONA_COLORS: Record<string, { body: string; accent: string }> = {
  'Roger': { body: '#3b82f6', accent: '#93c5fd' },    // blue
  'Sally': { body: '#a855f7', accent: '#d8b4fe' },     // purple
  'Bill': { body: '#f97316', accent: '#fdba74' },       // orange
  'Ada': { body: '#10b981', accent: '#6ee7b7' },        // green
  'Max': { body: '#f59e0b', accent: '#fcd34d' },        // amber
  'Luna': { body: '#06b6d4', accent: '#67e8f9' },       // cyan
  'Kai': { body: '#eab308', accent: '#fde047' },        // yellow
  'Nova': { body: '#ef4444', accent: '#fca5a5' },       // red
}

export function PixelAvatar({ color, accentColor, size = 32, status = 'idle', className }: PixelAvatarProps) {
  const isActive = status === 'running' || status === 'thinking'
  const s = size / 16 // scale factor (base is 16px grid)

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={cn('pixelated', className)}
      style={{ imageRendering: 'pixelated' }}
      animate={isActive ? { y: [0, -2, 0] } : {}}
      transition={isActive ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut' } : {}}
    >
      {/* Head */}
      <rect x="4" y="1" width="8" height="6" rx="1" fill={color} />
      {/* Eyes */}
      <rect x="5" y="3" width="2" height="2" fill="white" />
      <rect x="9" y="3" width="2" height="2" fill="white" />
      <rect x="6" y="3" width="1" height="1" fill="#1e293b" />
      <rect x="10" y="3" width="1" height="1" fill="#1e293b" />
      {/* Antenna */}
      <rect x="7" y="0" width="2" height="1" fill={accentColor} />
      {/* Body */}
      <rect x="3" y="7" width="10" height="5" rx="1" fill={color} />
      {/* Chest detail */}
      <rect x="6" y="8" width="4" height="3" rx="0.5" fill={accentColor} opacity="0.6" />
      {/* Arms */}
      <rect x="1" y="8" width="2" height="3" rx="0.5" fill={color} />
      <rect x="13" y="8" width="2" height="3" rx="0.5" fill={color} />
      {/* Legs */}
      <rect x="5" y="12" width="2" height="3" rx="0.5" fill={color} />
      <rect x="9" y="12" width="2" height="3" rx="0.5" fill={color} />
      {/* Feet */}
      <rect x="4" y="14" width="3" height="2" rx="0.5" fill={accentColor} />
      <rect x="9" y="14" width="3" height="2" rx="0.5" fill={accentColor} />

      {/* Status indicator glow */}
      {status === 'thinking' && (
        <motion.circle
          cx="14" cy="2" r="1.5"
          fill="#fbbf24"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      )}
      {status === 'complete' && (
        <circle cx="14" cy="2" r="1.5" fill="#34d399" />
      )}
      {status === 'failed' && (
        <circle cx="14" cy="2" r="1.5" fill="#f87171" />
      )}
    </motion.svg>
  )
}
