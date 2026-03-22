/**
 * use-conductor-workspace.ts
 *
 * Encapsulates all Workspace daemon API calls for the Conductor UI.
 * Primary data source: GET /api/workspace/dispatch/state (dispatch-state.json).
 * Secondary: checkpoint / task-run / project-file queries when a missionId is live.
 *
 * Launch flow: decompose → launchMission (POST /api/workspace/dispatch/start)
 * No more 5-step project/phase/mission/task/start sequence.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export type DecomposeResult = {
  tasks: Array<{
    title: string
    description: string
    agent?: string | null
    depends_on?: string[]
    suggested_agent_type?: string | null
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

export type WorkspaceDispatchTask = {
  id: string
  title: string
  status: string
  output_file?: string | null
}

export type WorkspaceDispatchState = {
  mission_id: string
  mission: string
  status: string
  tasks: WorkspaceDispatchTask[]
  options: {
    project_path?: string | null
  }
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

function parseDispatchStateRecord(payload: unknown): WorkspaceDispatchState | null {
  const record = asRecord(payload)
  if (!record) return null

  const rawStatus = asString(record.status) ?? 'idle'
  if (rawStatus === 'idle') return null

  const options = asRecord(record.options)
  const taskItems = Array.isArray(record.tasks) ? record.tasks : []
  const tasks = taskItems
    .map((item) => {
      const task = asRecord(item)
      if (!task) return null
      return {
        id: asString(task.id) ?? crypto.randomUUID(),
        title: asString(task.title) ?? asString(task.name) ?? 'Untitled task',
        status: asString(task.status) ?? 'pending',
        output_file: asString(task.output_file),
      }
    })
    .filter((task): task is NonNullable<typeof task> => task !== null)

  return {
    mission_id: asString(record.mission_id) ?? '',
    mission: asString(record.mission) ?? 'Mission',
    status: rawStatus,
    tasks,
    options: {
      project_path: asString(options?.project_path),
    },
  }
}

/**
 * Parse dispatch-state.json into WorkspaceMissionStatus.
 * Dispatch statuses: idle, pending_dispatch → pending
 *                    running               → running
 *                    complete, complete_partial → completed
 */
