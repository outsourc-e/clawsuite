/**
 * Phase 3.2: Real data for global search
 * Fetches sessions, files, and activity from existing sources
 */
import { useQuery } from '@tanstack/react-query'
// import type { ActivityEvent } from '@/types/activity-event'
// Activity events disabled in search — SSE connection caused freezing
// import { useActivityEvents } from '@/screens/activity/use-activity-events'

export type SearchSession = {
  id: string
  key: string
  friendlyId: string
  title?: string
  preview?: string
  updatedAt?: number
}

export type SearchFile = {
  id: string
  path: string
  name: string
  type: 'file' | 'folder'
}

export type SearchSkill = {
  id: string
  name: string
  description: string
  installed: boolean
}

export type SearchActivity = {
  id: string
  title: string
  detail?: string
  timestamp: number
  level: string
  source?: string
}

async function fetchSessions(): Promise<Array<SearchSession>> {
  const res = await fetch('/api/sessions')
  if (!res.ok) return []
  const data = await res.json()
  const sessions = Array.isArray(data.sessions) ? data.sessions : []
  
  return sessions.map((s: Record<string, unknown>) => ({
    id: String(s.key || s.friendlyId || 'unknown'),
    key: String(s.key || ''),
    friendlyId: String(s.friendlyId || s.key || 'unknown'),
    title: String(s.friendlyId || s.key || 'Untitled'),
    preview: '', // Could extract from messages if needed
    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : Date.now(),
  }))
}

async function fetchFiles(): Promise<Array<SearchFile>> {
  const res = await fetch('/api/files?action=list')
  if (!res.ok) return []
  const data = await res.json()
  const entries = Array.isArray(data.entries) ? data.entries : []
  
  // Flatten tree into list
  function flatten(fileEntries: Array<Record<string, unknown>>): Array<SearchFile> {
    const result: Array<SearchFile> = []
    for (const entry of fileEntries) {
      const path = String(entry.path || '')
      const name = String(entry.name || '')
      const type = String(entry.type || 'file') as 'file' | 'folder'
      
      result.push({
        id: path,
        path,
        name,
        type,
      })
      
      if (Array.isArray(entry.children)) {
        result.push(...flatten(entry.children as Array<Record<string, unknown>>))
      }
    }
    return result
  }

  return flatten(entries)
}

async function fetchSkills(): Promise<Array<SearchSkill>> {
  const res = await fetch('/api/skills')
  if (!res.ok) return []
  const data = await res.json()
  if (typeof data.ok === 'boolean' && !data.ok) return []
  const skills = Array.isArray(data.skills) ? data.skills : []

  return skills.map((skill: Record<string, unknown>) => {
    const name = String(skill.name || 'Unknown Skill')
    return {
      id: String(skill.id || name.toLowerCase().replaceAll(' ', '-')),
      name,
      description: String(skill.description || ''),
      installed: Boolean(skill.installed),
    }
  })
}

export function useSearchData(scope: 'all' | 'chats' | 'files' | 'agents' | 'skills' | 'actions') {
  // Sessions
  const sessionsQuery = useQuery({
    queryKey: ['search', 'sessions'],
    queryFn: fetchSessions,
    enabled: scope === 'all' || scope === 'chats',
    staleTime: 30_000,
  })

  // Files
  const filesQuery = useQuery({
    queryKey: ['search', 'files'],
    queryFn: fetchFiles,
    enabled: scope === 'all' || scope === 'files',
    staleTime: 60_000,
  })

  // Skills
  const skillsQuery = useQuery({
    queryKey: ['search', 'skills'],
    queryFn: fetchSkills,
    enabled: scope === 'all' || scope === 'skills',
    staleTime: 60_000,
  })

  // Activity events disabled — SSE to /api/events caused UI freeze
  const activityResults: Array<SearchActivity> = []

  return {
    sessions: sessionsQuery.data || [],
    files: filesQuery.data || [],
    skills: skillsQuery.data || [],
    activity: activityResults,
    isLoading: sessionsQuery.isLoading || filesQuery.isLoading || skillsQuery.isLoading,
  }
}

// Client-side filtering
export function filterResults<T extends Record<string, unknown>>(
  items: Array<T>,
  query: string,
  fields: Array<keyof T>,
): Array<T> {
  if (!query.trim()) return items
  
  const lower = query.toLowerCase()
  return items.filter((item) => {
    return fields.some((field) => {
      const value = item[field]
      if (typeof value === 'string') {
        return value.toLowerCase().includes(lower)
      }
      return false
    })
  })
}
