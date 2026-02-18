import { useState } from 'react'
import { cn } from '@/lib/utils'

const FILTERS = ['All', 'Tasks', 'Agents'] as const

type FilterTab = (typeof FILTERS)[number]

export function LiveFeedPanel() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All')

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-primary-200 px-3 py-3">
        <h2 className="text-sm font-semibold text-primary-900 dark:text-neutral-100">
          Live Feed
        </h2>
        <span className="flex items-center gap-1 text-[11px] text-emerald-600">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          Live
        </span>
      </div>

      <div className="flex gap-1 border-b border-primary-100 px-3 py-2">
        {FILTERS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveFilter(tab)}
            className={cn(
              'rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors',
              activeFilter === tab
                ? 'bg-primary-100 text-primary-700 dark:bg-neutral-800 dark:text-neutral-200'
                : 'text-primary-500 hover:bg-primary-50 dark:hover:bg-neutral-800/50',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        <p className="py-8 text-center text-[11px] text-primary-400">
          Listening for events...
        </p>
      </div>
    </div>
  )
}
