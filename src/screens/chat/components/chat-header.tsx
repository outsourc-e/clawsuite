import { memo, useCallback, useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Folder01Icon,
  ReloadIcon,
} from '@hugeicons/core-free-icons'
import { OpenClawStudioIcon } from '@/components/icons/clawsuite'
import { Button } from '@/components/ui/button'
import { UsageMeter } from '@/components/usage-meter'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

function formatSyncAge(updatedAt: number): string {
  if (updatedAt <= 0) return ''
  const seconds = Math.round((Date.now() - updatedAt) / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  return `${minutes}m ago`
}

type ChatHeaderProps = {
  activeTitle: string
  wrapperRef?: React.Ref<HTMLDivElement>
  onOpenSessions?: () => void
  showFileExplorerButton?: boolean
  fileExplorerCollapsed?: boolean
  onToggleFileExplorer?: () => void
  /** Timestamp (ms) of last successful history fetch */
  dataUpdatedAt?: number
  /** Callback to manually refresh history */
  onRefresh?: () => void
}

function ChatHeaderComponent({
  activeTitle,
  wrapperRef,
  onOpenSessions,
  showFileExplorerButton = false,
  fileExplorerCollapsed = true,
  onToggleFileExplorer,
  dataUpdatedAt = 0,
  onRefresh,
}: ChatHeaderProps) {
  const [syncLabel, setSyncLabel] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (dataUpdatedAt <= 0) return
    const update = () => setSyncLabel(formatSyncAge(dataUpdatedAt))
    update()
    const id = setInterval(update, 5000)
    return () => clearInterval(id)
  }, [dataUpdatedAt])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const isStale = dataUpdatedAt > 0 && Date.now() - dataUpdatedAt > 15000

  const handleRefresh = useCallback(() => {
    if (!onRefresh) return
    setIsRefreshing(true)
    onRefresh()
    setTimeout(() => setIsRefreshing(false), 600)
  }, [onRefresh])

  if (isMobile) {
    return (
      <div
        ref={wrapperRef}
        className="shrink-0 border-b border-primary-200 px-4 h-12 flex items-center justify-between bg-surface"
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenSessions}
            className="shrink-0 rounded-lg transition-transform active:scale-95"
            aria-label="Open sessions"
          >
            <OpenClawStudioIcon className="size-8 rounded-lg" />
          </button>
          <div className="truncate text-sm font-semibold tracking-tight text-ink">
            ClawSuite
          </div>
        </div>

        <div className="flex items-center gap-1">
          {syncLabel ? (
            <span
              className={cn(
                'text-[11px] tabular-nums transition-colors',
                isStale ? 'text-amber-500' : 'text-primary-400',
              )}
              title={
                dataUpdatedAt > 0
                  ? `Last synced: ${new Date(dataUpdatedAt).toLocaleTimeString()}`
                  : undefined
              }
            >
              {isStale ? '⚠ ' : ''}
              {syncLabel}
            </span>
          ) : null}
          {onRefresh ? (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={handleRefresh}
              className="h-10 w-10 text-primary-500 hover:bg-primary-100 hover:text-primary-700"
              aria-label="Refresh chat"
            >
              <HugeiconsIcon
                icon={ReloadIcon}
                size={20}
                strokeWidth={1.5}
                className={cn(isRefreshing && 'animate-spin')}
              />
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={wrapperRef}
      className="shrink-0 border-b border-primary-200 px-4 h-12 flex items-center bg-surface"
    >
      {showFileExplorerButton ? (
        <TooltipProvider>
          <TooltipRoot>
            <TooltipTrigger
              onClick={onToggleFileExplorer}
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="mr-2 text-primary-800 hover:bg-primary-100"
                  aria-label={
                    fileExplorerCollapsed ? 'Show files' : 'Hide files'
                  }
                >
                  <HugeiconsIcon
                    icon={Folder01Icon}
                    size={20}
                    strokeWidth={1.5}
                  />
                </Button>
              }
            />
            <TooltipContent side="bottom">
              {fileExplorerCollapsed ? 'Show files' : 'Hide files'}
            </TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
      ) : null}
      <div
        className="min-w-0 flex-1 truncate text-sm font-medium text-balance"
        suppressHydrationWarning
      >
        {activeTitle}
      </div>
      {syncLabel ? (
        <span
          className={cn(
            'mr-1 text-[11px] tabular-nums transition-colors',
            isStale ? 'text-amber-500' : 'text-primary-400',
          )}
          title={
            dataUpdatedAt > 0
              ? `Last synced: ${new Date(dataUpdatedAt).toLocaleTimeString()}`
              : undefined
          }
        >
          {isStale ? '⚠ ' : ''}
          {syncLabel}
        </span>
      ) : null}
      {onRefresh ? (
        <TooltipProvider>
          <TooltipRoot>
            <TooltipTrigger
              onClick={handleRefresh}
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="mr-1 text-primary-500 hover:bg-primary-100 hover:text-primary-700"
                  aria-label="Refresh chat"
                >
                  <HugeiconsIcon
                    icon={ReloadIcon}
                    size={20}
                    strokeWidth={1.5}
                    className={cn(isRefreshing && 'animate-spin')}
                  />
                </Button>
              }
            />
            <TooltipContent side="bottom">Sync messages</TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
      ) : null}
      <UsageMeter />
    </div>
  )
}

const MemoizedChatHeader = memo(ChatHeaderComponent)

export { MemoizedChatHeader as ChatHeader }
