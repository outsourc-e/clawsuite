import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { emitFeedEvent } from './feed-event-bus'
type TaskBoardProps = { agents: Array<{ id: string; name: string }>; selectedAgentId?: string }
type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'
type TaskStatus = 'inbox' | 'assigned' | 'in_progress' | 'review' | 'done'
type HubTask = {
  id: string
  title: string
  description: string
  priority: TaskPriority
  status: TaskStatus
  agentId?: string
  createdAt: number
  updatedAt: number
}
const STORAGE_KEY = 'clawsuite:hub-tasks'
const COLUMNS: Array<{ key: TaskStatus; label: string }> = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
]
const PRIORITIES: Array<{
  key: TaskPriority
  label: string
  badge: string
}> = [
  { key: 'urgent', label: 'Urgent', badge: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
  { key: 'high', label: 'High', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  { key: 'normal', label: 'Normal', badge: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200' },
  { key: 'low', label: 'Low', badge: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200' },
]
function isTaskStatus(value: unknown): value is TaskStatus {
  return COLUMNS.some((column) => column.key === value)
}
function isTaskPriority(value: unknown): value is TaskPriority {
  return PRIORITIES.some((priority) => priority.key === value)
}
function toTask(value: unknown): HubTask | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  const description = typeof row.description === 'string' ? row.description.trim() : ''
  const createdAt = typeof row.createdAt === 'number' ? row.createdAt : Date.now()
  const updatedAt = typeof row.updatedAt === 'number' ? row.updatedAt : createdAt
  const agentId = typeof row.agentId === 'string' ? row.agentId : undefined
  if (!id || !title || !isTaskPriority(row.priority) || !isTaskStatus(row.status)) return null
  return { id, title, description, priority: row.priority, status: row.status, agentId, createdAt, updatedAt }
}
function loadTasks(): Array<HubTask> {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => toTask(entry))
      .filter((entry): entry is HubTask => Boolean(entry))
      .sort((left, right) => right.updatedAt - left.updatedAt)
  } catch {
    return []
  }
}
function createTaskId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
function statusLabel(status: TaskStatus): string {
  return COLUMNS.find((column) => column.key === status)?.label ?? status
}
export function TaskBoard({ agents, selectedAgentId }: TaskBoardProps) {
  const [tasks, setTasks] = useState<Array<HubTask>>([])
  const [hydrated, setHydrated] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null)
  const [form, setForm] = useState({ title: '', description: '', priority: 'normal' as TaskPriority, agentId: selectedAgentId ?? '' })
  useEffect(() => {
    setTasks(loadTasks())
    setHydrated(true)
  }, [])
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks, hydrated])
  const agentNameById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent.name])), [agents])
  const selectedAgentName = selectedAgentId ? agentNameById.get(selectedAgentId) ?? selectedAgentId : undefined
  const tasksByColumn = useMemo(() => {
    const grouped: Record<TaskStatus, Array<HubTask>> = { inbox: [], assigned: [], in_progress: [], review: [], done: [] }
    tasks.forEach((task) => grouped[task.status].push(task))
    ;(Object.keys(grouped) as Array<TaskStatus>).forEach((status) => grouped[status].sort((a, b) => b.updatedAt - a.updatedAt))
    return grouped
  }, [tasks])
  function closeCreateForm() {
    setIsCreating(false)
    setForm((previous) => ({ ...previous, title: '', description: '' }))
  }
  function openCreateForm() {
    setForm({ title: '', description: '', priority: 'normal', agentId: selectedAgentId ?? '' })
    setIsCreating(true)
  }
  function handleCreateTask() {
    const title = form.title.trim()
    if (!title) return
    const now = Date.now()
    const agentId = form.agentId || undefined
    const nextTask: HubTask = {
      id: createTaskId(),
      title,
      description: form.description.trim(),
      priority: form.priority,
      status: agentId ? 'assigned' : 'inbox',
      agentId,
      createdAt: now,
      updatedAt: now,
    }
    setTasks((previous) => [nextTask, ...previous])
    emitFeedEvent({
      type: 'task_created',
      message: `Task created: ${nextTask.title}`,
      taskTitle: nextTask.title,
      agentName: agentId ? agentNameById.get(agentId) : undefined,
    })
    if (agentId) {
      emitFeedEvent({
        type: 'task_assigned',
        message: `Task assigned: ${nextTask.title}`,
        taskTitle: nextTask.title,
        agentName: agentNameById.get(agentId),
      })
    }
    closeCreateForm()
  }
  function moveTask(taskId: string, nextStatus: TaskStatus) {
    const existing = tasks.find((task) => task.id === taskId)
    if (!existing || existing.status === nextStatus) return
    const movedTask: HubTask = { ...existing, status: nextStatus, updatedAt: Date.now() }
    setTasks((previous) => previous.map((task) => (task.id === taskId ? movedTask : task)))
    const agentName = movedTask.agentId ? agentNameById.get(movedTask.agentId) : undefined
    emitFeedEvent({
      type: 'task_moved',
      message: `${movedTask.title} moved ${statusLabel(existing.status)} -> ${statusLabel(nextStatus)}`,
      taskTitle: movedTask.title,
      agentName,
    })
    if (nextStatus === 'done') {
      emitFeedEvent({
        type: 'task_completed',
        message: `Task completed: ${movedTask.title}`,
        taskTitle: movedTask.title,
        agentName,
      })
    }
  }
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-primary-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-primary-900 dark:text-neutral-100">Tasks</h2>
          <p className="truncate text-[11px] text-primary-500">
            {selectedAgentName ? `Focused agent: ${selectedAgentName}` : 'Showing all agents'}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-x-auto px-4 py-3">
        <div className="flex h-full w-full gap-3">
          {COLUMNS.map((column) => {
            const columnTasks = tasksByColumn[column.key]
            return (
              <div key={column.key} className="min-w-[200px] max-w-[240px] flex-1">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-500">{column.label}</h3>
                  <div className="flex items-center gap-1.5">
                    {column.key === 'inbox' ? (
                      <button
                        type="button"
                        onClick={() => (isCreating ? closeCreateForm() : openCreateForm())}
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors',
                          isCreating
                            ? 'bg-primary-200 text-primary-700 hover:bg-primary-300 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600'
                            : 'bg-accent-500 text-white hover:bg-accent-600',
                        )}
                      >
                        {isCreating ? 'Cancel' : '+ New Task'}
                      </button>
                    ) : null}
                    <span className="rounded-full bg-primary-100 px-1.5 text-[10px] text-primary-500 dark:bg-neutral-800 dark:text-neutral-300">
                      {columnTasks.length}
                    </span>
                  </div>
                </div>
                <div
                  onDragOver={(event) => {
                    event.preventDefault()
                    if (dragOverStatus !== column.key) setDragOverStatus(column.key)
                  }}
                  onDragLeave={() => {
                    if (dragOverStatus === column.key) setDragOverStatus(null)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const taskId = event.dataTransfer.getData('text/plain') || draggedTaskId
                    if (taskId) moveTask(taskId, column.key)
                    setDraggedTaskId(null)
                    setDragOverStatus(null)
                  }}
                  className={cn(
                    'min-h-[240px] space-y-2 rounded-xl border border-primary-200 bg-primary-50/40 p-2 transition-colors dark:border-neutral-800 dark:bg-neutral-900/30',
                    dragOverStatus === column.key && 'border-accent-400 bg-accent-50/60 dark:border-accent-500 dark:bg-accent-950/20',
                  )}
                >
                  {column.key === 'inbox' && isCreating ? (
                    <form
                      className="space-y-2 rounded-lg border border-primary-200 bg-white p-2.5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
                      onSubmit={(event) => {
                        event.preventDefault()
                        handleCreateTask()
                      }}
                    >
                      <input
                        type="text"
                        value={form.title}
                        onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                        placeholder="Task title"
                        className="w-full rounded-md border border-primary-200 bg-white px-2 py-1.5 text-xs text-primary-900 outline-none ring-accent-400 focus:ring-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                        required
                      />
                      <textarea
                        value={form.description}
                        onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                        placeholder="Description (optional)"
                        rows={3}
                        className="w-full resize-none rounded-md border border-primary-200 bg-white px-2 py-1.5 text-xs text-primary-900 outline-none ring-accent-400 focus:ring-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                      />
                      <div className="flex flex-wrap gap-1">
                        {PRIORITIES.map((priority) => (
                          <button
                            key={priority.key}
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, priority: priority.key }))}
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors',
                              form.priority === priority.key
                                ? priority.badge
                                : 'bg-primary-100 text-primary-500 hover:bg-primary-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700',
                            )}
                          >
                            {priority.label}
                          </button>
                        ))}
                      </div>
                      <select
                        value={form.agentId}
                        onChange={(event) => setForm((prev) => ({ ...prev, agentId: event.target.value }))}
                        className="w-full rounded-md border border-primary-200 bg-white px-2 py-1.5 text-xs text-primary-900 outline-none ring-accent-400 focus:ring-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                      >
                        <option value="">Unassigned</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>{agent.name}</option>
                        ))}
                      </select>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={closeCreateForm}
                          className="rounded-md px-2 py-1 text-[11px] font-medium text-primary-500 hover:bg-primary-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={!form.title.trim()}
                          className="rounded-md bg-accent-500 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Create
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {columnTasks.length === 0 ? (
                    <p className="py-8 text-center text-[11px] text-primary-400">Drop tasks here</p>
                  ) : null}
                  {columnTasks.map((task) => {
                    const priority = PRIORITIES.find((item) => item.key === task.priority)
                    const assignee = task.agentId ? agentNameById.get(task.agentId) ?? task.agentId : 'Unassigned'
                    const dimmed = Boolean(selectedAgentId && task.agentId !== selectedAgentId)
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(event) => {
                          setDraggedTaskId(task.id)
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData('text/plain', task.id)
                        }}
                        onDragEnd={() => {
                          setDraggedTaskId(null)
                          setDragOverStatus(null)
                        }}
                        className={cn(
                          'cursor-grab rounded-lg border border-primary-200 bg-white p-2.5 shadow-sm active:cursor-grabbing dark:border-neutral-700 dark:bg-neutral-900',
                          dimmed && 'opacity-50',
                        )}
                      >
                        <p className="text-xs font-semibold text-primary-900 dark:text-neutral-100">{task.title}</p>
                        {task.description ? (
                          <p className="mt-1 line-clamp-3 text-[11px] text-primary-500 dark:text-neutral-400">{task.description}</p>
                        ) : null}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', priority?.badge)}>
                            {priority?.label ?? 'Normal'}
                          </span>
                          <span className="truncate text-[10px] text-primary-500 dark:text-neutral-400">{assignee}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
