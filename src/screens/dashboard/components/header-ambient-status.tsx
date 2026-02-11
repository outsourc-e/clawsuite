/**
 * Compact ambient time + weather readout for the dashboard header.
 * Bordered pill style matching "Studio Overview". Pencil icon opens inline editor.
 */
import { Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDashboardSettings } from '../hooks/use-dashboard-settings'

type WttrCurrentCondition = {
  temp_C?: string
  weatherDesc?: Array<{ value?: string }>
}

type WttrPayload = {
  current_condition?: Array<WttrCurrentCondition>
}

function toWeatherEmoji(condition: string): string {
  const n = condition.toLowerCase()
  if (n.includes('snow') || n.includes('blizzard')) return '❄️'
  if (n.includes('rain') || n.includes('drizzle') || n.includes('storm')) return '🌧️'
  if (n.includes('cloud') || n.includes('overcast')) return '🌤️'
  return '☀️'
}

function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32)
}

function deriveLocationFromTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone?.split('/').pop()?.replace(/_/g, ' ') ?? ''
  } catch {
    return ''
  }
}

async function fetchCompactWeather(location?: string): Promise<{ emoji: string; tempF: number } | null> {
  try {
    const loc = location?.trim() || deriveLocationFromTimezone()
    const url = loc
      ? `https://wttr.in/${encodeURIComponent(loc)}?format=j1`
      : 'https://wttr.in/?format=j1'
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as WttrPayload
    const cur = data.current_condition?.[0]
    const condition = cur?.weatherDesc?.[0]?.value?.trim() ?? 'Unknown'
    const tempC = Number(cur?.temp_C) || 0
    return { emoji: toWeatherEmoji(condition), tempF: cToF(tempC) }
  } catch {
    return null
  }
}

export function HeaderAmbientStatus() {
  const { settings, update } = useDashboardSettings()
  const queryClient = useQueryClient()
  const is12h = settings.clockFormat === '12h'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(settings.weatherLocation)
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Close popover on outside click
  useEffect(() => {
    if (!editing) return
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setEditing(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [editing])

  // Focus input on open
  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const timeStr = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: is12h,
    }).format(now)
  }, [now, is12h])

  const dateStr = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(now)
  }, [now])

  const weatherQuery = useQuery({
    queryKey: ['dashboard', 'weather', settings.weatherLocation],
    queryFn: () => fetchCompactWeather(settings.weatherLocation),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    retry: 1,
  })

  const weather = weatherQuery.data

  function handleSave() {
    update({ weatherLocation: draft.trim() })
    void queryClient.invalidateQueries({ queryKey: ['dashboard', 'weather'] })
    setEditing(false)
  }

  function _handleToggleClock() {
    update({ clockFormat: is12h ? '24h' : '12h' })
  }

  return (
    <div className="relative hidden sm:block">
      {/* Pill — matches Studio Overview border style */}
      <div className="inline-flex items-center gap-2 px-1 text-[11px] text-primary-400 tabular-nums">
        <span>{timeStr}</span>
        <span className="text-primary-300">·</span>
        <span>{dateStr}</span>
        {weather ? (
          <>
            <span className="text-primary-300">·</span>
            <span>{weather.emoji} {weather.tempF}°</span>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => { setDraft(settings.weatherLocation); setEditing(!editing) }}
          className="ml-0.5 rounded p-0.5 text-primary-400 transition-colors hover:text-primary-700"
          aria-label="Edit time and weather settings"
          title="Edit settings"
        >
          <HugeiconsIcon icon={Edit02Icon} size={12} strokeWidth={1.5} />
        </button>
      </div>

      {/* Popover editor */}
      {editing ? (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full z-[9999] mt-2 w-64 rounded-xl border border-primary-200 bg-primary-50 p-3 shadow-xl backdrop-blur-xl dark:bg-primary-100"
        >
          <div className="space-y-3">
            {/* Weather location */}
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-primary-500">
                Weather Location
              </label>
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
                placeholder="ZIP or city (blank = auto)"
                className="mt-1 w-full rounded-lg border border-primary-200 bg-white px-2.5 py-1.5 text-sm text-ink placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400 dark:bg-primary-50"
              />
            </div>

            {/* Clock format */}
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-primary-500">
                Time Format
              </label>
              <div className="mt-1 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => { update({ clockFormat: '12h' }); }}
                  className={`flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${is12h ? 'border-primary-400 bg-primary-200/60 text-ink' : 'border-primary-200 text-primary-500 hover:bg-primary-100'}`}
                >
                  12h
                </button>
                <button
                  type="button"
                  onClick={() => { update({ clockFormat: '24h' }); }}
                  className={`flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${!is12h ? 'border-primary-400 bg-primary-200/60 text-ink' : 'border-primary-200 text-primary-500 hover:bg-primary-100'}`}
                >
                  24h
                </button>
              </div>
            </div>

            {/* Save / reset */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => { update({ weatherLocation: '' }); setDraft(''); void queryClient.invalidateQueries({ queryKey: ['dashboard', 'weather'] }); }}
                className="text-[11px] text-primary-400 underline-offset-2 hover:text-primary-600 hover:underline"
              >
                Reset to auto
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded-lg bg-primary-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 dark:bg-primary-700 dark:hover:bg-primary-600"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
