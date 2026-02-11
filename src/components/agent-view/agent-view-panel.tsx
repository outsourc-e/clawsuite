import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowExpand01Icon,
  ArrowRight01Icon,
  BotIcon,
  Cancel01Icon,
  Link01Icon,
} from '@hugeicons/core-free-icons'
import { useNavigate } from '@tanstack/react-router'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { AgentCard } from './agent-card'
import { SwarmConnectionOverlay } from './swarm-connection-overlay'
import { useAgentSpawn } from './hooks/use-agent-spawn'
import type { AgentNode, AgentNodeStatus, AgentStatusBubble } from './agent-card'
import type { SwarmConnectionLine } from './swarm-connection-overlay'
import type { ActiveAgent } from '@/hooks/use-agent-view'
import { AgentChatModal } from '@/components/agent-chat/AgentChatModal'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  ScrollAreaCorner,
  ScrollAreaRoot,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from '@/components/ui/scroll-area'
import {
  formatCost,
  useAgentView,
} from '@/hooks/use-agent-view'
import { useSounds } from '@/hooks/use-sounds'
import { OrchestratorAvatar } from '@/components/orchestrator-avatar'
import { useOrchestratorState } from '@/hooks/use-orchestrator-state'
import { cn } from '@/lib/utils'

function getLastUserMessageBubbleElement(): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(
    '[data-chat-message-role="user"] [data-chat-message-bubble="true"]',
  )
  return nodes.item(nodes.length - 1)
}

