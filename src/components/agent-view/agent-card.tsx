import { HugeiconsIcon } from '@hugeicons/react'
import {
  AiChat01Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  CoinsDollarIcon,
  Delete02Icon,
  EyeIcon,
} from '@hugeicons/core-free-icons'
import { AnimatePresence, motion } from 'motion/react'
import { AgentProgress } from './agent-progress'
import type { AgentProgressStatus } from './agent-progress'
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogRoot,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { AgentAvatar } from '@/components/agent-avatar'
import { formatCost, formatRuntime } from '@/hooks/use-agent-view'
import { cn } from '@/lib/utils'

export type AgentNodeStatus = AgentProgressStatus

export type AgentStatusBubbleType =
  | 'thinking'
  | 'checkpoint'
  | 'question'
  | 'error'

export type AgentStatusBubble = {
  type: AgentStatusBubbleType
  text: string
}

export type AgentNode = {
  id: string
  name: string
  task: string
  model: string
  progress: number
  runtimeSeconds: number
  tokenCount: number
  cost: number
  status: AgentNodeStatus
  isLive?: boolean
  statusBubble?: AgentStatusBubble
  isMain?: boolean
}

type AgentCardProps = {
  node: AgentNode
  layoutId?: string
  cardRef?: React.Ref<HTMLElement>
  viewMode?: 'expanded' | 'compact'
  onView?: (nodeId: string) => void
  onChat?: (nodeId: string) => void
  onKill?: (nodeId: string) => void
  onCancel?: (nodeId: string) => void
  className?: string
}

function getModelBadgeClassName(model: string): string {
  if (model === 'opus') return 'bg-violet-500/20 text-violet-200 ring-violet-500/40'
  if (model === 'sonnet') return 'bg-sky-500/20 text-sky-200 ring-sky-500/40'
  if (model === 'codex') return 'bg-orange-500/20 text-orange-200 ring-orange-500/40'
  if (model === 'swarm') return 'bg-primary-300/70 text-primary-800 ring-primary-400/50'
  return 'bg-primary-300/70 text-primary-800 ring-primary-400/50'
}

function getStatusRingClassName(status: AgentNodeStatus): string {
  if (status === 'failed') return 'ring-red-500/70'
  if (status === 'thinking') return 'ring-orange-500/70'
  if (status === 'complete') return 'ring-emerald-500/70'
  if (status === 'queued') return 'ring-primary-500/70'
  return 'ring-emerald-500/70'
}

function getStatusTextClassName(status: AgentNodeStatus): string {
  if (status === 'failed') return 'text-red-300'
  if (status === 'thinking') return 'text-orange-300'
  if (status === 'complete') return 'text-emerald-300'
  if (status === 'queued') return 'text-primary-700'
  return 'text-emerald-300'
}

function getStatusLabel(status: AgentNodeStatus): string {
  if (status === 'failed') return 'failed'
  if (status === 'thinking') return 'thinking'
  if (status === 'complete') return 'complete'
  if (status === 'queued') return 'queued'
  return 'running'
}

function getStatusAdornment(status: AgentNodeStatus): string {
  if (status === 'failed') return '✕'
  if (status === 'thinking') return '🧠'
  if (status === 'complete') return '✓'
  if (status === 'queued') return '···'
  return '···'
}

function shouldPulse(status: AgentNodeStatus): boolean {
  return status === 'running' || status === 'thinking'
}

function getBubbleIcon(type: AgentStatusBubbleType): string {
  if (type === 'thinking') return '💭'
  if (type === 'checkpoint') return '✅'
  if (type === 'question') return '❓'
  return '⚠️'
}

function getBubbleClassName(type: AgentStatusBubbleType): string {
  if (type === 'thinking') return 'border-orange-500/45 bg-orange-500/15 text-orange-200'
  if (type === 'checkpoint') return 'border-emerald-500/45 bg-emerald-500/15 text-emerald-200'
  if (type === 'question') return 'border-primary-500/45 bg-primary-200/65 text-primary-900'
  return 'border-red-500/45 bg-red-500/15 text-red-200'
}

