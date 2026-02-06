# SPEC-001: Dashboard Infrastructure

**Agent:** `dashboard-infra`  
**Priority:** P0 (Critical - Foundation)  
**Est. Tokens:** 150k  
**Dependencies:** None  
**Blocks:** All dashboard widgets

---

## 🎯 Objective

Build the foundational dashboard route with drag-and-drop widget grid system, layout persistence, and 3 starter widgets (Tasks, Usage, Active Agents).

---

## 📋 Requirements

### 1. Dashboard Route
- **Path:** `/dashboard`
- **Component:** `src/screens/dashboard/dashboard-screen.tsx`
- **Make it the default route** (clicking logo navigates here)
- **Layout:** Full-width grid with responsive breakpoints

### 2. Widget Grid System
**Library:** `react-grid-layout`

```tsx
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
```

**Features:**
- Drag to reorder widgets
- Resize widgets
- Responsive layouts (sm, md, lg, xl breakpoints)
- Persist layout to localStorage
- Collision detection
- Bounds checking (widgets stay in grid)

**Grid Config:**
```typescript
const breakpoints = { 
  lg: 1200, 
  md: 996, 
  sm: 768, 
  xs: 480 
};
const cols = { 
  lg: 12, 
  md: 10, 
  sm: 6, 
  xs: 4 
};
```

### 3. Widget Interface
```typescript
interface Widget {
  id: string; // unique identifier
  type: 'tasks' | 'usage' | 'agents' | 'weather' | 'notes' | 'quick-actions' | 'cost-tracker' | 'x-feed';
  position: { 
    x: number; // grid column (0-11)
    y: number; // grid row
    w: number; // width in columns
    h: number; // height in rows
  };
  config: Record<string, any>; // widget-specific settings
  enabled: boolean; // show/hide widget
}

interface DashboardLayout {
  widgets: Widget[];
  breakpoint: 'sm' | 'md' | 'lg' | 'xl';
  version: number; // for migration
}
```

### 4. Layout Persistence
**Storage:** `localStorage` key: `openclaw-studio-dashboard-layout`

```typescript
// Save layout on change
const handleLayoutChange = (layout: Layout[]) => {
  const dashboardLayout = {
    widgets: widgets.map(w => ({
      ...w,
      position: layout.find(l => l.i === w.id)
    })),
    breakpoint: currentBreakpoint,
    version: 1
  };
  localStorage.setItem('openclaw-studio-dashboard-layout', JSON.stringify(dashboardLayout));
};

// Load layout on mount
const loadLayout = (): DashboardLayout => {
  const saved = localStorage.getItem('openclaw-studio-dashboard-layout');
  return saved ? JSON.parse(saved) : getDefaultLayout();
};
```

### 5. Default Layout
```typescript
const getDefaultLayout = (): DashboardLayout => ({
  widgets: [
    {
      id: 'tasks',
      type: 'tasks',
      position: { x: 0, y: 0, w: 6, h: 4 },
      config: {},
      enabled: true
    },
    {
      id: 'usage',
      type: 'usage',
      position: { x: 6, y: 0, w: 6, h: 2 },
      config: {},
      enabled: true
    },
    {
      id: 'agents',
      type: 'agents',
      position: { x: 6, y: 2, w: 6, h: 2 },
      config: {},
      enabled: true
    }
  ],
  breakpoint: 'lg',
  version: 1
});
```

---

## 🧩 Components to Create

### 1. `src/screens/dashboard/dashboard-screen.tsx`
**Main dashboard container**

```tsx
export function DashboardScreen() {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [layout, setLayout] = useState<Layout[]>([]);
  
  useEffect(() => {
    const savedLayout = loadLayout();
    setWidgets(savedLayout.widgets);
    setLayout(widgetsToLayout(savedLayout.widgets));
  }, []);

  const handleLayoutChange = (newLayout: Layout[]) => {
    setLayout(newLayout);
    saveLayout(widgets, newLayout);
  };

  return (
    <div className="dashboard-screen">
      <DashboardHeader />
      <WidgetGrid 
        widgets={widgets}
        layout={layout}
        onLayoutChange={handleLayoutChange}
      />
    </div>
  );
}
```

### 2. `src/screens/dashboard/components/widget-grid.tsx`
**Grid layout wrapper**

```tsx
interface WidgetGridProps {
  widgets: Widget[];
  layout: Layout[];
  onLayoutChange: (layout: Layout[]) => void;
}

export function WidgetGrid({ widgets, layout, onLayoutChange }: WidgetGridProps) {
  return (
    <GridLayout
      className="widget-grid"
      layout={layout}
      cols={12}
      rowHeight={80}
      width={1200}
      onLayoutChange={onLayoutChange}
      draggableHandle=".widget-drag-handle"
      isDraggable={true}
      isResizable={true}
      compactType="vertical"
    >
      {widgets.map(widget => (
        <div key={widget.id} className="widget-container">
          <WidgetRenderer widget={widget} />
        </div>
      ))}
    </GridLayout>
  );
}
```

