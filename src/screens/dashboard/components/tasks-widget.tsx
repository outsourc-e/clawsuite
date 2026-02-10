import * as HugeIcons from '@hugeicons/core-free-icons'
import { useState } from 'react'
import { DashboardGlassCard } from './dashboard-glass-card'
import type { DashboardIcon } from './dashboard-types'
import { cn } from '@/lib/utils'

type KanbanColumnId = 'backlog' | 'in-progress' | 'review' | 'done'

type KanbanPriority = 'P0' | 'P1' | 'P2' | 'P3'

type KanbanTask = {
  id: string
  title: string
  assignee: string
  priority: KanbanPriority
}

type KanbanColumn = {
  id: KanbanColumnId
  title: string
  tasks: Array<KanbanTask>
}

const TASKS_STORAGE_KEY = 'openclaw-studio-kanban-tasks'
const TaskListTodoIcon =
  ((HugeIcons as Record<string, DashboardIcon>)['TaskListTodoIcon'] || HugeIcons.Task01Icon) as DashboardIcon

type TasksWidgetProps = {
  draggable?: boolean
}

const seededColumns: Array<KanbanColumn> = [
  {
    id: 'backlog',
    title: 'Backlog',
    tasks: [
      {
        id: 'backlog-1',
        title: 'Implement diff-aware multi-file patch rollback',
        assignee: 'Ari',
        priority: 'P0',
      },
      {
        id: 'backlog-2',
        title: 'Add MCP schema validator for tool...',
        assignee: 'Kai',
        priority: 'P1',
      },
      {
        id: 'backlog-3',
        title: 'Publish SDK examples for hierarchical sub-agents',
        assignee: 'Lina',
        priority: 'P2',
      },
    ],
  },
  {
    id: 'in-progress',
    title: 'In Progress',
    tasks: [
      {
        id: 'in-progress-1',
        title: 'Optimize plan execution latency under token...',
        assignee: 'Lina',
        priority: 'P0',
      },
      {
        id: 'in-progress-2',
        title: 'Ship terminal streaming reconnect guardrails',
        assignee: 'Rex',
        priority: 'P1',
      },
    ],
  },
  {
    id: 'review',
    title: 'Review',
    tasks: [
      {
        id: 'review-1',
        title: 'Add evaluator harness for regression prompts',
        assignee: 'Nia',
        priority: 'P1',
      },
      {
        id: 'review-2',
        title: 'Upgrade connection sandbox telemetry...',
        assignee: 'Sam',
        priority: 'P2',
      },
    ],
  },
  {
    id: 'done',
    title: 'Done',
    tasks: [
      {
        id: 'done-1',
        title: 'Refactor router transitions for route-lev...',
        assignee: 'Ari',
        priority: 'P1',
      },
      {
        id: 'done-2',
        title: 'Deploy usage alerting thresholds with auto-...',
        assignee: 'Rex',
        priority: 'P0',
      },
    ],
  },
]

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readPriority(value: unknown): KanbanPriority | null {
  if (value === 'P0' || value === 'P1' || value === 'P2' || value === 'P3') return value
  return null
}

function normalizeTask(value: unknown, fallbackId: string): KanbanTask | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const title = readString(row.title)
  const assignee = readString(row.assignee)
  const priority = readPriority(row.priority)
  if (title.length === 0 || assignee.length === 0 || !priority) return null

  return {
    id: readString(row.id) || fallbackId,
    title,
    assignee,
    priority,
  }
}

function normalizeColumns(input: unknown): Array<KanbanColumn> | null {
  if (!Array.isArray(input)) return null

  const columns = input
    .map(function mapColumn(value, index) {
      if (!value || typeof value !== 'object') return null
      const column = value as Record<string, unknown>
      const id = column.id
      if (id !== 'backlog' && id !== 'in-progress' && id !== 'review' && id !== 'done') return null

      const title = readString(column.title)
      const tasks = Array.isArray(column.tasks) ? column.tasks : []
      const normalizedTasks = tasks
        .map(function mapTask(task, taskIndex) {
          return normalizeTask(task, `${id}-${index + 1}-${taskIndex + 1}`)
        })
        .filter(Boolean) as Array<KanbanTask>

      return {
        id,
        title: title.length > 0 ? title : 'Column',
        tasks: normalizedTasks,
      }
    })
    .filter(Boolean) as Array<KanbanColumn>

  if (columns.length !== seededColumns.length) return null
  return columns
}

function loadKanbanColumns(): Array<KanbanColumn> {
  if (typeof window === 'undefined') return seededColumns

  try {
    const raw = window.localStorage.getItem(TASKS_STORAGE_KEY)
    if (!raw) {
      window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(seededColumns))
      return seededColumns
    }

    const parsed = JSON.parse(raw) as unknown
    const normalized = normalizeColumns(parsed)
    if (!normalized) {
      window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(seededColumns))
      return seededColumns
    }

    return normalized
  } catch {
    window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(seededColumns))
    return seededColumns
  }
}

function priorityClasses(priority: KanbanPriority): string {
  if (priority === 'P0') return 'bg-red-500/15 text-red-500'
  if (priority === 'P1') return 'bg-orange-500/15 text-orange-500'
  if (priority === 'P2') return 'bg-yellow-500/20 text-yellow-500'
  return 'bg-green-500/15 text-green-500'
}

function assigneeClasses(name: string): string {
  const initial = name.charCodeAt(0) || 0
  const palette = [
    'bg-primary-300/70 text-primary-900',
    'bg-primary-400/70 text-primary-950',
    'bg-primary-500/60 text-primary-50',
    'bg-primary-600/60 text-primary-50',
  ]

  return palette[initial % palette.length] || palette[0]
}

export function TasksWidget({ draggable = false }: TasksWidgetProps) {
  const [columns] = useState<Array<KanbanColumn>>(loadKanbanColumns)

  return (
    <DashboardGlassCard
      title="Tasks"
      description="Kanban board for active engineering work."
      icon={TaskListTodoIcon}
      badge="Demo"
      draggable={draggable}
      className="h-full"
    >
      <div className="grid h-full min-h-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {columns.map(function mapColumn(column) {
          return (
            <section
              key={column.id}
              className="flex min-h-0 flex-col rounded-xl border border-primary-200 bg-primary-100/55 p-2"
            >
              <header className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-primary-900 text-balance">{column.title}</h3>
                <span className="rounded-full border border-primary-200 bg-primary-50/80 px-2 py-0.5 text-xs font-medium text-primary-700 tabular-nums">
                  {column.tasks.length}
                </span>
              </header>

              <div className="flex min-h-0 max-h-56 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
                {column.tasks.map(function mapTask(task) {
                  return (
                    <article
                      key={task.id}
                      className="min-h-18 rounded-lg border border-primary-200 bg-primary-50/90 px-2.5 py-2"
                    >
                      <p className="line-clamp-1 text-sm text-ink text-pretty">{task.title}</p>

                      <div className="mt-2 flex items-center justify-between">
                        <div
                          className={cn(
                            'flex size-5 items-center justify-center rounded-full text-[10px] font-medium uppercase',
                            assigneeClasses(task.assignee),
                          )}
                          aria-label={`Assignee ${task.assignee}`}
                          title={task.assignee}
                        >
                          {task.assignee.charAt(0)}
                        </div>

                        <span
                          className={cn(
                            'rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums',
                            priorityClasses(task.priority),
                          )}
                        >
                          {task.priority}
                        </span>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </DashboardGlassCard>
  )
}
