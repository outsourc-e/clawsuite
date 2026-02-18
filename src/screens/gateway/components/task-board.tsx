type TaskBoardProps = {
  selectedAgentName?: string
}

const COLUMNS = ['Inbox', 'Assigned', 'In Progress', 'Review', 'Done']

export function TaskBoard({ selectedAgentName }: TaskBoardProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-primary-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-primary-900 dark:text-neutral-100">
            Tasks
          </h2>
          <p className="truncate text-[11px] text-primary-500">
            {selectedAgentName ? `Filtered: ${selectedAgentName}` : 'Showing all agents'}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-accent-600"
        >
          + New Task
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto px-4 py-3">
        {COLUMNS.map((column) => (
          <div key={column} className="w-52 shrink-0">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                {column}
              </h3>
              <span className="rounded-full bg-primary-100 px-1.5 text-[10px] text-primary-400 dark:bg-neutral-800">
                0
              </span>
            </div>
            <div className="min-h-[200px] space-y-2 rounded-xl border border-dashed border-primary-200 bg-primary-50/50 p-2 dark:border-neutral-800 dark:bg-neutral-900/30">
              <p className="py-8 text-center text-[11px] text-primary-400">
                Drop tasks here
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
