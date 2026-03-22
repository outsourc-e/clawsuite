/**
 * use-conductor-workspace.ts
 *
 * Encapsulates all Workspace daemon API calls for the Conductor UI.
 * Conductor uses the Workspace daemon (:3099) as its backend for:
 *   - Goal decomposition (LLM-powered task breakdown)
 *   - Mission lifecycle (create, start, pause, resume, stop)
 *   - Live status polling (mission progress, task runs)
 *   - Checkpoint management (approve, reject, merge)
 *
 * This hook does NOT touch the client-side mission-store or orchestrator.
 * All state lives in the daemon's SQLite DB + SSE event stream.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

const CLAWSUITE_REPO_PATH = '/Users/aurora/.openclaw/workspace/clawsuite'

function isBlockedProjectPath(projectPath?: string | null): boolean {
  if (typeof projectPath !== 'string' || projectPath.trim().length === 0) return false
  const candidate = projectPath.trim()
  return candidate === CLAWSUITE_REPO_PATH || candidate.startsWith(`${CLAWSUITE_REPO_PATH}/`)
}

// ── Types ────────────────────────────────────────────────────────────────────

export type DecomposeResult = {
  tasks: Array<{
    title: string
    description: string
    agent?: string
  }>
}

export type WorkspaceMissionTask = {
  id: string
  name: string
  status: string
  agent_id?: string | null
  started_at?: string | null
  completed_at?: string | null
}

export type WorkspaceMissionStatus = {
  mission: {
    id: string
    name: string
    status: string
    progress: number
  }
  task_breakdown: WorkspaceMissionTask[]
  running_agents: string[]
  completed_count: number
  total_count: number
  estimated_completion: string | null
}

export type WorkspaceTaskRun = {
  id: string
  task_id: string
  task_name?: string
  mission_id?: string
  mission_name?: string
  project_id?: string
  status: string
  started_at?: string | null
  completed_at?: string | null
  session_id?: string | null
  session_label?: string | null
  agent_id?: string | null
  agent_name?: string | null
  error?: string | null
}

export type WorkspaceCheckpoint = {
  id: string
  task_run_id?: string
  status: string
  diff_summary?: string
  created_at: string
  files_changed?: number
  additions?: number
  deletions?: number
}

export type WorkspaceProject = {
  id: string
  name: string
  path?: string
  status: string
}

export type WorkspaceRecentMission = {
  id: string
  name: string
  status: string
  project_id?: string
  phase_id?: string
  created_at?: string
  updated_at?: string
}

export type WorkspaceProjectFile = {
  relativePath: string
  size: number
  isText: boolean
  content?: string
}

export type WorkspaceProjectFiles = {
  projectPath: string
  files: WorkspaceProjectFile[]
}

// ── API helpers ──────────────────────────────────────────────────────────────

async function workspaceJson<T = unknown>(
  input: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const timeoutMs = init?.timeoutMs ?? 30_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
  const text = await response.text()

  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }

  if (response.ok) return parsed as T

  const record =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  throw new Error(
    (typeof record?.error === 'string' && record.error) ||
      (typeof record?.message === 'string' && record.message) ||
      `Request failed (${response.status})`,
  )
}

async function workspacePost(input: string, body?: unknown, timeoutMs?: number): Promise<unknown> {
  return workspaceJson(input, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : '{}',
    timeoutMs,
  })
}

// ── Parsers ──────────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseDecomposeResult(payload: unknown): DecomposeResult {
  const record = asRecord(payload)
  const tasks = Array.isArray(record?.tasks) ? record.tasks : []
  return {
    tasks: tasks
      .map((item) => {
        const r = asRecord(item)
        if (!r) return null
        const title = asString(r.title) ?? asString(r.name) ?? ''
        if (!title) return null
        return {
          title,
          description: asString(r.description) ?? '',
          agent: asString(r.agent) ?? undefined,
        }
      })
      .filter((t): t is NonNullable<typeof t> => t !== null),
  }
}

function parseMissionStatus(payload: unknown): WorkspaceMissionStatus | null {
  const record = asRecord(payload)
  const mission = asRecord(record?.mission)
  if (!mission) return null

  const taskBreakdown = Array.isArray(record?.task_breakdown)
    ? record.task_breakdown
        .map((task) => {
          const r = asRecord(task)
          if (!r) return null
          return {
            id: asString(r.id) ?? crypto.randomUUID(),
            name: asString(r.name) ?? 'Untitled task',
            status: asString(r.status) ?? 'pending',
            agent_id: asString(r.agent_id),
            started_at: asString(r.started_at),
            completed_at: asString(r.completed_at),
          }
        })
        .filter((t): t is NonNullable<typeof t> => t !== null)
    : []

  return {
    mission: {
      id: asString(mission.id) ?? '',
      name: asString(mission.name) ?? 'Mission',
      status: asString(mission.status) ?? 'pending',
      progress: Math.max(0, Math.min(100, asNumber(mission.progress) ?? 0)),
    },
    task_breakdown: taskBreakdown,
    running_agents: Array.isArray(record?.running_agents)
      ? record.running_agents.filter((v): v is string => typeof v === 'string')
      : [],
    completed_count: Math.max(0, asNumber(record?.completed_count) ?? 0),
    total_count: Math.max(0, asNumber(record?.total_count) ?? taskBreakdown.length),
    estimated_completion: asString(record?.estimated_completion),
  }
}

function parseTaskRuns(payload: unknown): WorkspaceTaskRun[] {
  const unwrap = (data: unknown): unknown[] => {
    if (Array.isArray(data)) return data
    const record = asRecord(data)
    const candidates = [record?.task_runs, record?.runs, record?.data, record?.items]
    for (const c of candidates) {
      if (Array.isArray(c)) return c
    }
    return []
  }

  return unwrap(payload)
    .map((item) => {
      const r = asRecord(item)
      if (!r) return null
      return {
        id: asString(r.id) ?? crypto.randomUUID(),
        task_id: asString(r.task_id) ?? '',
        task_name: asString(r.task_name) ?? undefined,
        mission_id: asString(r.mission_id) ?? undefined,
        mission_name: asString(r.mission_name) ?? undefined,
        project_id: asString(r.project_id) ?? undefined,
        status: asString(r.status) ?? 'pending',
        started_at: asString(r.started_at),
        completed_at: asString(r.completed_at),
        session_id: asString(r.session_id),
        session_label: asString(r.session_label),
        agent_id: asString(r.agent_id),
        agent_name: asString(r.agent_name),
        error: asString(r.error),
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
}

const RESILIENT_QUERY_OPTIONS = {
  retry: 3,
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 5000),
} as const

function parseCheckpoints(payload: unknown): WorkspaceCheckpoint[] {
  const unwrap = (data: unknown): unknown[] => {
    if (Array.isArray(data)) return data
    const record = asRecord(data)
    const candidates = [record?.checkpoints, record?.data, record?.items]
    for (const c of candidates) {
      if (Array.isArray(c)) return c
    }
    return []
  }

  return unwrap(payload)
    .map((item) => {
      const r = asRecord(item)
      if (!r) return null
      return {
        id: asString(r.id) ?? crypto.randomUUID(),
        task_run_id: asString(r.task_run_id) ?? undefined,
        status: asString(r.status) ?? 'pending',
        diff_summary: asString(r.diff_summary) ?? undefined,
        created_at: asString(r.created_at) ?? new Date().toISOString(),
        files_changed: asNumber(r.files_changed) ?? undefined,
        additions: asNumber(r.additions) ?? undefined,
        deletions: asNumber(r.deletions) ?? undefined,
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
}

function parseProject(payload: unknown): WorkspaceProject | null {
  const record = asRecord(payload)
  const project = asRecord(record?.project) ?? record
  if (!project) return null
  const id = asString(project.id)
  if (!id) return null
  return {
    id,
    name: asString(project.name) ?? 'Untitled',
    path: asString(project.path) ?? undefined,
    status: asString(project.status) ?? 'ready',
  }
}

function parseRecentMissions(payload: unknown): WorkspaceRecentMission[] {
  const items = Array.isArray(payload) ? payload : []
  const missions: WorkspaceRecentMission[] = []

  for (const item of items) {
    const record = asRecord(item)
    if (!record) continue
    const id = asString(record.id)
    if (!id) continue

    missions.push({
      id,
      name: asString(record.name) ?? 'Mission',
      status: asString(record.status) ?? 'pending',
      project_id: asString(record.project_id) ?? undefined,
      phase_id: asString(record.phase_id) ?? undefined,
      created_at: asString(record.created_at) ?? undefined,
      updated_at: asString(record.updated_at) ?? undefined,
    })
  }

  return missions
}

function parseProjectFiles(payload: unknown): WorkspaceProjectFiles | null {
  const record = asRecord(payload)
  const projectPath = asString(record?.projectPath)
  if (!projectPath) return null

  const files: WorkspaceProjectFile[] = []
  const items = Array.isArray(record?.files) ? record.files : []

  for (const item of items) {
    const file = asRecord(item)
    if (!file) continue
    const relativePath = asString(file.relativePath)
    if (!relativePath) continue

    files.push({
      relativePath,
      size: Math.max(0, asNumber(file.size) ?? 0),
      isText: Boolean(file.isText),
      content: asString(file.content) ?? undefined,
    })
  }

  return { projectPath, files }
}

function extractEntityRecord(
  payload: unknown,
  entityKey: string,
): Record<string, unknown> | null {
  const record = asRecord(payload)
  const candidates = [record?.[entityKey], record?.data, payload]

  for (const candidate of candidates) {
    const candidateRecord = asRecord(candidate)
    if (candidateRecord) return candidateRecord
  }

  return null
}

function extractEntityId(payload: unknown, entityKey: string): string | null {
  const record = extractEntityRecord(payload, entityKey)
  if (!record) return null
  return asString(record.id) ?? asString(record[`${entityKey}_id`])
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useConductorWorkspace(options?: {
  missionId?: string | null
  projectId?: string | null
  enabled?: boolean
}) {
  const queryClient = useQueryClient()
  const missionId = options?.missionId ?? null
  const projectId = options?.projectId ?? null
  const enabled = options?.enabled !== false

  // ── Decompose mutation ───────────────────────────────────────────────────
  const decomposeMutation = useMutation({
    mutationFn: async (goal: string) => {
      const payload = await workspacePost('/api/workspace/decompose', {
        goal,
        ...(projectId ? { project_id: projectId } : {}),
      }, 60_000)
      return parseDecomposeResult(payload)
    },
  })

  // ── Create project mutation ──────────────────────────────────────────────
  const createProjectMutation = useMutation({
    mutationFn: async (params: { name: string; path?: string }) => {
      const payload = await workspacePost('/api/workspace/projects', params)
      return parseProject(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'projects'] })
    },
  })

  // ── Create phase mutation ────────────────────────────────────────────────
  const createPhaseMutation = useMutation({
    mutationFn: async (params: {
      project_id: string
      name: string
      sort_order: number
    }) => {
      const payload = await workspacePost('/api/workspace/phases', params)
      return {
        id: extractEntityId(payload, 'phase') ?? '',
        payload,
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'projects'] })
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'missions'] })
    },
  })

  // ── Create mission mutation ──────────────────────────────────────────────
  const createMissionMutation = useMutation({
    mutationFn: async (params: {
      name: string
      phase_id: string
    }) => {
      const payload = await workspacePost('/api/workspace/missions', params)
      const record = asRecord(payload)
      const id = extractEntityId(payload, 'mission') ?? ''
      return { id, ...(record ?? {}) }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'missions'] })
    },
  })

  const createTaskMutation = useMutation({
    mutationFn: async (params: {
      mission_id: string
      name: string
      description?: string
      suggested_agent_type?: string
      sort_order: number
    }) => workspacePost('/api/workspace-tasks', params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'missions'] })
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'task-runs'] })
    },
  })

  // ── Start mission mutation ───────────────────────────────────────────────
  const startMissionMutation = useMutation({
    mutationFn: async (id: string) => {
      await workspacePost(`/api/workspace/missions/${encodeURIComponent(id)}/start`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace'] })
    },
  })

  // ── Mission lifecycle mutations ──────────────────────────────────────────
  const pauseMissionMutation = useMutation({
    mutationFn: async (id: string) => {
      await workspacePost(`/api/workspace/missions/${encodeURIComponent(id)}/pause`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace'] })
    },
  })

  const resumeMissionMutation = useMutation({
    mutationFn: async (id: string) => {
      await workspacePost(`/api/workspace/missions/${encodeURIComponent(id)}/resume`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace'] })
    },
  })

  const stopMissionMutation = useMutation({
    mutationFn: async (id: string) => {
      await workspacePost(`/api/workspace/missions/${encodeURIComponent(id)}/stop`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace'] })
    },
  })

  // ── Task run mutations ───────────────────────────────────────────────────
  const stopTaskRunMutation = useMutation({
    mutationFn: async (runId: string) => {
      await workspacePost(`/api/workspace/task-runs/${encodeURIComponent(runId)}/stop`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'task-runs'] })
    },
  })

  const retryTaskRunMutation = useMutation({
    mutationFn: async (runId: string) => {
      await workspacePost(`/api/workspace/task-runs/${encodeURIComponent(runId)}/retry`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'task-runs'] })
    },
  })

  // ── Checkpoint mutations ─────────────────────────────────────────────────
  const approveCheckpointMutation = useMutation({
    mutationFn: async (params: { id: string; action?: 'approve' | 'commit' | 'merge' | 'pr' }) => {
      const suffix = params.action === 'commit'
        ? '/approve-and-commit'
        : params.action === 'merge'
          ? '/approve-and-merge'
          : params.action === 'pr'
            ? '/approve-and-pr'
            : '/approve'
      await workspacePost(`/api/workspace/checkpoints/${encodeURIComponent(params.id)}${suffix}`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'checkpoints'] })
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'stats'] })
    },
  })

  const rejectCheckpointMutation = useMutation({
    mutationFn: async (id: string) => {
      await workspacePost(`/api/workspace/checkpoints/${encodeURIComponent(id)}/reject`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'checkpoints'] })
    },
  })

  // ── Queries (only when mission is active) ────────────────────────────────

  const missionStatusQuery = useQuery({
    queryKey: ['workspace', 'conductor', 'mission-status', missionId],
    enabled: enabled && Boolean(missionId),
    queryFn: async () =>
      parseMissionStatus(
        await workspaceJson(`/api/workspace/missions/${encodeURIComponent(missionId!)}/status`),
      ),
    refetchInterval: 3_000,
    ...RESILIENT_QUERY_OPTIONS,
  })

  const taskRunsQuery = useQuery({
    queryKey: ['workspace', 'conductor', 'task-runs', missionId],
    enabled: enabled && Boolean(missionId),
    queryFn: async () =>
      parseTaskRuns(
        await workspaceJson(
          `/api/workspace/task-runs${missionId ? `?mission_id=${encodeURIComponent(missionId)}` : ''}`,
        ),
      ),
    refetchInterval: 5_000,
    ...RESILIENT_QUERY_OPTIONS,
  })

  const checkpointsQuery = useQuery({
    queryKey: ['workspace', 'conductor', 'checkpoints', missionId],
    enabled: enabled && Boolean(missionId),
    queryFn: async () =>
      parseCheckpoints(
        await workspaceJson(
          `/api/workspace/checkpoints${missionId ? `?mission_id=${encodeURIComponent(missionId)}` : ''}`,
        ),
      ),
    refetchInterval: 5_000,
    ...RESILIENT_QUERY_OPTIONS,
  })

  const statsQuery = useQuery({
    queryKey: ['workspace', 'stats'],
    enabled,
    queryFn: async () => workspaceJson<Record<string, unknown>>('/api/workspace/stats'),
    refetchInterval: 10_000,
    ...RESILIENT_QUERY_OPTIONS,
  })

  const recentMissionsQuery = useQuery({
    queryKey: ['workspace', 'conductor', 'recent-missions'],
    enabled,
    queryFn: async () => parseRecentMissions(await workspaceJson('/api/workspace/missions')),
    refetchInterval: 30_000,
    ...RESILIENT_QUERY_OPTIONS,
  })

  const projectFilesQuery = useQuery({
    queryKey: ['workspace', 'conductor', 'project-files', projectId],
    enabled: enabled && Boolean(projectId),
    queryFn: async () =>
      parseProjectFiles(
        await workspaceJson(`/api/workspace/projects/${encodeURIComponent(projectId!)}/files`),
      ),
    refetchInterval: 30_000,
    ...RESILIENT_QUERY_OPTIONS,
  })

  // ── Convenience: full launch sequence ────────────────────────────────────

  const launchMission = useCallback(
    async (params: {
      goal: string
      projectName?: string
      projectPath?: string
      tasks: Array<{ title: string; description?: string; agent?: string }>
    }) => {
      // 1. Create or reuse project (default path to /tmp/conductor-workspace if none given)
      let resolvedProjectId = projectId
      if (!resolvedProjectId) {
        const timestamp = Date.now()
        const safeDefaultPath = `/tmp/conductor-${timestamp}`
        const defaultPath =
          isBlockedProjectPath(params.projectPath) || !params.projectPath
            ? safeDefaultPath
            : params.projectPath
        const project = await createProjectMutation.mutateAsync({
          name: params.projectName ?? params.goal.slice(0, 64),
          path: defaultPath,
        })
        resolvedProjectId = project?.id ?? null
      }
      if (!resolvedProjectId) throw new Error('Failed to create project')

      // 2. Create phase under the project
      const phase = await createPhaseMutation.mutateAsync({
        project_id: resolvedProjectId,
        name: 'Implementation',
        sort_order: 0,
      })
      if (!phase.id) throw new Error('Failed to create phase')

      // 3. Create mission under the phase
      const mission = await createMissionMutation.mutateAsync({
        name: params.goal.slice(0, 120),
        phase_id: phase.id,
      })
      if (!mission.id) throw new Error('Failed to create mission')

      // 4. Create tasks for the mission
      for (const [index, task] of params.tasks.entries()) {
        await createTaskMutation.mutateAsync({
          mission_id: mission.id,
          name: task.title,
          description: task.description,
          suggested_agent_type: task.agent,
          sort_order: index,
        })
      }

      // 5. Start mission
      await startMissionMutation.mutateAsync(mission.id)

      return { missionId: mission.id, projectId: resolvedProjectId }
    },
    [
      createMissionMutation,
      createPhaseMutation,
      createProjectMutation,
      createTaskMutation,
      projectId,
      startMissionMutation,
    ],
  )

  // ── Return ───────────────────────────────────────────────────────────────

  return {
    // Mutations
    decompose: decomposeMutation,
    createProject: createProjectMutation,
    createPhase: createPhaseMutation,
    createMission: createMissionMutation,
    createTask: createTaskMutation,
    startMission: startMissionMutation,
    pauseMission: pauseMissionMutation,
    resumeMission: resumeMissionMutation,
    stopMission: stopMissionMutation,
    stopTaskRun: stopTaskRunMutation,
    retryTaskRun: retryTaskRunMutation,
    approveCheckpoint: approveCheckpointMutation,
    rejectCheckpoint: rejectCheckpointMutation,
    launchMission,

    // Queries
    missionStatus: missionStatusQuery,
    taskRuns: taskRunsQuery,
    checkpoints: checkpointsQuery,
    stats: statsQuery,
    recentMissions: recentMissionsQuery,
    projectFiles: projectFilesQuery,

    // Helpers
    invalidateAll: useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ['workspace'] })
    }, [queryClient]),
  }
}
