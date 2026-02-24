import { ArrowRight01Icon, Wrench01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { DashboardGlassCard } from './dashboard-glass-card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type InstalledSkill = {
  id: string
  name: string
  description: string
  enabled: boolean
}

type SkillsResponse = {
  skills?: Array<Record<string, unknown>>
}

type SkillsWidgetProps = {
  draggable?: boolean
  onRemove?: () => void
}

function readString(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : ''
}

function readBoolean(value: unknown): boolean {
  return value === true
}

function normalizeSkill(
  source: Record<string, unknown>,
  index: number,
): InstalledSkill {
  const id = readString(source.id) || `skill-${index + 1}`
  const name = readString(source.name) || 'Unnamed skill'
  const description =
    readString(source.description) || 'No description provided.'

  return {
    id,
    name,
    description,
    enabled: readBoolean(source.enabled),
  }
}

export async function fetchInstalledSkills(): Promise<Array<InstalledSkill>> {
  try {
    const response = await fetch(
      '/api/skills?tab=installed&limit=12&summary=search',
    )
    if (!response.ok) return []

    const payload = (await response.json().catch(function onInvalidJson() {
      return {}
    })) as SkillsResponse

    const rows = Array.isArray(payload.skills) ? payload.skills : []

    return rows.map(function mapSkill(skill, index) {
      return normalizeSkill(skill, index)
    })
  } catch {
    return []
  }
}

export function SkillsWidget({
  draggable = false,
  onRemove,
}: SkillsWidgetProps) {
  const navigate = useNavigate()
  const skillsQuery = useQuery({
    queryKey: ['dashboard', 'skills'],
    queryFn: fetchInstalledSkills,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const skills = useMemo(
    function resolveSkills() {
      const source = Array.isArray(skillsQuery.data) ? skillsQuery.data : []
      return source.slice(0, 6)
    },
    [skillsQuery.data],
  )

  return (
    <DashboardGlassCard
      title="Skills"
      description=""
      icon={Wrench01Icon}
      titleAccessory={
        <span className="inline-flex items-center rounded-full border border-primary-200 dark:border-neutral-800 bg-primary-50 dark:bg-neutral-950 px-2 py-0.5 font-mono text-[11px] font-medium text-primary-800 dark:text-neutral-200 tabular-nums">
          {skills.length}
        </span>
      }
      draggable={draggable}
      onRemove={onRemove}
      className="h-full rounded-xl border-primary-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 shadow-[0_6px_20px_rgba(0,0,0,0.25)] [&_h2]:text-[11px] [&_h2]:font-medium [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:text-primary-400 dark:[&_h2]:text-neutral-500 [&_h2]:text-balance [&_svg]:text-primary-400 dark:[&_svg]:text-neutral-500"
    >
      {skillsQuery.isLoading && skills.length === 0 ? (
        <div className="flex h-28 items-center justify-center gap-3 rounded-lg border border-primary-200 dark:border-neutral-800 bg-primary-50 dark:bg-neutral-950">
          <span
            className="size-4 animate-spin rounded-full border-2 border-primary-300 dark:border-neutral-700 border-t-neutral-300"
            role="status"
            aria-label="Loading"
          />
          <span className="text-sm text-primary-500 dark:text-neutral-400">Loading skills…</span>
        </div>
      ) : skills.length === 0 ? (
        <div className="flex h-28 flex-col items-center justify-center gap-1 rounded-lg border border-primary-200 dark:border-neutral-800 bg-primary-50 dark:bg-neutral-950">
          <p className="text-sm font-semibold text-primary-900 dark:text-neutral-100">No skills installed</p>
          <p className="text-xs text-primary-500 dark:text-neutral-400 text-pretty">
            Install skills to extend Claude's capabilities
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {skills.map(function renderSkill(skill, index) {
            return (
              <article
                key={skill.id}
                className={cn(
                  index >= 3 && 'hidden md:block',
                  'rounded-lg border border-primary-200 dark:border-neutral-800 px-2.5 py-2 md:px-3 md:py-2.5',
                  index % 2 === 0 ? 'bg-primary-50 dark:bg-neutral-950' : 'bg-primary-50 dark:bg-neutral-950/80',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-1 text-xs md:text-sm font-medium text-primary-900 dark:text-neutral-100 text-balance">
                    {skill.name}
                  </p>
                  <span
                    className={cn(
                      'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums',
                      skill.enabled
                        ? 'border-emerald-900 bg-emerald-950/40 text-emerald-400'
                        : 'border-primary-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-primary-500 dark:text-neutral-400',
                    )}
                  >
                    {skill.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <p className="mt-1 line-clamp-1 md:line-clamp-2 text-xs md:text-sm text-primary-500 dark:text-neutral-400 text-pretty">
                  {skill.description}
                </p>
              </article>
            )
          })}
        </div>
      )}

      <Button
        variant="outline"
        className="mt-3 w-full justify-between rounded-lg border-primary-200 dark:border-neutral-800 bg-primary-50 dark:bg-neutral-950 text-primary-800 dark:text-neutral-200 hover:bg-primary-100 dark:hover:bg-neutral-900"
        onClick={function handleOpenSkills() {
          void navigate({ to: '/skills' })
        }}
      >
        <span className="text-sm font-medium text-balance">Open Skills</span>
        <HugeiconsIcon icon={ArrowRight01Icon} size={20} strokeWidth={1.5} />
      </Button>
    </DashboardGlassCard>
  )
}
