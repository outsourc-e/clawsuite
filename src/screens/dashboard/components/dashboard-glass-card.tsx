import { DragDropIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type * as React from 'react'
import type { DashboardIcon } from './dashboard-types'
import { cn } from '@/lib/utils'

type DashboardGlassCardProps = {
  title: string
  description: string
  icon: DashboardIcon
  badge?: string
  titleAccessory?: React.ReactNode
  draggable?: boolean
  className?: string
  children: React.ReactNode
}

export function DashboardGlassCard({
  title,
  description,
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
        'group rounded-2xl border border-primary-200 bg-primary-50/85 p-4 shadow-sm backdrop-blur-xl transition-all duration-200 hover:border-primary-300 md:p-5',
        className,
      )}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary-200 bg-primary-100/70 text-primary-700">
            <HugeiconsIcon icon={icon} size={20} strokeWidth={1.5} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-medium text-ink text-balance">
              {title}
              {titleAccessory ? (
                <span className="ml-2 inline-flex align-middle">{titleAccessory}</span>
              ) : null}
              {badge ? (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  {badge}
                </span>
              ) : null}
            </h2>
            <p className="mt-1 text-sm text-primary-600 text-pretty">{description}</p>
          </div>
        </div>
        {draggable ? (
          <span
            className="widget-drag-handle inline-flex shrink-0 cursor-grab items-center justify-center rounded-md border border-primary-200 bg-primary-100/70 p-1 text-primary-500 hover:border-primary-300 hover:text-primary-700 active:cursor-grabbing"
            title="Drag to reorder"
            aria-label="Drag to reorder"
          >
            <HugeiconsIcon icon={DragDropIcon} size={20} strokeWidth={1.5} />
          </span>
        ) : null}
      </header>
      {children}
    </article>
  )
}
