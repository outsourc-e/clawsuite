import { DragDropIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type * as React from 'react'
import type { DashboardIcon } from './dashboard-types'
import { cn } from '@/lib/utils'

type DashboardGlassCardProps = {
  title: string
  description?: string
  icon: DashboardIcon
  badge?: string
  titleAccessory?: React.ReactNode
  draggable?: boolean
  className?: string
  children: React.ReactNode
}

export function DashboardGlassCard({
  title,
  icon,
  badge,
  titleAccessory,
  draggable = false,
  className,
  children,
}: DashboardGlassCardProps) {
  return (
    <article
      role="region"
      aria-label={title}
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-xl border border-primary-200 bg-primary-50/90 px-3.5 py-3 transition-colors hover:border-primary-300 dark:bg-primary-50/95 md:px-4 md:py-3',
        className,
      )}
    >
      <header className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <HugeiconsIcon icon={icon} size={15} strokeWidth={1.5} className="shrink-0 text-primary-400" />
          <h2 className="truncate text-xs font-medium uppercase tracking-wide text-primary-500">
            {title}
            {titleAccessory ? (
              <span className="ml-1.5 inline-flex align-middle normal-case tracking-normal">{titleAccessory}</span>
            ) : null}
            {badge ? (
              <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[10px] font-medium normal-case tracking-normal text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                {badge}
              </span>
            ) : null}
          </h2>
        </div>
        {draggable ? (
          <span
            className="widget-drag-handle inline-flex shrink-0 cursor-grab items-center justify-center rounded p-0.5 text-primary-400 hover:text-primary-600 active:cursor-grabbing"
            title="Drag to reorder"
            aria-label="Drag to reorder"
          >
            <HugeiconsIcon icon={DragDropIcon} size={16} strokeWidth={1.5} />
          </span>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </article>
  )
}
