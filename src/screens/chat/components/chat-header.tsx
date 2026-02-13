import { memo, useCallback, useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Folder01Icon, Menu01Icon, ReloadIcon } from '@hugeicons/core-free-icons'
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
  showSidebarButton?: boolean
  onOpenSidebar?: () => void
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
  showSidebarButton = false,
  onOpenSidebar,
  showFileExplorerButton = false,
  fileExplorerCollapsed = true,
  onToggleFileExplorer,
  dataUpdatedAt = 0,
  onRefresh,
}: ChatHeaderProps) {
  const [syncLabel, setSyncLabel] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    if (dataUpdatedAt <= 0) return
    const update = () => setSyncLabel(formatSyncAge(dataUpdatedAt))
    update()
    const id = setInterval(update, 5000)
    return () => clearInterval(id)
  }, [dataUpdatedAt])

  const isStale = dataUpdatedAt > 0 && Date.now() - dataUpdatedAt > 15000

  const handleRefresh = useCallback(() => {
    if (!onRefresh) return
    setIsRefreshing(true)
    onRefresh()
    setTimeout(() => setIsRefreshing(false), 600)
  }, [onRefresh])

  return (
    <div
      ref={wrapperRef}
      className="shrink-0 border-b border-primary-200 px-4 h-12 flex items-center bg-surface"
    >
      {showSidebarButton ? (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onOpenSidebar}
          className="mr-2 text-primary-800 hover:bg-primary-100"
          aria-label="Open sidebar"
        >
          <HugeiconsIcon icon={Menu01Icon} size={20} strokeWidth={1.5} />
        </Button>
      ) : null}
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
                  aria-label={fileExplorerCollapsed ? 'Show files' : 'Hide files'}
                >
                  <HugeiconsIcon icon={Folder01Icon} size={20} strokeWidth={1.5} />
                </Button>
              }
            />
            <TooltipContent side="bottom">
              {fileExplorerCollapsed ? 'Show files' : 'Hide files'}
            </TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
      ) : null}
      <div className="text-sm font-medium flex-1 text-balance" suppressHydrationWarning>{activeTitle}</div>
      {syncLabel ? (
        <span
          className={cn(
            'mr-1 text-[11px] tabular-nums transition-colors',
            isStale ? 'text-amber-500' : 'text-primary-400',
          )}
          title={dataUpdatedAt > 0 ? `Last synced: ${new Date(dataUpdatedAt).toLocaleTimeString()}` : undefined}
        >
          {isStale ? '⚠ ' : ''}{syncLabel}
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
