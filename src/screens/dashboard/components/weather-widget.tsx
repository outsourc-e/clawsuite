import { CloudIcon, Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { DashboardGlassCard } from './dashboard-glass-card'
import type { WeatherSnapshot } from './dashboard-types'
import { useDashboardSettings } from '../hooks/use-dashboard-settings'

type WttrDescription = {
  value?: string
}

type WttrNearestArea = {
  areaName?: Array<WttrDescription>
}

type WttrCurrentCondition = {
  temp_C?: string
  weatherDesc?: Array<WttrDescription>
}

type WttrForecastDay = {
  date?: string
  maxtempC?: string
  mintempC?: string
  hourly?: Array<{
    weatherDesc?: Array<WttrDescription>
  }>
}

type WttrPayload = {
  nearest_area?: Array<WttrNearestArea>
  current_condition?: Array<WttrCurrentCondition>
  weather?: Array<WttrForecastDay>
}

function toWeatherEmoji(condition: string): string {
  const normalized = condition.toLowerCase()
  if (normalized.includes('snow') || normalized.includes('blizzard')) return '❄️'
  if (
    normalized.includes('rain') ||
    normalized.includes('drizzle') ||
    normalized.includes('storm')
  ) {
    return '🌧️'
  }
  if (normalized.includes('cloud') || normalized.includes('overcast')) return '🌤️'
  return '☀️'
}

function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32)
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function formatWeekday(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date)
}

function deriveLocationFromTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
    // "America/New_York" → "New_York" → "New York"
    const city = tz.split('/').pop()?.replace(/_/g, ' ') ?? ''
    return city
  } catch {
    return ''
  }
}

async function fetchWeather(location?: string): Promise<WeatherSnapshot> {
  const loc = location?.trim() || deriveLocationFromTimezone()
  const url = loc
    ? `https://wttr.in/${encodeURIComponent(loc)}?format=j1`
    : 'https://wttr.in/?format=j1'
  const response = await fetch(url)
  if (!response.ok) throw new Error('Weather unavailable')
  const payload = (await response.json()) as WttrPayload

  const current = payload.current_condition?.[0]
  const condition = current?.weatherDesc?.[0]?.value?.trim() ?? 'Unknown'
  const weatherLocation =
    payload.nearest_area?.[0]?.areaName?.[0]?.value?.trim() ?? 'Unknown'
  const temperatureC = toNumber(current?.temp_C)

  const forecast = (payload.weather ?? []).slice(0, 3).map(function mapDay(day, index) {
    const dayCondition =
      day.hourly?.[0]?.weatherDesc?.[0]?.value?.trim() ?? condition
    const label = day.date ? formatWeekday(day.date) : `Day ${index + 1}`
    return {
      id: day.date ?? `${index}`,
      label,
      highC: toNumber(day.maxtempC),
      lowC: toNumber(day.mintempC),
      condition: dayCondition,
      emoji: toWeatherEmoji(dayCondition),
    }
  })

  return {
    location: weatherLocation,
    temperatureC,
    condition,
    emoji: toWeatherEmoji(condition),
    forecast,
  }
}

type WeatherWidgetProps = {
  draggable?: boolean
}

export function WeatherWidget({ draggable = false }: WeatherWidgetProps) {
  const { settings, update } = useDashboardSettings()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(settings.weatherLocation)
  const inputRef = useRef<HTMLInputElement>(null)

  const weatherQuery = useQuery({
    queryKey: ['dashboard', 'weather', settings.weatherLocation],
    queryFn: () => fetchWeather(settings.weatherLocation),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    retry: 1,
  })

  function handleSaveLocation() {
    update({ weatherLocation: draft.trim() })
    setEditing(false)
  }

  if (weatherQuery.isError) {
    return (
      <DashboardGlassCard
        title="Weather"
        description="Local weather snapshot and near-term forecast."
        icon={CloudIcon}
        draggable={draggable}
        className="h-full"
      >
        <div className="flex h-[130px] items-center justify-center rounded-xl border border-primary-200 bg-primary-100/50 text-sm text-primary-600 text-pretty">
          Weather unavailable
        </div>
      </DashboardGlassCard>
    )
  }

  if (!weatherQuery.data) {
    return (
      <DashboardGlassCard
        title="Weather"
        description="Local weather snapshot and near-term forecast."
        icon={CloudIcon}
        draggable={draggable}
        className="h-full"
      >
        <div className="flex h-[130px] items-center justify-center rounded-xl border border-primary-200 bg-primary-100/50 text-sm text-primary-600 text-pretty">
          Loading weather...
        </div>
      </DashboardGlassCard>
    )
  }

  const weather = weatherQuery.data

  return (
    <DashboardGlassCard
      title="Weather"
      description="Local weather snapshot and near-term forecast."
      icon={CloudIcon}
      draggable={draggable}
      className="h-full"
    >
      {editing ? (
        <div className="rounded-xl border border-primary-200 bg-primary-100/55 p-3">
          <label className="text-xs text-primary-600">Location (ZIP code or city)</label>
          <div className="mt-1 flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLocation() }}
              placeholder="e.g. 33101 or Miami"
              className="flex-1 rounded-lg border border-primary-200 bg-white px-2.5 py-1.5 text-sm text-ink placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
              autoFocus
            />
            <button
              type="button"
              onClick={handleSaveLocation}
              className="rounded-lg bg-primary-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setDraft(settings.weatherLocation) }}
              className="rounded-lg border border-primary-200 px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-100"
            >
              Cancel
            </button>
          </div>
          {settings.weatherLocation && (
            <button
              type="button"
              onClick={() => { update({ weatherLocation: '' }); setDraft(''); setEditing(false) }}
              className="mt-2 text-[11px] text-primary-500 underline hover:text-primary-700"
            >
              Reset to auto-detect
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-primary-200 bg-primary-100/55 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="line-clamp-1 text-sm font-medium text-ink text-balance">
                  {weather.location}
                </p>
                <button
                  type="button"
                  onClick={() => { setDraft(settings.weatherLocation); setEditing(true) }}
                  className="shrink-0 rounded p-0.5 text-primary-400 hover:text-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  aria-label="Edit weather location"
                  title="Change location"
                >
                  <HugeiconsIcon icon={Edit02Icon} size={13} strokeWidth={1.5} />
                </button>
              </div>
              <p className="mt-0.5 line-clamp-1 text-xs text-primary-600 text-pretty">
                {weather.condition}
              </p>
            </div>
            <p className="shrink-0 text-lg font-medium text-ink tabular-nums">
              {weather.emoji} {cToF(weather.temperatureC)}°F
            </p>
          </div>
        </div>
      )}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {weather.forecast.map(function mapDay(day) {
          return (
            <div
              key={day.id}
              className="rounded-lg border border-primary-200 bg-primary-100/45 px-2 py-2 text-center"
            >
              <p className="text-[11px] text-primary-600 tabular-nums">{day.label}</p>
              <p className="mt-1 text-sm text-ink" title={day.condition}>
                {day.emoji}
              </p>
              <p className="mt-1 text-[11px] text-primary-700 tabular-nums">
                {cToF(day.highC)}°/{cToF(day.lowC)}°F
              </p>
            </div>
          )
        })}
      </div>
    </DashboardGlassCard>
  )
}
