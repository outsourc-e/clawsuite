import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import type {AgentNode, AgentNodeStatus, AgentStatusBubble} from '@/components/agent-view/agent-card';
import type {SwarmConnectionPath} from '@/components/agent-view/swarm-connection-overlay';
import {
  AgentCard
  
  
  
} from '@/components/agent-view/agent-card'
import {
  SwarmConnectionOverlay
  
} from '@/components/agent-view/swarm-connection-overlay'
import { AgentAvatar } from '@/components/agent-avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/agent-swarm')({
  component: AgentSwarmRoute,
})

type MockAgent = {
  id: string
  name: string
  statusLabel: 'Active' | 'Idle' | 'Running'
  task: string
  progress: number
  model: string
  runtimeSeconds: number
  tokenCount: number
  cost: number
  nodeStatus: AgentNodeStatus
}

type Point = {
  x: number
  y: number
}

const MOCK_AGENTS: Array<MockAgent> = [
  {
    id: 'research-agent',
    name: 'research-agent',
    statusLabel: 'Active',
    task: 'Analyzing market trends for Q4',
    progress: 77,
    model: 'codex',
    runtimeSeconds: 552,
    tokenCount: 44_810,
    cost: 0.264,
    nodeStatus: 'running',
  },
  {
    id: 'code-reviewer',
    name: 'code-reviewer',
    statusLabel: 'Active',
    task: 'Reviewing PR #142 - Auth refactor',
    progress: 49,
    model: 'sonnet',
    runtimeSeconds: 321,
    tokenCount: 28_430,
    cost: 0.182,
    nodeStatus: 'running',
  },
  {
    id: 'email-drafter',
    name: 'email-drafter',
    statusLabel: 'Idle',
    task: 'Waiting for input',
    progress: 0,
    model: 'codex',
    runtimeSeconds: 36,
    tokenCount: 190,
    cost: 0.001,
    nodeStatus: 'thinking',
  },
  {
    id: 'data-pipeline',
    name: 'data-pipeline',
    statusLabel: 'Running',
    task: 'Processing 2.4M records',
    progress: 85,
    model: 'opus',
    runtimeSeconds: 881,
    tokenCount: 86_220,
    cost: 0.533,
    nodeStatus: 'running',
  },
  {
    id: 'content-writer',
    name: 'content-writer',
    statusLabel: 'Active',
    task: 'Drafting blog post on AI trends',
    progress: 62,
    model: 'sonnet',
    runtimeSeconds: 437,
    tokenCount: 33_940,
    cost: 0.214,
    nodeStatus: 'running',
  },
]

function buildConnectionPath(start: Point, end: Point): string {
  const horizontal = Math.max(72, Math.abs(end.x - start.x) * 0.38)
  const controlA = { x: start.x + horizontal, y: start.y }
  const controlB = { x: end.x - horizontal, y: end.y }
  return `M ${start.x} ${start.y} C ${controlA.x} ${controlA.y}, ${controlB.x} ${controlB.y}, ${end.x} ${end.y}`
}

function getStatusBubble(status: AgentNodeStatus, progress: number): AgentStatusBubble {
  if (status === 'thinking') return { type: 'thinking', text: 'Waiting for upstream context' }
  if (status === 'failed') return { type: 'error', text: 'Execution halted' }
  if (status === 'complete') return { type: 'checkpoint', text: 'Checkpoint complete' }
  if (status === 'queued') return { type: 'question', text: 'Queued for dispatch' }
  return { type: 'checkpoint', text: `${Math.round(progress)}% complete` }
}

