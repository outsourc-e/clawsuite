import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef } from 'react'
import { PinIcon, RefreshIcon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {ActivityLogEntry, ActivityLogLevel} from '@/hooks/use-activity-log';
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  
  
  useActivityLog
} from '@/hooks/use-activity-log'

export const Route = createFileRoute('/logs')({
  component: LogsRoute,
})

const LOG_LEVELS: Array<ActivityLogLevel> = ['INFO', 'WARN', 'ERROR', 'DEBUG']

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
}

function getLevelClasses(level: ActivityLogLevel): string {
  if (level === 'INFO') {
    return 'border-blue-300 bg-blue-500/10 text-blue-700'
  }
  if (level === 'WARN') {
    return 'border-yellow-300 bg-yellow-500/10 text-yellow-700'
  }
  if (level === 'ERROR') {
    return 'border-red-300 bg-red-500/10 text-red-700'
  }
  return 'border-primary-300 bg-primary-200/50 text-primary-700'
}

function matchesSearch(entry: ActivityLogEntry, search: string): boolean {
  if (!search) return true
  const normalized = search.toLowerCase()
  return (
    entry.message.toLowerCase().includes(normalized) ||
    entry.source.toLowerCase().includes(normalized) ||
    entry.session.toLowerCase().includes(normalized)
  )
}

function LogsRoute() {
  const entries = useActivityLog((state) => state.entries)
  const searchText = useActivityLog((state) => state.searchText)
  const sessionFilter = useActivityLog((state) => state.sessionFilter)
  const autoScroll = useActivityLog((state) => state.autoScroll)
  const levelFilters = useActivityLog((state) => state.levelFilters)
  const setSearchText = useActivityLog((state) => state.setSearchText)
  const setSessionFilter = useActivityLog((state) => state.setSessionFilter)
  const setAutoScroll = useActivityLog((state) => state.setAutoScroll)
  const toggleLevelFilter = useActivityLog((state) => state.toggleLevelFilter)
  const clearEntries = useActivityLog((state) => state.clearEntries)
  const appendMockEntry = useActivityLog((state) => state.appendMockEntry)
  const viewportRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      appendMockEntry()
    }, 1_400)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [appendMockEntry])

  useEffect(() => {
    if (!autoScroll) return
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.scrollTop = viewport.scrollHeight
  }, [autoScroll, entries.length])

  const sessions = useMemo(() => {
    const allSessions = Array.from(
      new Set(entries.map((entry) => entry.session)),
    ).sort()
    return ['all', ...allSessions]
  }, [entries])

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (!levelFilters[entry.level]) return false
      if (sessionFilter !== 'all' && entry.session !== sessionFilter) return false
      return matchesSearch(entry, searchText.trim())
    })
  }, [entries, levelFilters, searchText, sessionFilter])

  return (
    <div className="h-screen bg-surface text-primary-900">
      <div className="mx-auto flex h-full w-full max-w-[1280px] min-w-0 flex-col p-4 sm:p-5">
        <header className="rounded-2xl border border-primary-200 bg-primary-50/85 p-4 backdrop-blur-xl">
          <h1 className="text-balance text-xl font-medium">Activity Log</h1>
          <p className="mt-1 text-pretty text-sm text-primary-600">
            Live session and runtime events across orchestrator, APIs, and agents.
          </p>
        </header>

        <section className="mt-4 flex min-h-0 flex-1 flex-col rounded-2xl border border-primary-200 bg-primary-50/80 p-3 backdrop-blur-xl sm:p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2.5 border-b border-primary-200 pb-3">
            <label className="relative min-w-[220px] flex-1">
              <HugeiconsIcon
                icon={Search01Icon}
                size={20}
                strokeWidth={1.5}
                className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-primary-500"
              />
              <input
                type="text"
                value={searchText}
                onChange={function onChangeSearch(event) {
                  setSearchText(event.target.value)
                }}
                placeholder="Filter logs by message, source, or session"
                className="h-9 w-full rounded-lg border border-primary-200 bg-primary-100/60 pr-3 pl-9 text-sm text-primary-900 outline-none transition-colors focus:border-orange-500/40"
              />
            </label>

            <div className="flex items-center gap-2">
              {LOG_LEVELS.map((level) => (
                <label
                  key={level}
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary-200 bg-primary-100/60 px-2 py-1 text-xs text-primary-700 tabular-nums"
                >
                  <input
                    type="checkbox"
                    checked={levelFilters[level]}
                    onChange={function onChangeLevel() {
                      toggleLevelFilter(level)
                    }}
                    className="size-3.5 accent-orange-500"
                  />
                  <span className={cn('rounded px-1 py-0.5', getLevelClasses(level))}>
                    {level}
                  </span>
                </label>
              ))}
            </div>

            <select
              value={sessionFilter}
              onChange={function onChangeSession(event) {
                setSessionFilter(event.target.value)
              }}
              className="h-9 rounded-lg border border-primary-200 bg-primary-100/60 px-3 text-sm text-primary-900 outline-none focus:border-orange-500/40 tabular-nums"
            >
              {sessions.map((session) => (
                <option key={session} value={session}>
                  {session === 'all' ? 'All Sessions' : session}
                </option>
              ))}
            </select>

            <Button
              variant={autoScroll ? 'secondary' : 'outline'}
              size="sm"
              onClick={function onToggleAutoScroll() {
                setAutoScroll(!autoScroll)
              }}
              className="tabular-nums"
            >
              <HugeiconsIcon icon={PinIcon} size={20} strokeWidth={1.5} />
              {autoScroll ? 'Pinned' : 'Unpinned'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={function onClearEntries() {
                clearEntries()
              }}
              className="tabular-nums"
            >
              <HugeiconsIcon icon={RefreshIcon} size={20} strokeWidth={1.5} />
              Clear
            </Button>
          </div>

          <div className="grid grid-cols-[112px_168px_1fr] gap-2 border-b border-primary-200 px-2 pb-2 text-xs text-primary-500 tabular-nums">
            <span>Timestamp</span>
            <span>Source / Session</span>
            <span>Message</span>
          </div>

          <div ref={viewportRef} className="min-h-0 flex-1 overflow-y-auto">
            {filteredEntries.length === 0 ? (
              <div className="flex h-full items-center justify-center p-8 text-sm text-primary-500 text-pretty">
                No log entries match the current filters.
              </div>
            ) : (
              <div className="space-y-1 py-2">
                {filteredEntries.map((entry) => (
                  <article
                    key={entry.id}
                    className="grid grid-cols-[112px_168px_1fr] gap-2 rounded-lg border border-primary-200 bg-primary-50/80 px-2 py-2 text-sm"
                  >
                    <span className="text-primary-600 tabular-nums">
                      {formatTimestamp(entry.timestamp)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-primary-900 tabular-nums">{entry.source}</div>
                      <div className="truncate text-xs text-primary-500 tabular-nums">
                        {entry.session}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <span
                        className={cn(
                          'mr-2 inline-flex rounded-md border px-1.5 py-0.5 text-[11px] tabular-nums',
                          getLevelClasses(entry.level),
                        )}
                      >
                        {entry.level}
                      </span>
                      <span className="text-pretty text-primary-900">{entry.message}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