function parseDispatchState(payload: unknown): WorkspaceMissionStatus | null {
  const record = parseDispatchStateRecord(payload)
  if (!record) return null

  // Normalise status
  let missionStatus: string
  if (record.status === 'complete' || record.status === 'complete_partial') {
    missionStatus = record.status === 'complete' ? 'completed' : 'failed'
  } else if (record.status === 'running') {
    missionStatus = 'running'
  } else {
    missionStatus = 'pending'
  }

  const payloadRecord = asRecord(payload)
  const taskItems = Array.isArray(payloadRecord?.tasks) ? payloadRecord.tasks : []
  const taskBreakdown: WorkspaceMissionTask[] = taskItems.map((item, index) => {
    const r = asRecord(item)
    const fallback = record.tasks[index]
    return {
      id: asString(r?.id) ?? fallback?.id ?? crypto.randomUUID(),
      name: asString(r?.title) ?? asString(r?.name) ?? fallback?.title ?? 'Untitled task',
      status: asString(r?.status) ?? fallback?.status ?? 'pending',
      agent_id: asString(r?.type) ?? asString(r?.agent_id) ?? null,
      started_at: asString(r?.started_at),
      completed_at: asString(r?.completed_at),
    }
  })

  const completedCount = taskBreakdown.filter(
    (t) => t.status === 'completed' || t.status === 'done',
  ).length
  const totalCount = taskBreakdown.length
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const runningAgents = taskBreakdown
    .filter((t) => t.status === 'running' || t.status === 'active')
    .map((t) => t.agent_id ?? t.name)
    .filter((v): v is string => typeof v === 'string')

  return {
    mission: {
      id: record.mission_id,
      name: record.mission,
      status: missionStatus,
      progress,
    },
    task_breakdown: taskBreakdown,
    running_agents: runningAgents,
    completed_count: completedCount,
    total_count: totalCount,
    estimated_completion: null,
  }
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
          agent:
            asString(r.suggested_agent_type) ??
            asString(r.agent) ??
            null,
          depends_on: Array.isArray(r.depends_on)
            ? r.depends_on.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            : [],
          suggested_agent_type:
            asString(r.suggested_agent_type) ??
            asString(r.agent) ??
            null,
        }
      })
      .filter((t): t is NonNullable<typeof t> => t !== null),
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
  retry: 2,
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

  // ── Dispatch state (primary data source) ────────────────────────────────
  const dispatchStateQuery = useQuery({
    queryKey: ['workspace', 'dispatch', 'state'],
    enabled,
    queryFn: async () => {
      try {
        return parseDispatchStateRecord(await workspaceJson('/api/workspace/dispatch/state'))
      } catch {
        return null
      }
    },
    refetchInterval: 2_000,
  })

  // ── Mission status (dispatch state OR daemon endpoint fallback) ──────────
  const missionStatusQuery = useQuery({
    queryKey: ['workspace', 'conductor', 'mission-status', missionId],
    enabled: enabled && Boolean(missionId),
    queryFn: async () => {
      // Try dispatch state first (already cached)
      const dispatchStatus = parseDispatchState(dispatchStateQuery.data)
      if (dispatchStatus && dispatchStatus.mission.id === missionId) {
        return dispatchStatus
      }
      // Fallback: daemon mission endpoint
      try {
        const payload = await workspaceJson(
          `/api/workspace/missions/${encodeURIComponent(missionId!)}/status`,
        )
        const record = asRecord(payload)
        if (!record) return null
        const mission = asRecord(record.mission)
        if (!mission) return null
        const taskBreakdown = Array.isArray(record.task_breakdown)
          ? (record.task_breakdown as unknown[])
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
          running_agents: Array.isArray(record.running_agents)
            ? (record.running_agents as unknown[]).filter((v): v is string => typeof v === 'string')
            : [],
          completed_count: Math.max(0, asNumber(record.completed_count) ?? 0),
          total_count: Math.max(0, asNumber(record.total_count) ?? taskBreakdown.length),
          estimated_completion: asString(record.estimated_completion),
        } satisfies WorkspaceMissionStatus
      } catch {
        return null
      }
    },
    refetchInterval: 3_000,
    ...RESILIENT_QUERY_OPTIONS,
  })

  // ── When no missionId, synthesise missionStatus from dispatch state ──────
  const effectiveMissionStatus = missionId
    ? missionStatusQuery
    : {
        ...dispatchStateQuery,
        data: parseDispatchState(dispatchStateQuery.data) ?? null,
      }

  // ── Task runs ────────────────────────────────────────────────────────────
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

  // ── Checkpoints ──────────────────────────────────────────────────────────
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

  // ── Recent missions ──────────────────────────────────────────────────────
  const recentMissionsQuery = useQuery({
    queryKey: ['workspace', 'conductor', 'recent-missions'],
    enabled,
    queryFn: async () => {
      try {
        return parseRecentMissions(await workspaceJson('/api/workspace/missions'))
      } catch {
        return []
      }
    },
    refetchInterval: 10_000,
    ...RESILIENT_QUERY_OPTIONS,
  })

  // ── Project files ────────────────────────────────────────────────────────
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

  // ── Stats ────────────────────────────────────────────────────────────────
  const statsQuery = useQuery({
    queryKey: ['workspace', 'stats'],
    enabled,
    queryFn: async () => {
      try {
        return await workspaceJson<Record<string, unknown>>('/api/workspace/stats')
      } catch {
        return {} as Record<string, unknown>
      }
    },
    refetchInterval: 10_000,
    ...RESILIENT_QUERY_OPTIONS,
  })

  // ── Decompose mutation ───────────────────────────────────────────────────
  const decomposeMutation = useMutation({
    mutationFn: async (goal: string) => {
      const payload = await workspacePost('/api/workspace/decompose', { goal }, 60_000)
      return parseDecomposeResult(payload)
    },
  })

  // ── Launch mutation — POST /api/workspace/dispatch/start ─────────────────
  const startMissionMutation = useMutation({
    mutationFn: async (id: string) => {
      await workspacePost(`/api/workspace/missions/${encodeURIComponent(id)}/start`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace'] })
    },
  })

  const createMissionMutation = useMutation({
    mutationFn: async (_params: { name: string; phase_id?: string }) => {
      // Stub — kept for conductor.tsx isPending reference compatibility
      return { id: '', name: _params.name }
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

  // ── Checkpoint mutations ─────────────────────────────────────────────────
  const approveCheckpointMutation = useMutation({
    mutationFn: async (params: {
      id: string
      action?: 'approve' | 'commit' | 'merge' | 'pr'
      reviewer_notes?: string
    }) => {
      const suffix = params.action === 'commit'
        ? '/approve-and-commit'
        : params.action === 'merge'
          ? '/approve-and-merge'
          : params.action === 'pr'
            ? '/approve-and-pr'
            : '/approve'
      await workspacePost(`/api/workspace/checkpoints/${encodeURIComponent(params.id)}${suffix}`, {
        reviewer_notes: params.reviewer_notes,
      })
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

  // ── Simplified launch: dispatch/start ────────────────────────────────────
  const launchMission = useCallback(
    async (params: {
      goal: string
      projectName?: string
      projectPath?: string
      tasks: Array<{
        title: string
        description?: string
        agent?: string | null
        depends_on?: string[]
        suggested_agent_type?: string | null
      }>
    }) => {
      const payload = await workspacePost('/api/workspace/dispatch/start', {
        mission: params.goal.slice(0, 200),
        mode: 'autonomous',
        tasks: params.tasks.map((t, i) => ({
          id: `task-${String(i + 1).padStart(3, '0')}`,
          title: t.title,
          description: t.description ?? '',
          type: t.suggested_agent_type ?? t.agent ?? 'coding',
          depends_on: t.depends_on ?? [],
          status: 'pending',
        })),
      }, 30_000)

      const record = asRecord(payload)
      const missionIdResult =
        asString(record?.mission_id) ??
        asString(record?.id) ??
        `mission-${Date.now()}`
      const projectIdResult = asString(record?.project_id)

      // Invalidate dispatch state so UI refreshes immediately
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'dispatch', 'state'] })
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'conductor', 'recent-missions'] })

      return { missionId: missionIdResult, projectId: projectIdResult }
    },
    [queryClient],
  )

  // ── Return ───────────────────────────────────────────────────────────────

  return {
    // Mutations
    decompose: decomposeMutation,
    createProject: { mutateAsync: async () => null, isPending: false },
    createPhase: { mutateAsync: async () => ({ id: '' }), isPending: false },
    createMission: createMissionMutation,
    createTask: { mutateAsync: async () => null, isPending: false },
    startMission: startMissionMutation,
    pauseMission: pauseMissionMutation,
    resumeMission: resumeMissionMutation,
    stopMission: stopMissionMutation,
    stopTaskRun: { mutateAsync: async () => undefined, isPending: false },
    retryTaskRun: { mutateAsync: async () => undefined, isPending: false },
    sendTaskRunMessage: { mutateAsync: async () => undefined, isPending: false },
    approveCheckpoint: approveCheckpointMutation,
    rejectCheckpoint: rejectCheckpointMutation,
    launchMission,

    // Queries
    dispatchState: dispatchStateQuery,
    missionStatus: effectiveMissionStatus,
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
