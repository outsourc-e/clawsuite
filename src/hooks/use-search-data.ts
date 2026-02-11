/**
 * Phase 3.2: Real data for global search
 * Fetches sessions, files, and activity from existing sources
 */
import { useQuery } from '@tanstack/react-query'
import { useActivityEvents } from '@/screens/activity/use-activity-events'
import type { ActivityEvent } from '@/types/activity-event'

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

// Static skills dataset (as Eric specified - no backend)
const SKILLS_DATA: SearchSkill[] = [
  { id: 'weather', name: 'Weather', description: 'Get current weather and forecasts', installed: true },
  { id: 'browser-use', name: 'Browser Use', description: 'Automate browser interactions', installed: true },
  { id: 'codex-cli', name: 'Codex CLI', description: 'Use OpenAI Codex for coding tasks', installed: true },
  { id: 'video-frames', name: 'Video Frames', description: 'Extract frames from videos', installed: false },
  { id: 'openai-whisper', name: 'OpenAI Whisper', description: 'Transcribe audio files', installed: false },
]

async function fetchSessions(): Promise<SearchSession[]> {
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

async function fetchFiles(): Promise<SearchFile[]> {
  const res = await fetch('/api/files?action=list')
  if (!res.ok) return []
  const data = await res.json()
  const entries = Array.isArray(data.entries) ? data.entries : []
  
  // Flatten tree into list
  function flatten(entries: Record<string, unknown>[]): SearchFile[] {
    const result: SearchFile[] = []
    for (const entry of entries) {
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
        result.push(...flatten(entry.children as Record<string, unknown>[]))
      }
    }
    return result
  }
  
  return flatten(entries)
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

  // Activity events (from existing hook)
  const { events } = useActivityEvents({
    initialCount: 100,
    maxEvents: 200,
  })

  const activityResults: SearchActivity[] = events.map((event: ActivityEvent) => ({
    id: event.id,
    title: event.title,
    detail: event.detail,
    timestamp: event.timestamp,
    level: event.level,
    source: event.source,
  }))

  // Skills (static)
  const skillsResults: SearchSkill[] = SKILLS_DATA

  return {
    sessions: sessionsQuery.data || [],
    files: filesQuery.data || [],
    skills: skillsResults,
    activity: activityResults,
    isLoading: sessionsQuery.isLoading || filesQuery.isLoading,
  }
}

// Client-side filtering
export function filterResults<T extends Record<string, unknown>>(
  items: T[],
  query: string,
  fields: (keyof T)[],
): T[] {
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
