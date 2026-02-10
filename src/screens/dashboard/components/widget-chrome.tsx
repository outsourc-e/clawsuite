import {
  Cancel01Icon,
  DragDropIcon,
  Settings02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type * as React from 'react'
import type { DashboardIcon } from './dashboard-types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type WidgetChromeSize = 'SM' | 'MD' | 'LG'

type WidgetChromeProps = {
  title: string
  icon: DashboardIcon
  size: WidgetChromeSize
  widgetId: string
  children: React.ReactNode
  onClose?: () => void
  onSettings?: () => void
  className?: string
}

function toWidgetNumber(widgetId: string): string {
  const match = widgetId.match(/\d+/)
  if (!match) return widgetId
  return match[0]
}

export function WidgetChrome({
  title,
  icon,
  size,
  widgetId,
  children,
  onClose,
  onSettings,
  className,
}: WidgetChromeProps) {
  return (
    <article
      className={cn(
        'group rounded-2xl border border-primary-200 bg-primary-50/85 p-4 shadow-sm backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md md:p-5',
        className,
      )}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary-200 bg-primary-100/70 text-primary-700">
            <HugeiconsIcon icon={icon} size={20} strokeWidth={1.5} />
          </span>
          <h2 className="min-w-0 truncate text-base font-medium text-ink text-balance">{title}</h2>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span className="widget-drag-handle inline-flex cursor-grab items-center justify-center rounded-md p-1 text-primary-400 hover:text-primary-600 active:cursor-grabbing" title="Drag to reorder">
            <HugeiconsIcon icon={DragDropIcon} size={16} strokeWidth={1.5} />
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-md text-primary-600 hover:bg-primary-100 hover:text-primary-900"
            aria-label="Widget settings"
            onClick={onSettings}
          >
            <HugeiconsIcon icon={Settings02Icon} size={20} strokeWidth={1.5} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-md text-primary-600 hover:bg-primary-100 hover:text-primary-900"
            aria-label="Close widget"
            onClick={onClose}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={20} strokeWidth={1.5} />
          </Button>
        </div>
      </header>

      {children}

      <footer className="mt-4 text-xs text-primary-600 text-pretty tabular-nums">
        Widget {toWidgetNumber(widgetId)} • size {size}
      </footer>
    </article>
  )
}
