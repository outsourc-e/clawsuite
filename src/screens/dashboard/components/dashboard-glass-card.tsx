import { DragDropIcon, MoreVerticalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useRef, useState } from 'react'
import type * as React from 'react'
import type { DashboardIcon } from './dashboard-types'
import { cn } from '@/lib/utils'

export type WidgetTier = 'primary' | 'secondary' | 'tertiary'

type DashboardGlassCardProps = {
  title: string
  description?: string
  icon: DashboardIcon
  badge?: string
  tier?: WidgetTier
  titleAccessory?: React.ReactNode
  draggable?: boolean
  onRemove?: () => void
  className?: string
  children: React.ReactNode
}

export function DashboardGlassCard({
  title,
  icon,
  badge,
  tier = 'secondary',
  titleAccessory,
  draggable = false,
  onRemove,
  className,
  children,
}: DashboardGlassCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  return (
    <article
      role="region"
      aria-label={title}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-xl border transition-colors',
        tier === 'primary' &&
          'border-neutral-200 bg-white px-4 py-3.5 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 md:px-5 md:py-4',
        tier === 'secondary' &&
          'border-neutral-200 bg-white px-3.5 py-3 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 md:px-4 md:py-3',
        tier === 'tertiary' &&
          'border-neutral-200 bg-white px-3 py-2.5 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 md:px-3.5 md:py-2.5',
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent-500 via-accent-400/50 to-transparent"
      />
      <header className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <HugeiconsIcon
            icon={icon}
            size={15}
            strokeWidth={1.5}
            className="shrink-0 text-neutral-600 dark:text-neutral-300"
          />
          <h2 className="truncate text-xs font-semibold text-neutral-900 dark:text-neutral-100">
            {title}
            {titleAccessory ? (
              <span className="ml-1.5 inline-flex align-middle normal-case tracking-normal">
                {titleAccessory}
              </span>
            ) : null}
            {badge ? (
              <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[10px] font-medium normal-case tracking-normal text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                {badge}
              </span>
            ) : null}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {draggable ? (
            <span
              className="widget-drag-handle inline-flex cursor-grab items-center justify-center rounded p-0.5 text-primary-400 hover:text-primary-600 active:cursor-grabbing"
              title="Drag to reorder"
              aria-label="Drag to reorder"
            >
              <HugeiconsIcon icon={DragDropIcon} size={16} strokeWidth={1.5} />
            </span>
          ) : null}
          {onRemove ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="inline-flex items-center justify-center rounded p-0.5 text-primary-400 opacity-0 transition-opacity hover:text-primary-600 group-hover:opacity-100"
                aria-label="Widget options"
                title="Widget options"
              >
                <HugeiconsIcon
                  icon={MoreVerticalIcon}
                  size={16}
                  strokeWidth={1.5}
                />
              </button>
              {menuOpen ? (
                <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-primary-200 bg-primary-50 py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                  <button
                    type="button"
                    onClick={() => {
                      onRemove()
                      setMenuOpen(false)
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs text-primary-600 dark:text-neutral-200 hover:bg-primary-100 dark:hover:bg-primary-800"
                  >
                    Remove from dashboard
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </article>
  )
}
