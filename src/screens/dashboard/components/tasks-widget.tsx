import { Task01Icon } from '@hugeicons/core-free-icons'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { DashboardGlassCard } from './dashboard-glass-card'
import type { TodoTask } from './dashboard-types'
import { cn } from '@/lib/utils'

type SessionsApiResponse = {
  sessions?: Array<Record<string, unknown>>
}

const TASKS_STORAGE_KEY = 'openclaw-studio-dashboard-local-tasks'

const fallbackLocalTasks: Array<TodoTask> = [
  { id: 'local-1', text: 'Review system status', completed: false, source: 'local' },
  { id: 'local-2', text: 'Resume latest session', completed: false, source: 'local' },
]

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value === 'true' || value === 'done'
  return false
}

function loadLocalTasks(): Array<TodoTask> {
  if (typeof window === 'undefined') return fallbackLocalTasks
  try {
    const raw = window.localStorage.getItem(TASKS_STORAGE_KEY)
    if (!raw) return fallbackLocalTasks
    const parsed = JSON.parse(raw) as Array<Partial<TodoTask>>
    if (!Array.isArray(parsed)) return fallbackLocalTasks

    const tasks = parsed
      .map(function mapTask(task, index) {
        const text = readString(task.text)
        if (text.length === 0) return null
        return {
          id: readString(task.id) || `local-${index + 1}`,
          text,
          completed: readBoolean(task.completed),
          source: 'local' as const,
        }
      })
      .filter(Boolean) as Array<TodoTask>

    return tasks.length > 0 ? tasks : fallbackLocalTasks
  } catch {
    return fallbackLocalTasks
  }
}

function saveLocalTasks(tasks: Array<TodoTask>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks))
}

async function fetchSessionsForTasks(): Promise<Array<Record<string, unknown>>> {
  const response = await fetch('/api/sessions')
  if (!response.ok) return []
  const payload = (await response.json()) as SessionsApiResponse
  return Array.isArray(payload.sessions) ? payload.sessions : []
}

function buildGatewayTasks(rows: Array<Record<string, unknown>>): Array<TodoTask> {
  return rows
    .map(function mapSession(row, index) {
      const taskText =
        readString(row.task) ||
        readString(row.label) ||
        readString(row.title) ||
        readString(row.derivedTitle)
      if (taskText.length === 0) return null
      const status = readString(row.status).toLowerCase()
      const key = readString(row.key) || `gateway-${index + 1}`
      const completed = status === 'completed' || status === 'done'
      return {
        id: key,
        text: taskText,
        completed,
        source: 'gateway' as const,
      }
    })
    .filter(Boolean)
    .slice(0, 6) as Array<TodoTask>
}

export function TasksWidget() {
  const [localTasks, setLocalTasks] = useState<Array<TodoTask>>(loadLocalTasks)
  const [draft, setDraft] = useState('')

  const gatewayTasksQuery = useQuery({
    queryKey: ['dashboard', 'tasks-gateway'],
    queryFn: fetchSessionsForTasks,
    refetchInterval: 30_000,
  })

  const gatewayTasks = useMemo(function deriveGatewayTasks() {
    const rows = Array.isArray(gatewayTasksQuery.data) ? gatewayTasksQuery.data : []
    return buildGatewayTasks(rows)
  }, [gatewayTasksQuery.data])

  const completedCount = localTasks.filter(function countCompleted(task) {
    return task.completed
  }).length

  function toggleLocalTask(taskId: string) {
    setLocalTasks(function updateTasks(current) {
      const next = current.map(function mapTask(task) {
        if (task.id !== taskId) return task
        return { ...task, completed: !task.completed }
      })
      saveLocalTasks(next)
      return next
    })
  }

  function addTask() {
    const text = draft.trim()
    if (text.length === 0) return
    setLocalTasks(function updateTasks(current) {
      const next = [
        ...current,
        {
          id: `local-${Date.now()}`,
          text,
          completed: false,
          source: 'local',
        },
      ]
      saveLocalTasks(next)
      return next
    })
    setDraft('')
  }

  return (
    <DashboardGlassCard
      title="Tasks"
      description="Gateway tasks plus local todo tracking."
      icon={Task01Icon}
      className="h-full"
    >
      <div className="rounded-xl border border-primary-200 bg-primary-100/50 px-3 py-2 text-sm text-primary-700">
        <span className="tabular-nums">{completedCount}</span>
        <span className="text-pretty"> of </span>
        <span className="tabular-nums">{localTasks.length}</span>
        <span className="text-pretty"> personal tasks completed</span>
      </div>

      {gatewayTasks.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-xs text-primary-600 text-pretty">Gateway tasks</p>
          <div className="space-y-1">
            {gatewayTasks.map(function mapGatewayTask(task) {
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50/80 px-2.5 py-2 text-sm"
                >
                  <span
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      task.completed ? 'bg-emerald-500' : 'bg-primary-400',
                    )}
                    aria-hidden="true"
                  />
                  <span className="line-clamp-1 text-ink text-pretty">{task.text}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-2">
        <p className="mb-1 text-xs text-primary-600 text-pretty">Personal todo</p>
        <div className="space-y-1.5">
          {localTasks.map(function mapLocalTask(task) {
            return (
              <label
                key={task.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-primary-200 bg-primary-50/80 px-2.5 py-2"
              >
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={function onChangeTask() {
                    toggleLocalTask(task.id)
                  }}
                  className="size-3.5 accent-primary-600"
                />
                <span
                  className={cn(
                    'line-clamp-1 text-sm text-pretty',
                    task.completed ? 'text-primary-500' : 'text-ink',
                  )}
                >
                  {task.text}
                </span>
              </label>
            )
          })}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={draft}
              onChange={function onChangeDraft(event) {
                setDraft(event.target.value)
              }}
              onKeyDown={function onKeyDownDraft(event) {
                if (event.key === 'Enter') addTask()
              }}
              placeholder="Add task"
              className="h-8 min-w-0 flex-1 rounded-md border border-primary-200 bg-primary-50/80 px-2 text-sm text-primary-900 outline-none transition-colors focus:border-primary-400"
            />
            <button
              type="button"
              onClick={addTask}
              className="h-8 shrink-0 rounded-md border border-primary-200 bg-primary-100/60 px-2.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </DashboardGlassCard>
  )
}
