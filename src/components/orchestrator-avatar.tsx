import { memo, useMemo } from 'react'
import type { OrchestratorState } from '@/hooks/use-orchestrator-state'
import { useOrchestratorState } from '@/hooks/use-orchestrator-state'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/* ── colour & expression maps ─────────────────────────── */

const BODY = '#f97316'
const HEAD = '#fb923c'
const DARK = '#1a1a2e'

function eyeProps(state: OrchestratorState) {
  // returns [leftEye, rightEye] as {cx,cy,rx?,ry?} overrides
  switch (state) {
    case 'thinking':
      return { ly: 10, ry: 10 } // eyes up
    case 'working':
      return { ly: 12.5, ry: 12.5 } // eyes down (focused)
    case 'orchestrating':
      return { ly: 11, ry: 11 } // normal but wide
    default:
      return { ly: 11.5, ry: 11.5 }
  }
}

function mouthPath(state: OrchestratorState): string {
  switch (state) {
    case 'thinking':
      return 'M13,16 Q16,16 19,16' // flat / neutral
    case 'working':
      return 'M13,15.5 Q16,17 19,15.5' // slight smile
    case 'orchestrating':
      return 'M12.5,15 Q16,18 19.5,15' // big smile
    default:
      return 'M13,15.5 Q16,16.5 19,15.5' // gentle
  }
}

/* ── CSS keyframes (injected once) ────────────────────── */

const STYLE_ID = 'orchestrator-avatar-styles'

function ensureStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes oa-breathe {
      0%,100% { transform: scale(1); }
      50% { transform: scale(1.06); }
    }
    @keyframes oa-think-ring {
      0% { stroke-dashoffset: 0; }
      100% { stroke-dashoffset: -60; }
    }
    @keyframes oa-dot1 { 0%,80%,100% { opacity:.2; } 40% { opacity:1; } }
    @keyframes oa-dot2 { 0%,80%,100% { opacity:.2; } 50% { opacity:1; } }
    @keyframes oa-dot3 { 0%,80%,100% { opacity:.2; } 60% { opacity:1; } }
    @keyframes oa-glow-pulse {
      0%,100% { opacity:.4; transform:scale(1); }
      50% { opacity:.8; transform:scale(1.15); }
    }
  `
  document.head.appendChild(style)
}

/* ── SVG avatar ───────────────────────────────────────── */

type AvatarSVGProps = {
  state: OrchestratorState
  activeAgentCount: number
  size: number
}

function AvatarSVG({ state, activeAgentCount, size }: AvatarSVGProps) {
  ensureStyles()

  const eyes = eyeProps(state)
  const mouth = mouthPath(state)

  const breathe = state === 'idle' ? 'oa-breathe 3s ease-in-out infinite' : 'none'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      style={{ animation: breathe, willChange: 'transform' }}
    >
      {/* Glow ring for orchestrating */}
      {state === 'orchestrating' && (
        <circle
          cx="16"
          cy="16"
          r="15"
          fill="none"
          stroke={BODY}
          strokeWidth="1.5"
          opacity="0.5"
          style={{ animation: 'oa-glow-pulse 1.5s ease-in-out infinite' }}
        />
      )}

      {/* Thinking ring */}
      {state === 'thinking' && (
        <circle
          cx="16"
          cy="16"
          r="14.5"
          fill="none"
          stroke={BODY}
          strokeWidth="1.5"
          strokeDasharray="8 4"
          opacity="0.6"
          style={{ animation: 'oa-think-ring 2s linear infinite' }}
        />
      )}

      {/* Body */}
      <rect x="10" y="20" width="12" height="8" rx="3" fill={BODY} />

      {/* Head */}
      <circle cx="16" cy="12" r="8" fill={HEAD} />

      {/* Eyes */}
      <ellipse cx="13" cy={eyes.ly} rx="1.3" ry={state === 'orchestrating' ? 1.6 : 1.3} fill={DARK} />
      <ellipse cx="19" cy={eyes.ry} rx="1.3" ry={state === 'orchestrating' ? 1.6 : 1.3} fill={DARK} />

      {/* Eye shine */}
      <circle cx="13.5" cy={eyes.ly - 0.5} r="0.4" fill="white" opacity="0.8" />
      <circle cx="19.5" cy={eyes.ry - 0.5} r="0.4" fill="white" opacity="0.8" />

      {/* Mouth */}
      <path d={mouth} fill="none" stroke={DARK} strokeWidth="1" strokeLinecap="round" />

      {/* Working dots */}
      {state === 'working' && (
        <g>
          <circle cx="12" cy="30" r="1" fill={BODY} style={{ animation: 'oa-dot1 1.2s ease-in-out infinite' }} />
          <circle cx="16" cy="30" r="1" fill={BODY} style={{ animation: 'oa-dot2 1.2s ease-in-out infinite' }} />
          <circle cx="20" cy="30" r="1" fill={BODY} style={{ animation: 'oa-dot3 1.2s ease-in-out infinite' }} />
        </g>
      )}

      {/* Agent count badge for orchestrating */}
      {state === 'orchestrating' && activeAgentCount > 0 && (
        <g>
          <circle cx="26" cy="6" r="5" fill={BODY} />
          <text x="26" y="8" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold">
            {activeAgentCount}
          </text>
        </g>
      )}
    </svg>
  )
}

/* ── Main component ───────────────────────────────────── */

type OrchestratorAvatarProps = {
  waitingForResponse?: boolean
  isStreaming?: boolean
}

function OrchestratorAvatarComponent({
  waitingForResponse = false,
  isStreaming = false,
}: OrchestratorAvatarProps) {
  const { state, label, activeAgentCount } = useOrchestratorState({
    waitingForResponse,
    isStreaming,
  })

  const tooltipText = useMemo(() => {
    switch (state) {
      case 'thinking':
        return '⚡ Aurora is thinking...'
      case 'working':
        return '⚡ Aurora is working...'
      case 'orchestrating':
        return `⚡ Aurora is orchestrating ${activeAgentCount} agent${activeAgentCount > 1 ? 's' : ''}...`
      default:
        return '⚡ Aurora — idle'
    }
  }, [state, activeAgentCount])

  return (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="relative flex items-center justify-center rounded-full transition-all duration-300 hover:bg-primary-100/50"
              style={{ width: 36, height: 36 }}
              aria-label={tooltipText}
            >
              <AvatarSVG state={state} activeAgentCount={activeAgentCount} size={32} />
              {/* State indicator dot */}
              <span
                className="absolute bottom-0 right-0 block rounded-full border border-surface"
                style={{
                  width: 8,
                  height: 8,
                  backgroundColor:
                    state === 'idle'
                      ? '#6b7280'
                      : state === 'thinking'
                        ? '#eab308'
                        : state === 'working'
                          ? '#22c55e'
                          : '#f97316',
                  transition: 'background-color 300ms ease',
                }}
              />
            </button>
          }
        />
        <TooltipContent side="bottom" className="text-xs">
          {tooltipText}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}

export const OrchestratorAvatar = memo(OrchestratorAvatarComponent)