function AgentSwarmRoute() {
  const [viewMode, setViewMode] = useState<'expanded' | 'compact'>('expanded')
  const [connectionPaths, setConnectionPaths] = useState<Array<SwarmConnectionPath>>([])
  const networkRef = useRef<HTMLDivElement | null>(null)
  const swarmRef = useRef<HTMLElement | null>(null)
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map())

  const agentNodes = useMemo(function mapMockAgentsToNodes() {
    return MOCK_AGENTS.map(function mapAgent(agent) {
      return {
        id: agent.id,
        name: agent.name,
        task: `${agent.task} (${agent.statusLabel})`,
        model: agent.model,
        progress: agent.progress,
        runtimeSeconds: agent.runtimeSeconds,
        tokenCount: agent.tokenCount,
        cost: agent.cost,
        status: agent.nodeStatus,
        isLive: true,
        statusBubble: getStatusBubble(agent.nodeStatus, agent.progress),
      } satisfies AgentNode
    })
  }, [])

  const swarmNode = useMemo(function buildSwarmNode() {
    const avgProgress =
      agentNodes.reduce(function sumProgress(total, node) {
        return total + node.progress
      }, 0) / agentNodes.length

    const totalCost = agentNodes.reduce(function sumCosts(total, node) {
      return total + node.cost
    }, 0)

    const totalTokens = agentNodes.reduce(function sumTokens(total, node) {
      return total + node.tokenCount
    }, 0)

    return {
      id: 'openclaw-orchestrator',
      name: 'openclaw-orchestrator',
      task: 'Coordinating execution graph, task handoffs, and quality gates',
      model: 'swarm',
      progress: avgProgress,
      runtimeSeconds: 1140,
      tokenCount: totalTokens,
      cost: totalCost,
      status: 'running',
      statusBubble: { type: 'checkpoint', text: 'Network synchronized' },
      isMain: true,
      isLive: true,
    } satisfies AgentNode
  }, [agentNodes])

  const statusCounts = useMemo(function getStatusCounts() {
    return {
      running: agentNodes.filter(function isRunning(node) {
        return node.status === 'running'
      }).length + 1,
      thinking: agentNodes.filter(function isThinking(node) {
        return node.status === 'thinking'
      }).length,
      complete: agentNodes.filter(function isComplete(node) {
        return node.status === 'complete'
      }).length,
    }
  }, [agentNodes])

  const totalCost = useMemo(function getTotalCost() {
    return agentNodes.reduce(function sumCosts(total, node) {
      return total + node.cost
    }, 0)
  }, [agentNodes])

  const setSwarmRef = useCallback(function setSwarmRef(element: HTMLElement | null) {
    swarmRef.current = element
  }, [])

  const setNodeRef = useCallback(function setNodeRef(id: string, element: HTMLElement | null) {
    if (element) {
      nodeRefs.current.set(id, element)
      return
    }
    nodeRefs.current.delete(id)
  }, [])

  const updateConnectionPaths = useCallback(function updateConnectionPaths() {
    const networkElement = networkRef.current
    const sourceElement = swarmRef.current

    if (!networkElement || !sourceElement) {
      setConnectionPaths([])
      return
    }

    const networkRect = networkElement.getBoundingClientRect()
    const sourceRect = sourceElement.getBoundingClientRect()

    const start = {
      x: sourceRect.left + sourceRect.width * 0.5 - networkRect.left,
      y: sourceRect.top + sourceRect.height * 0.52 - networkRect.top,
    } satisfies Point

    const nextPaths = agentNodes
      .map(function toPath(node) {
        const targetElement = nodeRefs.current.get(node.id)
        if (!targetElement) return null

        const targetRect = targetElement.getBoundingClientRect()
        const end = {
          x: targetRect.left + targetRect.width * 0.5 - networkRect.left,
          y: targetRect.top + targetRect.height * 0.5 - networkRect.top,
        } satisfies Point

        return {
          id: node.id,
          status: node.status,
          d: buildConnectionPath(start, end),
        } satisfies SwarmConnectionPath
      })
      .filter(function keepPath(path): path is SwarmConnectionPath {
        return path !== null
      })

    setConnectionPaths(nextPaths)
  }, [agentNodes])

  useEffect(
    function syncConnectionLayer() {
      let frame = window.requestAnimationFrame(function tick() {
        updateConnectionPaths()
        frame = window.requestAnimationFrame(tick)
      })

      window.addEventListener('resize', updateConnectionPaths)
      return function cleanup() {
        window.cancelAnimationFrame(frame)
        window.removeEventListener('resize', updateConnectionPaths)
      }
    },
    [updateConnectionPaths],
  )

  return (
    <div className="relative min-h-screen overflow-hidden bg-surface text-primary-900">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-[#090d16] via-[#0b101b] to-[#06080d]" />
      <div className="pointer-events-none absolute -top-40 -right-20 h-120 w-120 rounded-full bg-orange-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 h-120 w-120 rounded-full bg-orange-400/10 blur-3xl" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="rounded-3xl border border-orange-400/25 bg-black/35 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6">
          <header className="mb-5 flex flex-col gap-3 border-b border-orange-300/20 pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-xl font-medium text-orange-100 text-balance sm:text-2xl">
                <AgentAvatar size="sm" />
                Agent Swarm Network
              </h1>
              <p className="mt-1 text-sm text-orange-100/70 text-pretty">
                Full-screen mock demo. Static marketing data, no gateway dependency.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                {statusCounts.running} running
              </span>
              <span className="rounded-full border border-orange-400/35 bg-orange-500/10 px-3 py-1 text-xs text-orange-200">
                {statusCounts.thinking} thinking
              </span>
              <span className="rounded-full border border-orange-300/25 bg-orange-500/5 px-3 py-1 text-xs text-orange-100/80">
                5 agents · ${totalCost.toFixed(2)} est.
              </span>
              <div className="inline-flex items-center rounded-full border border-orange-300/20 bg-black/25 p-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn(
                    'h-7 rounded-full px-3 text-xs',
                    viewMode === 'expanded'
                      ? 'bg-orange-500/25 text-orange-100 hover:bg-orange-500/30'
                      : 'text-orange-100/70 hover:bg-orange-500/15',
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
                    'h-7 rounded-full px-3 text-xs',
                    viewMode === 'compact'
                      ? 'bg-orange-500/25 text-orange-100 hover:bg-orange-500/30'
                      : 'text-orange-100/70 hover:bg-orange-500/15',
                  )}
                  onClick={function handleCompactMode() {
                    setViewMode('compact')
                  }}
                >
                  Compact
                </Button>
              </div>
            </div>
          </header>

          <section className="rounded-3xl border border-orange-300/20 bg-black/30 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <h2 className="text-sm font-medium text-orange-100">Active Network</h2>
                <p className="text-xs text-orange-100/60">rendering static demo topology</p>
              </div>
              <p className="text-right text-xs text-orange-100/70">
                {statusCounts.running} running · {statusCounts.thinking} thinking · {statusCounts.complete} complete
              </p>
            </div>

            <div
              ref={networkRef}
              className="relative min-h-[540px] overflow-hidden rounded-2xl border border-orange-300/15 bg-gradient-to-br from-[#131722]/95 via-[#10141e]/95 to-[#0a0d15]/95 p-3"
            >
              <SwarmConnectionOverlay paths={connectionPaths} className="z-10" />

              <div className="absolute top-[50%] left-[50%] z-30 -translate-x-1/2 -translate-y-1/2" style={{ width: viewMode === 'compact' ? 196 : 260 }}>
                <AgentCard node={swarmNode} cardRef={setSwarmRef} viewMode={viewMode} className="border-orange-300/20 bg-orange-50/80" />
              </div>

              <AnimatePresence mode="popLayout" initial={false}>
                {agentNodes.map(function renderNode(node, index) {
                  const positions = [
                    { left: '50%', top: '8%' },
                    { left: '82%', top: '30%' },
                    { left: '76%', top: '74%' },
                    { left: '24%', top: '74%' },
                    { left: '18%', top: '30%' },
                  ] as const

                  const point = positions[index] ?? positions[0]
                  return (
                    <motion.div
                      key={node.id}
                      layout="position"
                      initial={{ opacity: 0, scale: 0.95, y: 12 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: 'easeOut' }}
                      className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                      style={{ left: point.left, top: point.top, width: viewMode === 'compact' ? 164 : 222 }}
                    >
                      <AgentCard
                        node={node}
                        cardRef={function setNodeCardRef(element) {
                          setNodeRef(node.id, element)
                        }}
                        viewMode={viewMode}
                        className="border-orange-300/20 bg-orange-50/80"
                      />
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </section>
        </section>
      </main>
    </div>
  )
}