function formatRelativeMs(msAgo: number): string {
  const seconds = Math.max(0, Math.floor(msAgo / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ago`
}

const AGENT_NAME_KEY = 'clawsuite-agent-name'

function getStoredAgentName(): string {
  try {
    const v = localStorage.getItem(AGENT_NAME_KEY)
    if (v && v.trim()) return v.trim()
  } catch { /* noop */ }
  return ''
}

const STATE_GLOW: Record<string, string> = {
  idle: 'border-primary-300/70',
  reading: 'border-blue-400/50 shadow-[0_0_8px_rgba(59,130,246,0.15)]',
  thinking: 'border-yellow-400/50 shadow-[0_0_8px_rgba(234,179,8,0.15)]',
  responding: 'border-emerald-400/50 shadow-[0_0_8px_rgba(34,197,94,0.2)]',
  'tool-use': 'border-violet-400/50 shadow-[0_0_8px_rgba(139,92,246,0.15)]',
  orchestrating: 'border-orange-400/50 shadow-[0_0_8px_rgba(249,115,22,0.2)]',
}

function OrchestratorCard({ compact = false }: { compact?: boolean }) {
  const { state, label } = useOrchestratorState()
  const glowClass = STATE_GLOW[state] ?? STATE_GLOW.idle

  const [agentName, setAgentName] = useState(getStoredAgentName)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch model from gateway
  const [model, setModel] = useState('')
  useEffect(() => {
    let cancelled = false
    async function fetchModel() {
      try {
        const res = await fetch('/api/session-status')
        if (!res.ok) return
        const data = await res.json()
        const payload = data.payload ?? data
        const m = payload.model ?? payload.currentModel ?? ''
        if (!cancelled && m) setModel(String(m))
      } catch { /* noop */ }
    }
    void fetchModel()
    const timer = setInterval(fetchModel, 30_000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  const displayName = agentName || 'Agent'

  function startEdit() {
    setEditValue(agentName)
    setIsEditing(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function commitEdit() {
    const trimmed = editValue.trim()
    setAgentName(trimmed)
    setIsEditing(false)
    try { localStorage.setItem(AGENT_NAME_KEY, trimmed) } catch { /* noop */ }
  }

  return (
    <div
      className={cn(
        'relative rounded-2xl border bg-gradient-to-br from-primary-100/80 via-primary-100/60 to-primary-200/40 transition-all duration-500',
        compact ? 'p-2' : 'p-3',
        glowClass,
      )}
    >
      {state !== 'idle' && (
        <div className="pointer-events-none absolute inset-0 animate-pulse rounded-2xl bg-gradient-to-br from-orange-500/[0.03] to-transparent" />
      )}

      <div className={cn('relative flex items-center', compact ? 'gap-2' : 'flex-col text-center gap-2')}>
        <OrchestratorAvatar size={compact ? 32 : 52} />

        <div className="min-w-0 flex-1">
          <div className={cn('flex items-center gap-1.5', !compact && 'justify-center')}>
            {isEditing ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit()
                  if (e.key === 'Escape') setIsEditing(false)
                }}
                placeholder="Agent name..."
                className="w-24 rounded border border-primary-300/70 bg-primary-50 px-1.5 py-0.5 text-xs font-semibold text-primary-900 outline-none focus:border-orange-400"
                maxLength={20}
              />
            ) : (
              <button
                type="button"
                onClick={startEdit}
                className={cn(
                  'font-semibold text-primary-900 hover:text-orange-600 transition-colors',
                  compact ? 'text-[11px]' : 'text-xs',
                )}
                title="Click to rename"
              >
                {displayName}
              </button>
            )}
            {!compact && (
              <span className="rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[9px] font-medium text-orange-600">
                Main Agent
              </span>
            )}
          </div>
          <p className={cn('text-primary-600', compact ? 'text-[9px]' : 'mt-0.5 text-[10px]')}>
            {label}
          </p>
          {!compact && model && (
            <p className="mt-0.5 truncate text-[9px] font-mono text-primary-500">
              {model}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function MainAgentCollapsible({ viewMode }: { viewMode: 'expanded' | 'compact' }) {
  const [open, setOpen] = useState(true)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between">
        <CollapsibleTrigger className="h-7 px-0 text-xs font-medium hover:bg-transparent">
          <HugeiconsIcon
            icon={open ? ArrowDown01Icon : ArrowRight01Icon}
            size={20}
            strokeWidth={1.5}
          />
          Main Agent
        </CollapsibleTrigger>
      </div>
      <CollapsiblePanel contentClassName="pt-1">
        <OrchestratorCard compact={viewMode === 'compact'} />
      </CollapsiblePanel>
    </Collapsible>
  )
}

function getHistoryPillClassName(status: 'success' | 'failed'): string {
  if (status === 'failed') {
    return 'border-red-500/50 bg-red-500/10 text-red-300'
  }
  return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
}

function getStatusLabel(status: AgentNodeStatus): string {
  if (status === 'failed') return 'failed'
  if (status === 'thinking') return 'thinking'
  if (status === 'complete') return 'complete'
  if (status === 'queued') return 'queued'
  return 'running'
}

function getAgentStatus(agent: ActiveAgent): AgentNodeStatus {
  const status = agent.status.toLowerCase()
  if (status === 'thinking') return 'thinking'
  if (['failed', 'error', 'cancelled', 'canceled', 'killed'].includes(status)) {
    return 'failed'
  }
  if (
    ['complete', 'completed', 'success', 'succeeded', 'done'].includes(status) ||
    agent.progress >= 99
  ) {
    return 'complete'
  }
  return 'running'
}

function getStatusBubble(status: AgentNodeStatus, progress: number): AgentStatusBubble {
  if (status === 'thinking') {
    return { type: 'thinking', text: 'Reasoning through next step' }
  }
  if (status === 'failed') {
    return { type: 'error', text: 'Execution failed, awaiting retry' }
  }
  if (status === 'complete') {
    return { type: 'checkpoint', text: 'Checkpoint complete' }
  }
  if (status === 'queued') {
    return { type: 'question', text: 'Queued for dispatch' }
  }
  const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)))
  return { type: 'checkpoint', text: `${clampedProgress}% complete` }
}

export function AgentViewPanel() {
  // Sound notifications for agent events
  useSounds({ autoPlay: true })

  const {
    isDesktop,
    panelVisible,
    showFloatingToggle,
    panelWidth,
    nowMs,
    lastRefreshedMs,
    activeAgents,
    queuedAgents,
    historyAgents,
    historyOpen,
    isLoading,
    isLiveConnected,
    errorMessage,
    setOpen,
    setHistoryOpen,
    killAgent,
    cancelQueueTask,
    activeCount,
  } = useAgentView()

  const navigate = useNavigate()

  // Transcript modal removed — View button now navigates to /agent-swarm
  const [selectedAgentChat, setSelectedAgentChat] = useState<{
    sessionKey: string
    agentName: string
    statusLabel: string
  } | null>(null)
  const [viewMode, setViewMode] = useState<'expanded' | 'compact'>('compact')

  const totalCost = useMemo(function getTotalCost() {
    return activeAgents.reduce(function sumCost(total, agent) {
      return total + agent.estimatedCost
    }, 0)
  }, [activeAgents])

  const activeNodes = useMemo(function buildActiveNodes() {
    return activeAgents
      .map(function mapAgentToNode(agent) {
        const runtimeSeconds = Math.max(1, Math.floor((nowMs - agent.startedAtMs) / 1000))
        const status = getAgentStatus(agent)

        return {
          id: agent.id,
          name: agent.name,
          task: agent.task,
          model: agent.model,
          progress: agent.progress,
          runtimeSeconds,
          tokenCount: agent.tokenCount,
          cost: agent.estimatedCost,
          status,
          isLive: agent.isLive,
          statusBubble: getStatusBubble(status, agent.progress),
        } satisfies AgentNode
      })
      .sort(function sortByProgressDesc(left, right) {
        if (right.progress !== left.progress) {
          return right.progress - left.progress
        }
        return left.name.localeCompare(right.name)
      })
  }, [activeAgents, nowMs])

  const queuedNodes = useMemo(function buildQueuedNodes() {
    return queuedAgents.map(function mapQueuedAgent(task, index) {
      return {
        id: task.id,
        name: task.name,
        task: task.description,
        model: 'queued',
        progress: 5 + index * 7,
        runtimeSeconds: 0,
        tokenCount: 0,
        cost: 0,
        status: 'queued',
        statusBubble: getStatusBubble('queued', 0),
      } satisfies AgentNode
    })
  }, [queuedAgents])

  const swarmNode = useMemo(function buildSwarmNode() {
    const avgProgress =
      activeAgents.length > 0
        ? Math.round(
            activeAgents.reduce(function sumProgress(total, agent) {
              return total + agent.progress
            }, 0) / activeAgents.length,
          )
        : 0

    return {
      id: 'main-swarm-node',
      name: 'main-orchestrator',
      task: 'Coordinating sub-agents, routing tool calls, and monitoring execution.',
      model: 'swarm',
      progress: avgProgress,
      runtimeSeconds: Math.max(1, Math.floor((nowMs - lastRefreshedMs + 240000) / 1000)),
      tokenCount: activeAgents.reduce(function sumTokens(total, agent) {
        return total + agent.tokenCount
      }, 0),
      cost: totalCost,
      status: 'running',
      statusBubble: getStatusBubble('running', avgProgress),
      isMain: true,
    } satisfies AgentNode
  }, [activeAgents, lastRefreshedMs, nowMs, totalCost])

  const agentSpawn = useAgentSpawn(
    activeNodes.map(function mapActiveNodeId(node) {
      return node.id
    }),
  )
  const shouldReduceMotion = useReducedMotion()
  const networkLayerRef = useRef<HTMLDivElement | null>(null)
  const mainCardRef = useRef<HTMLElement | null>(null)
  const activeCardRefMap = useRef<Map<string, HTMLElement>>(new Map())
  const [sourceBubbleRect, setSourceBubbleRect] = useState<DOMRect | null>(null)
  const [connectionLines, setConnectionLines] = useState<Array<SwarmConnectionLine>>([])
  const [connectionCenterX, setConnectionCenterX] = useState(0)

  const visibleActiveNodes = useMemo(function getVisibleActiveNodes() {
    return activeNodes.filter(function keepRenderedNode(node) {
      return agentSpawn.shouldRenderCard(node.id)
    })
  }, [activeNodes, agentSpawn])

  const spawningNodes = useMemo(function getSpawningNodes() {
    return activeNodes.filter(function keepSpawningNode(node) {
      return agentSpawn.isSpawning(node.id)
    })
  }, [activeNodes, agentSpawn])

  const updateSourceBubbleRect = useCallback(function updateSourceBubbleRect() {
    if (typeof document === 'undefined') return
    const element = getLastUserMessageBubbleElement()
    if (!element) {
      setSourceBubbleRect(null)
      return
    }
    setSourceBubbleRect(element.getBoundingClientRect())
  }, [])

  const setMainCardElement = useCallback(function setMainCardElement(
    element: HTMLElement | null,
  ) {
    mainCardRef.current = element
  }, [])

  const setActiveCardElement = useCallback(function setActiveCardElement(
    agentId: string,
    element: HTMLElement | null,
  ) {
    if (element) {
      activeCardRefMap.current.set(agentId, element)
      return
    }
    activeCardRefMap.current.delete(agentId)
  }, [])

  const updateConnectionLines = useCallback(function updateConnectionLines() {
    const networkElement = networkLayerRef.current
    const sourceElement = mainCardRef.current
    if (!networkElement || !sourceElement || visibleActiveNodes.length === 0) {
      setConnectionLines([])
      return
    }

    const networkRect = networkElement.getBoundingClientRect()
    const sourceRect = sourceElement.getBoundingClientRect()

    // Center X is the horizontal center of the orchestrator card
    const centerX = sourceRect.left + sourceRect.width / 2 - networkRect.left
    setConnectionCenterX(centerX)

    // Start Y is the bottom of the orchestrator card
    const startY = sourceRect.bottom - networkRect.top

    const nextLines = visibleActiveNodes
      .map(function mapNodeToLine(node) {
        const targetElement = activeCardRefMap.current.get(node.id)
        if (!targetElement) return null
        const targetRect = targetElement.getBoundingClientRect()
        // End Y is the top of the agent card
        const endY = targetRect.top - networkRect.top
        return {
          id: node.id,
          status: node.status,
          startY,
          endY,
        } satisfies SwarmConnectionLine
      })
      .filter(function filterMissingLine(line): line is SwarmConnectionLine {
        return line !== null
      })

    setConnectionLines(nextLines)
  }, [visibleActiveNodes])

  useEffect(
    function syncSourceBubbleRect() {
      if (!panelVisible) return
      updateSourceBubbleRect()
      window.addEventListener('resize', updateSourceBubbleRect)
      window.addEventListener('scroll', updateSourceBubbleRect, true)
      return function cleanupSourceBubbleTracking() {
        window.removeEventListener('resize', updateSourceBubbleRect)
        window.removeEventListener('scroll', updateSourceBubbleRect, true)
      }
    },
    [panelVisible, updateSourceBubbleRect],
  )

  useEffect(
    function syncConnectionLines() {
      if (!panelVisible) return
      let animationFrameId = window.requestAnimationFrame(function tick() {
        updateConnectionLines()
        animationFrameId = window.requestAnimationFrame(tick)
      })

      window.addEventListener('resize', updateConnectionLines)
      window.addEventListener('scroll', updateConnectionLines, true)

      return function cleanupConnectionLines() {
        window.cancelAnimationFrame(animationFrameId)
        window.removeEventListener('resize', updateConnectionLines)
        window.removeEventListener('scroll', updateConnectionLines, true)
      }
    },
    [panelVisible, updateConnectionLines],
  )

  const statusCounts = useMemo(function getStatusCounts() {
    return visibleActiveNodes.reduce(
      function summarizeCounts(counts, item) {
        if (item.status === 'thinking') {
          return { ...counts, thinking: counts.thinking + 1 }
        }
        if (item.status === 'failed') {
          return { ...counts, failed: counts.failed + 1 }
        }
        if (item.status === 'complete') {
          return { ...counts, complete: counts.complete + 1 }
        }
        return { ...counts, running: counts.running + 1 }
      },
      { running: 0, thinking: 0, failed: 0, complete: 0 },
    )
  }, [visibleActiveNodes])

  function handleViewByNodeId(_nodeId: string) {
    // Close sidebar and navigate to the full agent swarm view
    setOpen(false)
    navigate({ to: '/agent-swarm' })
  }

  function handleChatByNodeId(nodeId: string) {
    const activeNode = activeNodes.find(function matchActiveNode(node) {
      return node.id === nodeId
    })
    if (activeNode) {
      setSelectedAgentChat({
        sessionKey: activeNode.id,
        agentName: activeNode.name,
        statusLabel: getStatusLabel(activeNode.status),
      })
      return
    }

    const queuedNode = queuedNodes.find(function matchQueuedNode(node) {
      return node.id === nodeId
    })
    if (!queuedNode) return

    setSelectedAgentChat({
      sessionKey: queuedNode.id,
      agentName: queuedNode.name,
      statusLabel: getStatusLabel(queuedNode.status),
    })
  }

  return (
    <>
      {isDesktop ? (
        <motion.aside
          initial={false}
          animate={{ x: panelVisible ? 0 : panelWidth }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
          className={cn(
            'fixed inset-y-0 right-0 z-40 w-80 border-l border-primary-300/70 bg-primary-100/92 backdrop-blur-xl',
            panelVisible ? 'pointer-events-auto' : 'pointer-events-none',
          )}
        >
          <div className="border-b border-primary-300/70 px-3 py-2">
            {/* Row 1: Count left | Title center | Actions right */}
            <div className="flex items-center justify-between">
              {/* Left — active agent count + live indicator */}
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums cursor-default',
                    activeCount > 0
                      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700'
                      : 'border-primary-300/70 bg-primary-200/50 text-primary-700',
                  )}
                  title={`${activeCount} agent${activeCount !== 1 ? 's' : ''} running · ${historyAgents.length} in history · ${queuedAgents.length} queued`}
                >
                  {isLiveConnected ? (
                    <motion.span
                      animate={activeCount > 0 ? { opacity: [0.4, 1, 0.4], scale: [1, 1.2, 1] } : { opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                      className={cn('size-1.5 rounded-full', activeCount > 0 ? 'bg-emerald-400' : 'bg-emerald-400')}
                    />
                  ) : (
                    <span className="size-1.5 rounded-full bg-primary-400/50" />
                  )}
                  {activeCount}
                </span>
              </div>

              {/* Center — title */}
              <h2 className="text-sm font-semibold text-primary-900">Agent Hub</h2>

              {/* Right — expand + close */}
              <div className="flex items-center gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={function handleExpandHub() {
                    setOpen(false)
                    navigate({ to: '/agent-swarm' })
                  }}
                  aria-label="Open Agent Hub"
                  title="Open Agent Hub"
                >
                  <HugeiconsIcon icon={ArrowExpand01Icon} size={16} strokeWidth={1.5} />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={function handleClosePanel() {
                    setOpen(false)
                  }}
                  aria-label="Hide Agent View"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} />
                </Button>
              </div>
            </div>
            {/* Row 2: Stats + view toggle */}
            <div className="mt-1 flex items-center justify-between">
              <p className="text-[10px] text-primary-600 tabular-nums">
                {activeCount} active · {queuedAgents.length} queued · {formatCost(totalCost)}
              </p>
              <div className="inline-flex items-center rounded-full border border-primary-300/70 bg-primary-200/50 p-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn(
                    'h-5 rounded-full px-2 text-[10px]',
                    viewMode === 'expanded' ? 'bg-primary-300/70 text-primary-900' : 'text-primary-700',
                  )}
                  onClick={function handleExpandedMode() {
                    setViewMode('expanded')
                  }}
                >
                  Expanded
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn(
                    'h-5 rounded-full px-2 text-[10px]',
                    viewMode === 'compact' ? 'bg-primary-300/70 text-primary-900' : 'text-primary-700',
                  )}
                  onClick={function handleCompactMode() {
                    setViewMode('compact')
                  }}
                >
                  Compact
                </Button>
              </div>
            </div>
          </div>

          <ScrollAreaRoot className="h-[calc(100vh-3.25rem)]">
            <ScrollAreaViewport>
              <div className="space-y-3 p-3">
                {/* Main Agent Card */}
                <OrchestratorCard compact={viewMode === 'compact'} />

                {/* Swarm — agent cards */}
                <section className="rounded-2xl border border-primary-300/70 bg-primary-200/35 p-1.5">
                  {/* Centered Swarm pill */}
                  <div className="mb-1.5 flex justify-center">
                    <span className="rounded-full border border-primary-300/70 bg-primary-100/80 px-3 py-0.5 text-[10px] font-medium text-primary-600 shadow-sm">
                      swarm
                    </span>
                  </div>

                  <div className="mb-1.5 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-primary-600 tabular-nums">
                        {isLoading
                          ? 'syncing...'
                          : `${statusCounts.running} running · ${statusCounts.thinking} thinking`}
                      </p>
                      {errorMessage ? (
                        <p className="line-clamp-1 text-[10px] text-red-300 tabular-nums">
                          {errorMessage}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right text-[10px] text-primary-500 tabular-nums">
                      <p>{isLoading ? '' : `synced ${formatRelativeMs(nowMs - lastRefreshedMs)}`}</p>
                    </div>
                  </div>

                  <LayoutGroup id="agent-swarm-grid">
                    <motion.div
                      ref={networkLayerRef}
                      layout
                      transition={{ layout: { type: 'spring', stiffness: 320, damping: 30 } }}
                      className="relative rounded-xl border border-primary-300/70 bg-linear-to-b from-primary-100 via-primary-100 to-primary-200/40 p-1.5"
                    >
                      <SwarmConnectionOverlay lines={connectionLines} centerX={connectionCenterX} />

                      <motion.div layout className="mb-1.5">
                        <AgentCard
                          node={swarmNode}
                          layoutId={agentSpawn.getSharedLayoutId(swarmNode.id)}
                          cardRef={setMainCardElement}
                          viewMode={viewMode}
                          className="w-full opacity-70"
                        />
                      </motion.div>

                      <AnimatePresence initial={false}>
                        {spawningNodes.map(function renderSpawningGhost(node, index) {
                          const fallbackLeft = 24 + index * 14
                          const fallbackTop = 128 + index * 10
                          const width = sourceBubbleRect ? Math.min(sourceBubbleRect.width, 152) : 124
                          const height = sourceBubbleRect ? Math.min(sourceBubbleRect.height, 44) : 32
                          const top = sourceBubbleRect ? sourceBubbleRect.top : fallbackTop
                          const left = sourceBubbleRect
                            ? sourceBubbleRect.left + sourceBubbleRect.width - width
                            : fallbackLeft

                          return (
                            <motion.div
                              key={`spawn-ghost-${node.id}`}
                              layoutId={agentSpawn.getSharedLayoutId(node.id)}
                              initial={
                                shouldReduceMotion
                                  ? { opacity: 0, scale: 0.96 }
                                  : { opacity: 0, scale: 0.9 }
                              }
                              animate={
                                shouldReduceMotion
                                  ? { opacity: 0.65, scale: 1 }
                                  : { opacity: [0.5, 0.85, 0.5], scale: [0.94, 1, 0.94] }
                              }
                              exit={{ opacity: 0, scale: 0.94 }}
                              transition={
                                shouldReduceMotion
                                  ? { duration: 0.12, ease: 'easeOut' }
                                  : { duration: 0.42, ease: 'easeInOut' }
                              }
                              className="pointer-events-none fixed z-30 rounded-full border border-orange-500/40 bg-orange-500/20 shadow-sm backdrop-blur-sm"
                              style={{ top, left, width, height }}
                            />
                          )
                        })}
                      </AnimatePresence>

                      {activeNodes.length > 0 || spawningNodes.length > 0 ? (
                        <motion.div
                          layout
                          transition={{ layout: { type: 'spring', stiffness: 360, damping: 34 } }}
                          className={cn(
                            'grid gap-1.5 items-start',
                            viewMode === 'compact'
                              ? 'grid-cols-2'
                              : 'grid-cols-1',
                          )}
                        >
                          <AnimatePresence mode="popLayout" initial={false}>
                            {visibleActiveNodes.map(function renderActiveNode(node) {
                              return (
                                <motion.div
                                  key={node.id}
                                  layout="position"
                                  initial={{ y: -18, opacity: 0, scale: 0.96 }}
                                  animate={{ y: 0, opacity: 1, scale: 1 }}
                                  exit={{ y: 10, opacity: 0, scale: 0.88 }}
                                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                  className="w-full"
                                >
                                  <AgentCard
                                    node={node}
                                    cardRef={function setNodeCardRef(element) {
                                      setActiveCardElement(node.id, element)
                                    }}
                                    layoutId={agentSpawn.getSharedLayoutId(node.id)}
                                    viewMode={viewMode}
                                    onChat={handleChatByNodeId}
                                    onView={handleViewByNodeId}
                                    onKill={killAgent}
                                    className={cn(
                                      agentSpawn.isSpawning(node.id) ? 'ring-2 ring-orange-500/35' : '',
                                    )}
                                  />
                                </motion.div>
                              )
                            })}
                          </AnimatePresence>
                        </motion.div>
                      ) : (
                        <p className="rounded-xl border border-primary-300/60 bg-primary-200/30 px-2 py-1.5 text-[11px] text-pretty text-primary-700">
                          No active agents.
                        </p>
                      )}

                      {queuedNodes.length > 0 ? (
                        <motion.div layout className="mt-1.5 space-y-1">
                          <p className="text-[10px] text-primary-600 tabular-nums">Queue</p>
                          <motion.div
                            layout
                            className={cn(
                              'grid gap-1.5 items-start',
                              viewMode === 'compact'
                                ? 'grid-cols-2'
                                : 'grid-cols-1',
                            )}
                          >
                            {queuedNodes.map(function renderQueuedNode(node) {
                              return (
                                <div key={node.id} className="w-full">
                                  <AgentCard
                                    node={node}
                                    layoutId={agentSpawn.getCardLayoutId(node.id)}
                                    viewMode={viewMode}
                                    onChat={handleChatByNodeId}
                                    onCancel={cancelQueueTask}
                                  />
                                </div>
                              )
                            })}
                          </motion.div>
                        </motion.div>
                      ) : null}
                    </motion.div>
                  </LayoutGroup>
                </section>

                {/* History */}
                <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
                  <div className="flex items-center justify-between">
                    <CollapsibleTrigger className="h-7 px-0 text-xs font-medium hover:bg-transparent">
                      <HugeiconsIcon
                        icon={historyOpen ? ArrowDown01Icon : ArrowRight01Icon}
                        size={20}
                        strokeWidth={1.5}
                      />
                      History
                    </CollapsibleTrigger>
                    <span className="rounded-full bg-primary-300/70 px-2 py-0.5 text-[11px] text-primary-800 tabular-nums">
                      {historyAgents.length}
                    </span>
                  </div>
                  <CollapsiblePanel contentClassName="pt-1">
                    <div className="flex flex-wrap gap-2">
                      {historyAgents.slice(0, 10).map(function renderHistoryPill(item) {
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={cn(
                              'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] tabular-nums',
                              getHistoryPillClassName(item.status),
                            )}
                            onClick={function handleHistoryView() {
                              handleViewByNodeId(item.id)
                            }}
                          >
                            <HugeiconsIcon icon={Link01Icon} size={20} strokeWidth={1.5} />
                            <span className="truncate">{item.name}</span>
                            <span className="opacity-80">{formatCost(item.cost)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </CollapsiblePanel>
                </Collapsible>
              </div>
            </ScrollAreaViewport>
            <ScrollAreaScrollbar>
              <ScrollAreaThumb />
            </ScrollAreaScrollbar>
            <ScrollAreaCorner />
          </ScrollAreaRoot>
        </motion.aside>
      ) : null}

      <AnimatePresence>
        {showFloatingToggle ? (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={function handleOpenPanel() {
              setOpen(true)
            }}
            className="fixed right-4 bottom-4 z-30 inline-flex size-12 items-center justify-center rounded-full bg-linear-to-br from-orange-500 to-orange-600 text-primary-50 shadow-lg"
            aria-label="Open Agent View"
          >
            <motion.span
              animate={
                activeCount > 0
                  ? {
                      scale: [1, 1.05, 1],
                      opacity: [0.95, 1, 0.95],
                    }
                  : { scale: 1, opacity: 1 }
              }
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              className="inline-flex"
            >
              <HugeiconsIcon icon={BotIcon} size={20} strokeWidth={1.5} />
            </motion.span>
            <span className="absolute -top-1 -right-1 inline-flex size-5 items-center justify-center rounded-full bg-primary-950 text-[11px] font-medium text-primary-50 tabular-nums">
              {activeCount}
            </span>
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AgentChatModal
        open={selectedAgentChat !== null}
        sessionKey={selectedAgentChat?.sessionKey ?? ''}
        agentName={selectedAgentChat?.agentName ?? 'Agent'}
        statusLabel={selectedAgentChat?.statusLabel ?? 'running'}
        onOpenChange={function handleAgentChatOpenChange(nextOpen) {
          if (!nextOpen) {
            setSelectedAgentChat(null)
          }
        }}
      />
    </>
  )
}