### 3. `src/screens/dashboard/components/widget-renderer.tsx`
**Dynamic widget renderer**

```tsx
export function WidgetRenderer({ widget }: { widget: Widget }) {
  switch (widget.type) {
    case 'tasks':
      return <TasksWidget config={widget.config} />;
    case 'usage':
      return <UsageWidget config={widget.config} />;
    case 'agents':
      return <AgentsWidget config={widget.config} />;
    default:
      return <div>Unknown widget: {widget.type}</div>;
  }
}
```

### 4. `src/screens/dashboard/components/dashboard-header.tsx`
**Header with add widget button**

```tsx
export function DashboardHeader() {
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);

  return (
    <div className="dashboard-header">
      <h1>Dashboard</h1>
      <Button onClick={() => setAddWidgetOpen(true)}>
        <Plus className="w-4 h-4 mr-2" />
        Add Widget
      </Button>
      <AddWidgetDialog 
        open={addWidgetOpen} 
        onClose={() => setAddWidgetOpen(false)}
      />
    </div>
  );
}
```

### 5. `src/screens/dashboard/components/add-widget-dialog.tsx`
**Modal to add new widgets**

```tsx
export function AddWidgetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const widgetTypes = [
    { type: 'tasks', name: 'Tasks', icon: CheckSquare },
    { type: 'usage', name: 'Usage Meter', icon: Activity },
    { type: 'agents', name: 'Active Agents', icon: Bot },
    // Add more as widgets are built
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Widget</DialogTitle>
        </DialogHeader>
        <div className="widget-grid">
          {widgetTypes.map(({ type, name, icon: Icon }) => (
            <Button
              key={type}
              variant="outline"
              onClick={() => handleAddWidget(type)}
            >
              <Icon className="w-4 h-4 mr-2" />
              {name}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 🎨 Widgets to Build (Phase 1)

### Widget 1: Tasks Widget
**Component:** `src/screens/dashboard/widgets/tasks-widget.tsx`  
**Data Source:** Mission Control `data/tasks.json`

**Features:**
- Show tasks in columns: Backlog, In Progress, Review, Done
- Click task → open in Mission Control (external)
- Badge counts per column
- Recent activity indicator

```tsx
export function TasksWidget({ config }: { config: any }) {
  const { data: tasks } = useTasks();
  
  const grouped = groupBy(tasks, 'status');

  return (
    <WidgetCard title="Tasks" icon={CheckSquare}>
      <div className="kanban-mini">
        {['backlog', 'in_progress', 'review', 'done'].map(status => (
          <div key={status} className="kanban-column">
            <div className="column-header">
              {status} <Badge>{grouped[status]?.length || 0}</Badge>
            </div>
            <div className="task-list">
              {grouped[status]?.slice(0, 3).map(task => (
                <TaskCard key={task.id} task={task} compact />
              ))}
            </div>
          </div>
        ))}
      </div>
      <Button variant="link" asChild>
        <a href="http://localhost:8001" target="_blank">
          Open Mission Control →
        </a>
      </Button>
    </WidgetCard>
  );
}
```

### Widget 2: Usage Widget
**Component:** `src/screens/dashboard/widgets/usage-widget.tsx`  
**Data Source:** Existing Usage Meter component

**Features:**
- Token usage percentage
- Cost today
- Model breakdown
- Click → open full usage modal

```tsx
export function UsageWidget({ config }: { config: any }) {
  const { data: usage } = useSessionStatus();

  return (
    <WidgetCard title="Usage" icon={Activity}>
      <div className="usage-stats">
        <div className="stat">
          <span className="label">Tokens Used</span>
          <span className="value">{usage.tokens.toLocaleString()}</span>
          <Progress value={usage.percentage} />
        </div>
        <div className="stat">
          <span className="label">Cost Today</span>
          <span className="value">${usage.costToday.toFixed(2)}</span>
        </div>
      </div>
      <Button variant="link" onClick={openUsageMeter}>
        View Details →
      </Button>
    </WidgetCard>
  );
}
```

### Widget 3: Active Agents Widget
**Component:** `src/screens/dashboard/widgets/agents-widget.tsx`  
**Data Source:** `/api/sessions` filtered by `kind: "isolated"`

**Features:**
- List of running agents
- Progress bars
- Runtime counter
- Click → open agent details

```tsx
export function AgentsWidget({ config }: { config: any }) {
  const { data: agents } = useActiveAgents();

  return (
    <WidgetCard title="Active Agents" icon={Bot}>
      {agents.length === 0 ? (
        <EmptyState>No agents running</EmptyState>
      ) : (
        <div className="agent-list">
          {agents.map(agent => (
            <AgentCard key={agent.sessionId} agent={agent} compact />
          ))}
        </div>
      )}
      <Button variant="link" onClick={openAgentView}>
        View All →
      </Button>
    </WidgetCard>
  );
}
```

---

## 🎨 Styling

### Widget Card Base
```tsx
// src/screens/dashboard/components/widget-card.tsx
export function WidgetCard({ 
  title, 
  icon: Icon, 
  children,
  actions
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Card className="widget-card">
      <CardHeader className="widget-drag-handle cursor-move">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
```

### CSS (add to `src/styles.css`)
```css
/* Dashboard Grid */
.dashboard-screen {
  @apply p-6 h-full overflow-auto;
}

.widget-grid {
  @apply relative;
}

.widget-container {
  @apply h-full;
}

.widget-card {
  @apply h-full flex flex-col;
}

.widget-card .widget-drag-handle {
  @apply cursor-move hover:bg-muted/50 transition-colors;
}

.widget-card .card-content {
  @apply flex-1 overflow-auto;
}

/* React Grid Layout overrides */
.react-grid-item {
  @apply transition-all;
}

.react-grid-item.react-draggable-dragging {
  @apply opacity-50 z-50;
}

.react-grid-item.react-grid-placeholder {
  @apply bg-primary/20 rounded-lg;
}
```

---

## 🔗 Data Hooks

### `src/screens/dashboard/hooks/use-dashboard-layout.ts`
```typescript
export function useDashboardLayout() {
  const [layout, setLayout] = useState<DashboardLayout>(getDefaultLayout());

  const saveLayout = (newLayout: DashboardLayout) => {
    localStorage.setItem('openclaw-studio-dashboard-layout', JSON.stringify(newLayout));
    setLayout(newLayout);
  };

  const addWidget = (type: Widget['type']) => {
    const newWidget: Widget = {
      id: `${type}-${Date.now()}`,
      type,
      position: findEmptySpace(layout.widgets),
      config: {},
      enabled: true
    };
    saveLayout({
      ...layout,
      widgets: [...layout.widgets, newWidget]
    });
  };

  const removeWidget = (id: string) => {
    saveLayout({
      ...layout,
      widgets: layout.widgets.filter(w => w.id !== id)
    });
  };

  return { layout, saveLayout, addWidget, removeWidget };
}
```

### `src/screens/dashboard/hooks/use-tasks.ts`
```typescript
export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const response = await fetch('/data/tasks.json'); // Mission Control data
      return response.json();
    },
    refetchInterval: 30000 // Refresh every 30s
  });
}
```

### `src/screens/dashboard/hooks/use-active-agents.ts`
```typescript
export function useActiveAgents() {
  const { data: sessions } = useSessions();
  
  return {
    data: sessions?.filter(s => 
      s.kind === 'isolated' && 
      s.status === 'running'
    ) || [],
  };
}
```

---

## 🧪 Testing Checklist

- [ ] Dashboard loads at `/dashboard`
- [ ] Logo click navigates to dashboard
- [ ] Widgets render in grid
- [ ] Drag widget → layout updates
- [ ] Resize widget → layout updates
- [ ] Layout persists after refresh
- [ ] Add widget button opens modal
- [ ] Add widget → new widget appears
- [ ] Remove widget → widget disappears
- [ ] Tasks widget shows Mission Control data
- [ ] Usage widget shows token usage
- [ ] Agents widget shows active sub-agents
- [ ] Responsive on mobile (stacked)
- [ ] No console errors
- [ ] No layout shifts on load

---

## 📦 Dependencies to Add

```json
{
  "react-grid-layout": "^1.4.4",
  "@types/react-grid-layout": "^1.3.5"
}
```

Install:
```bash
npm install react-grid-layout @types/react-grid-layout
```

---

## 🚀 Success Criteria

1. ✅ Dashboard route functional
2. ✅ Drag-and-drop working smoothly
3. ✅ 3 widgets rendering with real data
4. ✅ Layout persists across sessions
5. ✅ Add/remove widgets working
6. ✅ Responsive design (mobile → stacked)
7. ✅ No performance issues with 3 widgets
8. ✅ Clean, maintainable code

---

## 🎯 Handoff to Next Agent

After completing this spec:
- **Widget Library Agent** can build additional widgets (Weather, Notes, etc.)
- **Skills Browser Agent** can add skills widget
- **Terminal Agent** can add terminal output widget

---

**Estimated Completion:** 4-6 hours (Codex full-auto mode)
