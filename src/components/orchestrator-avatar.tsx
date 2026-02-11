import { memo, useMemo } from 'react'
import type { OrchestratorState } from '@/hooks/use-orchestrator-state'
import { useOrchestratorState } from '@/hooks/use-orchestrator-state'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/* ── OpenClaw-inspired colours ────────────────────────── */

const ORANGE = '#f97316'
const DARK_ORANGE = '#ea580c'
const DARK = '#1a1a2e'
const LIGHT = '#fed7aa'

/* ── Expression helpers ───────────────────────────────── */

function eyeProps(state: OrchestratorState) {
  switch (state) {
    case 'thinking':
      return { ly: 13, ry: 13, rx: 1.4, pupilOff: -1 } // eyes up
    case 'working':
      return { ly: 14.5, ry: 14.5, rx: 1.2, pupilOff: 0 } // focused squint
    case 'orchestrating':
      return { ly: 14, ry: 14, rx: 1.6, pupilOff: 0 } // wide alert
    default:
      return { ly: 14, ry: 14, rx: 1.3, pupilOff: 0 }
  }
}

function mouthPath(state: OrchestratorState): string {
  switch (state) {
    case 'thinking':
      return 'M14,19 Q16,19 18,19' // flat
    case 'working':
      return 'M13.5,18.5 Q16,20.5 18.5,18.5' // smile
    case 'orchestrating':
      return 'M13,18 Q16,21 19,18' // big grin
    default:
      return 'M14,18.5 Q16,19.5 18,18.5' // gentle
  }
}

/* ── CSS keyframes ────────────────────────────────────── */

const STYLE_ID = 'oa-claw-styles'

function ensureStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes oa-breathe {
      0%,100% { transform: scale(1); }
      50% { transform: scale(1.04); }
    }
    @keyframes oa-think-ring {
      0% { stroke-dashoffset: 0; }
      100% { stroke-dashoffset: -60; }
    }
    @keyframes oa-dot1 { 0%,80%,100% { opacity:.15; } 40% { opacity:1; } }
    @keyframes oa-dot2 { 0%,80%,100% { opacity:.15; } 50% { opacity:1; } }
    @keyframes oa-dot3 { 0%,80%,100% { opacity:.15; } 60% { opacity:1; } }
    @keyframes oa-glow {
      0%,100% { opacity:.3; r:17; }
      50% { opacity:.6; r:18; }
    }
    @keyframes oa-ear-twitch {
      0%,90%,100% { transform: rotate(0deg); }
      93% { transform: rotate(-4deg); }
      96% { transform: rotate(4deg); }
    }
    @keyframes oa-tail-wag {
      0%,100% { d: path("M24,26 Q28,22 30,24"); }
      50% { d: path("M24,26 Q28,20 31,22"); }
    }
  `
  document.head.appendChild(style)
}

/* ── SVG: OpenClaw cat avatar ─────────────────────────── */

type AvatarSVGProps = {
  state: OrchestratorState
  activeAgentCount: number
  size: number
}

function ClawAvatarSVG({ state, activeAgentCount, size }: AvatarSVGProps) {
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
      {/* Glow ring — orchestrating */}
      {state === 'orchestrating' && (
        <circle cx="16" cy="16" r="15" fill="none" stroke={ORANGE} strokeWidth="1.5" opacity="0.4">
          <animate attributeName="r" values="15;16;15" dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0.6;0.3" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Thinking dashed ring */}
      {state === 'thinking' && (
        <circle
          cx="16" cy="16" r="14.5"
          fill="none" stroke="#eab308" strokeWidth="1.5"
          strokeDasharray="6 4" opacity="0.6"
          style={{ animation: 'oa-think-ring 2s linear infinite' }}
        />
      )}

      {/* Tail */}
      <path
        d="M24,26 Q28,22 30,24"
        fill="none" stroke={ORANGE} strokeWidth="2" strokeLinecap="round"
        style={{ animation: state === 'orchestrating' ? 'oa-tail-wag 0.6s ease-in-out infinite' : 'none' }}
      />

      {/* Body — rounded */}
      <ellipse cx="16" cy="25" rx="7" ry="5" fill={ORANGE} />

      {/* Head */}
      <circle cx="16" cy="14" r="9" fill={ORANGE} />

      {/* Inner face area */}
      <circle cx="16" cy="15" r="6.5" fill={LIGHT} opacity="0.2" />

      {/* Ears — cat triangles */}
      <g style={{ transformOrigin: '9px 6px', animation: state === 'thinking' ? 'oa-ear-twitch 3s ease-in-out infinite' : 'none' }}>
        <polygon points="8,9 4,2 12,6" fill={ORANGE} stroke={DARK_ORANGE} strokeWidth="0.5" />
        <polygon points="9,8 6,3 11,6.5" fill={LIGHT} opacity="0.3" />
      </g>
      <g style={{ transformOrigin: '23px 6px', animation: state === 'thinking' ? 'oa-ear-twitch 3s ease-in-out infinite 0.2s' : 'none' }}>
        <polygon points="24,9 20,6 28,2" fill={ORANGE} stroke={DARK_ORANGE} strokeWidth="0.5" />
        <polygon points="23,8 21,6.5 26,3" fill={LIGHT} opacity="0.3" />
      </g>

      {/* Eyes */}
      <ellipse cx="12.5" cy={eyes.ly} rx={eyes.rx} ry={state === 'working' ? 0.8 : 1.4} fill={DARK} />
      <ellipse cx="19.5" cy={eyes.ry} rx={eyes.rx} ry={state === 'working' ? 0.8 : 1.4} fill={DARK} />

      {/* Pupil shine */}
      <circle cx={13 + eyes.pupilOff * 0.3} cy={eyes.ly - 0.4} r="0.5" fill="white" opacity="0.9" />
      <circle cx={20 + eyes.pupilOff * 0.3} cy={eyes.ry - 0.4} r="0.5" fill="white" opacity="0.9" />

      {/* Nose — small triangle */}
      <polygon points="16,16.5 15.2,17.5 16.8,17.5" fill={DARK_ORANGE} />

      {/* Whiskers */}
      <line x1="8" y1="16" x2="12" y2="16.5" stroke={DARK} strokeWidth="0.3" opacity="0.4" />
      <line x1="8" y1="17.5" x2="12" y2="17" stroke={DARK} strokeWidth="0.3" opacity="0.4" />
      <line x1="24" y1="16" x2="20" y2="16.5" stroke={DARK} strokeWidth="0.3" opacity="0.4" />
      <line x1="24" y1="17.5" x2="20" y2="17" stroke={DARK} strokeWidth="0.3" opacity="0.4" />

      {/* Mouth */}
      <path d={mouth} fill="none" stroke={DARK} strokeWidth="0.8" strokeLinecap="round" />

      {/* Claw mark on chest — the OpenClaw signature */}
      <g opacity="0.6">
        <line x1="14" y1="22" x2="13" y2="25" stroke={DARK_ORANGE} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="16" y1="22" x2="16" y2="25.5" stroke={DARK_ORANGE} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="18" y1="22" x2="19" y2="25" stroke={DARK_ORANGE} strokeWidth="0.8" strokeLinecap="round" />
      </g>

      {/* Working dots */}
      {state === 'working' && (
        <g>
          <circle cx="12" cy="30" r="1" fill={ORANGE} style={{ animation: 'oa-dot1 1.2s ease-in-out infinite' }} />
          <circle cx="16" cy="30" r="1" fill={ORANGE} style={{ animation: 'oa-dot2 1.2s ease-in-out infinite' }} />
          <circle cx="20" cy="30" r="1" fill={ORANGE} style={{ animation: 'oa-dot3 1.2s ease-in-out infinite' }} />
        </g>
      )}

      {/* Agent count badge — orchestrating */}
      {state === 'orchestrating' && activeAgentCount > 0 && (
        <g>
          <circle cx="26" cy="5" r="5" fill={ORANGE} />
          <text x="26" y="7.5" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold">
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
  size?: number
}

function OrchestratorAvatarComponent({
  waitingForResponse = false,
  isStreaming = false,
  size = 48,
}: OrchestratorAvatarProps) {
  const { state, activeAgentCount } = useOrchestratorState({
    waitingForResponse,
    isStreaming,
  })

  const stateLabel = useMemo(() => {
    switch (state) {
      case 'thinking': return 'Thinking...'
      case 'working': return 'Working...'
      case 'orchestrating': return `Orchestrating ${activeAgentCount} agent${activeAgentCount > 1 ? 's' : ''}`
      default: return 'Idle'
    }
  }, [state, activeAgentCount])

  const dotColor = useMemo(() => {
    switch (state) {
      case 'thinking': return '#eab308'
      case 'working': return '#22c55e'
      case 'orchestrating': return '#f97316'
      default: return '#6b7280'
    }
  }, [state])

  return (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger
          render={
            <div className="flex flex-col items-center gap-1">
              <div
                className="relative flex items-center justify-center rounded-full transition-all duration-300"
                style={{ width: size + 4, height: size + 4 }}
              >
                <ClawAvatarSVG state={state} activeAgentCount={activeAgentCount} size={size} />
                {/* State dot */}
                <span
                  className="absolute bottom-0 right-0 block rounded-full border-2 border-primary-50"
                  style={{
                    width: Math.max(8, size / 6),
                    height: Math.max(8, size / 6),
                    backgroundColor: dotColor,
                    transition: 'background-color 300ms ease',
                  }}
                />
              </div>
              <span className="text-[10px] font-medium text-primary-600">{stateLabel}</span>
            </div>
          }
        />
        <TooltipContent side="bottom" className="text-xs">
          ⚡ Aurora — {stateLabel}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}

export const OrchestratorAvatar = memo(OrchestratorAvatarComponent)
