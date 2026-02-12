/**
 * Compact ambient time + weather readout for the dashboard header.
 */
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
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
  if (n.includes('rain') || n.includes('drizzle') || n.includes('storm'))
    return '🌧️'
  if (n.includes('cloud') || n.includes('overcast')) return '🌤️'
  return '☀️'
}

function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32)
}

function deriveLocationFromTimezone(): string {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return timezone.split('/').pop()?.replace(/_/g, ' ') ?? ''
  } catch {
    return ''
  }
}

async function fetchCompactWeather(
  location?: string,
): Promise<{ emoji: string; tempF: number } | null> {
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
  const { settings } = useDashboardSettings()
  const is12h = settings.clockFormat === '12h'

  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const timeStr = useMemo(
    function buildTimeString() {
      return new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: is12h,
      }).format(now)
    },
    [now, is12h],
  )

  const dateStr = useMemo(
    function buildDateString() {
      return new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(now)
    },
    [now],
  )

  const weatherQuery = useQuery({
    queryKey: ['dashboard', 'weather', settings.weatherLocation],
    queryFn: () => fetchCompactWeather(settings.weatherLocation),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    retry: 1,
  })

  const weather = weatherQuery.data

  return (
    <div className="hidden text-right sm:block">
      <div className="inline-flex items-center justify-end gap-2 rounded-full border border-primary-200 bg-primary-100/65 px-3 py-1 text-[11px] text-primary-600 tabular-nums shadow-sm">
        <span className="font-medium text-ink">{timeStr}</span>
        <span className="text-primary-400">·</span>
        <span className="text-primary-600">{dateStr}</span>
        {weather ? (
          <>
            <span className="text-primary-400">·</span>
            <span className="text-primary-600">
              {weather.emoji}{' '}
              <span className="font-medium text-accent-600 tabular-nums">
                {weather.tempF}°
              </span>
            </span>
          </>
        ) : null}
      </div>
    </div>
  )
}