export function AgentCard({
  node,
  layoutId,
  cardRef,
  viewMode = 'expanded',
  onView,
  onChat,
  onKill,
  onCancel,
  className,
}: AgentCardProps) {
  const showActions = !node.isMain
  const isCompact = viewMode === 'compact'

  return (
    <motion.article
      ref={cardRef}
      layout
      layoutId={layoutId}
      initial={false}
      animate={node.status === 'failed' ? { x: [0, -3, 3, -3, 3, 0] } : { x: 0 }}
      transition={{
        layout: { type: 'spring', stiffness: 300, damping: 28 },
        x: { duration: 0.3, ease: 'easeOut' },
      }}
      className={cn(
        'group relative overflow-visible rounded-3xl border border-primary-300/80 bg-primary-100/70 p-2.5 shadow-md backdrop-blur-sm',
        isCompact ? 'w-full rounded-2xl p-2' : 'w-full',
        node.status === 'complete' ? 'opacity-50' : 'opacity-100',
        node.status === 'failed' ? 'shadow-red-600/35' : '',
        className,
      )}
    >
      <div className={cn('flex items-center justify-between gap-2', isCompact ? 'mb-1' : 'mb-2')}>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ring-1',
            getModelBadgeClassName(node.model),
          )}
        >
          {node.model}
        </span>
        <div className="inline-flex items-center gap-1">
          {node.isLive ? (
            <motion.span
              aria-hidden
              animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.15, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              className="size-1.5 rounded-full bg-emerald-400"
            />
          ) : null}
          <span
            className={cn(
              'text-xs font-medium text-balance tabular-nums',
              getStatusTextClassName(node.status),
            )}
          >
            {getStatusLabel(node.status)}
          </span>
        </div>
      </div>

      <div className={cn('relative mx-auto', isCompact ? 'mb-1 size-10' : 'mb-2 size-24')}>
        {isCompact ? (
          <div className="flex size-10 items-center justify-center rounded-full border border-primary-300/70 bg-primary-200/80">
            <AgentAvatar size="sm" />
          </div>
        ) : (
          <>
            <AgentProgress
              value={node.progress}
              status={node.status}
              size={96}
              strokeWidth={5}
              className="absolute inset-0"
            />
            {shouldPulse(node.status) ? (
              <motion.span
                aria-hidden
                animate={{ scale: [1, 1.12, 1], opacity: [0.3, 0.08, 0.3] }}
                transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
                className={cn(
                  'absolute inset-0 rounded-full ring-2',
                  getStatusRingClassName(node.status),
                )}
              />
            ) : null}
            <div className="absolute inset-2 inline-flex items-center justify-center rounded-full border border-primary-300/70 bg-primary-200/80">
              <AgentAvatar size="lg" />
            </div>
          </>
        )}
        <AnimatePresence>
          {node.status === 'complete' ? (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute -right-1 -bottom-1 inline-flex size-6 items-center justify-center rounded-full bg-emerald-500 text-primary-50"
            >
              <HugeiconsIcon icon={CheckmarkCircle01Icon} size={20} strokeWidth={1.5} />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <h4 className="truncate text-center text-xs font-medium text-balance text-primary-900">
        {node.name}
      </h4>
      <p className={cn('truncate text-center text-[11px] text-primary-700', isCompact ? 'mt-0' : 'mt-0.5')}>
        {getStatusAdornment(node.status)}
      </p>

      <div
        className={cn(
          'text-[11px] text-primary-700 tabular-nums',
          isCompact
            ? 'mt-1 rounded-xl border border-primary-300/60 bg-primary-200/30 p-1.5'
            : 'mt-2 max-h-0 overflow-hidden opacity-0 transition-all duration-200 group-hover:max-h-48 group-hover:opacity-100',
        )}
      >
        <p className={cn('text-pretty text-primary-700', isCompact ? 'line-clamp-1' : 'line-clamp-2')}>
          {node.task}
        </p>
        <div className={cn('text-[11px] text-primary-700 tabular-nums', isCompact ? 'mt-1 grid grid-cols-2 gap-1' : 'mt-2 space-y-1')}>
          <div className="flex items-center gap-1 truncate">
            <HugeiconsIcon icon={Clock01Icon} size={20} strokeWidth={1.5} />
            <span className="truncate font-mono">{formatRuntime(node.runtimeSeconds)}</span>
          </div>
          <div className="flex items-center gap-1 truncate">
            <HugeiconsIcon icon={AiChat01Icon} size={20} strokeWidth={1.5} />
            <span className="truncate">{node.tokenCount.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1 truncate">
            <HugeiconsIcon icon={CoinsDollarIcon} size={20} strokeWidth={1.5} />
            <span className="truncate">{formatCost(node.cost)}</span>
          </div>
        </div>

        {showActions ? (
          <div className={cn('space-y-1.5', isCompact ? 'mt-1.5 max-h-0 overflow-hidden opacity-0 transition-all duration-200 group-hover:max-h-32 group-hover:opacity-100' : 'mt-2')}>
            {onChat ? (
              <Button
                variant="secondary"
                size="sm"
                className={cn('w-full justify-center', isCompact ? 'h-6 text-[11px]' : 'h-7')}
                onClick={function handleChatClick() {
                  onChat(node.id)
                }}
              >
                <HugeiconsIcon icon={AiChat01Icon} size={20} strokeWidth={1.5} />
                Chat
              </Button>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              {onView ? (
                <Button
                  variant="outline"
                  size="sm"
                  className={cn('flex-1 justify-center', isCompact ? 'h-6 text-[11px]' : 'h-7')}
                  onClick={function handleViewClick() {
                    onView(node.id)
                  }}
                >
                  <HugeiconsIcon icon={EyeIcon} size={20} strokeWidth={1.5} />
                  View
                </Button>
              ) : null}
            {node.status === 'queued' ? (
              <Button
                variant="ghost"
                size="sm"
                className={cn('flex-1 justify-center', isCompact ? 'h-6 text-[11px]' : 'h-7')}
                onClick={function handleCancelClick() {
                  onCancel?.(node.id)
                }}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={20} strokeWidth={1.5} />
                Cancel
              </Button>
            ) : (
              <AlertDialogRoot>
                <AlertDialogTrigger
                  render={
                    <Button
                      variant="destructive"
                      size="icon-sm"
                      className={cn('rounded-full', isCompact ? 'size-6' : 'size-7')}
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={20} strokeWidth={1.5} />
                    </Button>
                  }
                />
                <AlertDialogContent className="w-[min(420px,90vw)]">
                  <div className="space-y-3 p-4">
                    <AlertDialogTitle>Kill this agent run?</AlertDialogTitle>
                    <AlertDialogDescription className="text-pretty">
                      {node.name} will stop immediately and be moved to history as failed.
                    </AlertDialogDescription>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <AlertDialogCancel className="h-8">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="h-8"
                        onClick={function handleKillConfirm() {
                          onKill?.(node.id)
                        }}
                      >
                        Kill Agent
                      </AlertDialogAction>
                    </div>
                  </div>
                </AlertDialogContent>
              </AlertDialogRoot>
            )}
            </div>
          </div>
        ) : null}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {node.statusBubble ? (
          <motion.div
            key={`${node.statusBubble.type}:${node.statusBubble.text}`}
            initial={{ opacity: 0, scale: 0.84, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.84, y: 6 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={cn(
              'pointer-events-none absolute inset-x-0 -bottom-3 z-10 flex justify-center',
              isCompact ? '-bottom-2.5' : '-bottom-3',
            )}
          >
            <span
              className={cn(
                'inline-flex max-w-[90%] items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium tabular-nums shadow-sm',
                isCompact ? 'text-[9px]' : 'text-[10px]',
                getBubbleClassName(node.statusBubble.type),
              )}
            >
              <span aria-hidden>{getBubbleIcon(node.statusBubble.type)}</span>
              <span className="truncate text-pretty">{node.statusBubble.text}</span>
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  )
}
