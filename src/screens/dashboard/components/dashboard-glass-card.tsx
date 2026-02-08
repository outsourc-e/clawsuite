import { HugeiconsIcon } from '@hugeicons/react'
import type * as React from 'react'
import type { DashboardIcon } from './dashboard-types'
import { cn } from '@/lib/utils'

type DashboardGlassCardProps = {
  title: string
  description: string
  icon: DashboardIcon
  badge?: string
  className?: string
  children: React.ReactNode
}

export function DashboardGlassCard({
  title,
  description,
  icon,
  badge,
  className,
  children,
}: DashboardGlassCardProps) {
  return (
    <article
      className={cn(
        'group rounded-2xl border border-primary-200 bg-primary-50/85 p-4 shadow-sm backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-300 hover:bg-primary-50/95 hover:shadow-md md:p-5',
        className,
      )}
    >
      <header className="mb-4 flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary-200 bg-primary-100/70 text-primary-700">
          <HugeiconsIcon icon={icon} size={20} strokeWidth={1.5} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-medium text-ink text-balance">
            {title}
            {badge ? (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {badge}
              </span>
            ) : null}
          </h2>
          <p className="mt-1 text-sm text-primary-600 text-pretty">{description}</p>
        </div>
      </header>
      {children}
    </article>
  )
}
