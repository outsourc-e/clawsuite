# SPEC-004: Agent View (Right Sidebar)

**Agent:** `agent-view`  
**Priority:** P1 (High Value)  
**Est. Tokens:** 60k  
**Dependencies:** None  
**Blocks:** None

---

## 🎯 Objective

Build a right sidebar panel that shows active sub-agents, task queue, and agent history in real-time. Think "Task Manager for AI agents."

---

## 📋 Requirements

### 1. Right Sidebar Panel
- **Collapsible** (toggle button in header)
- **Width:** 320px default
- **Position:** Fixed right, full height
- **Visibility:** Auto-show on wide screens (1440px+), hidden by default on smaller
- **Persist state:** localStorage

### 2. Sections

#### **Active Agents** (Top Priority)
- Currently running sub-agents
- Live progress bars
- Runtime counter (updates every second)
- Model used
- Token usage (streaming)
- Quick actions: Pause | Kill | Inspect

#### **Queue** (Middle)
- Pending tasks waiting to start
- Estimated start time
- Priority badge
- Cancel button

#### **History** (Bottom)
- Completed agents (last 10)
- Success/failure status
- Final cost
- View transcript button

### 3. Agent States
```typescript
type AgentStatus = 'queued' | 'running' | 'complete' | 'failed' | 'paused';
```

---

## 🧩 Components to Create

### 1. `src/components/agent-view/agent-view-panel.tsx`
**Main sidebar panel**

```tsx
export function AgentViewPanel() {
  const { isOpen, toggle } = useAgentViewPanel();
  const { active, queued, history } = useAgents();

  if (!isOpen) {
    return (
      <button 
        className="agent-view-toggle"
        onClick={toggle}
        title="Show Agent View"
      >
        <Bot className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="agent-view-panel">
      <AgentViewHeader onToggle={toggle} />
      
      <div className="agent-view-content">
        <Section title="Active" badge={active.length}>
          {active.length === 0 ? (
            <EmptyState>No agents running</EmptyState>
          ) : (
            active.map(agent => (
              <AgentCard key={agent.sessionId} agent={agent} />
            ))
          )}
        </Section>

        <Section title="Queue" badge={queued.length} collapsible>
          {queued.map(agent => (
            <QueuedAgentCard key={agent.id} agent={agent} />
          ))}
        </Section>

        <Section title="History" badge={history.length} collapsible defaultCollapsed>
          {history.map(agent => (
            <HistoryAgentCard key={agent.sessionId} agent={agent} />
          ))}
        </Section>
      </div>
    </div>
  );
}
```

### 2. `src/components/agent-view/agent-card.tsx`
**Active agent card**

```tsx
export function AgentCard({ agent }: { agent: ActiveAgent }) {
  const { mutate: kill } = useKillAgent();
  const runtime = useRuntime(agent.startedAt);

  return (
    <Card className="agent-card">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm">{agent.agentId}</CardTitle>
            </div>
            <CardDescription className="text-xs mt-1">
              {agent.task.slice(0, 60)}...
            </CardDescription>
          </div>
          <Badge variant="default" className="text-xs">
            {agent.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pb-2">
        {/* Progress */}
        {agent.progress !== undefined && (
          <div>
            <Progress value={agent.progress} />
            <p className="text-xs text-muted-foreground mt-1">
              {agent.progress}% complete
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Runtime</span>
            <p className="font-mono">{formatRuntime(runtime)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Model</span>
            <p className="font-mono text-xs">{agent.model.split('/').pop()}</p>
          </div>
          {agent.tokens && (
            <>
              <div>
                <span className="text-muted-foreground">Tokens</span>
                <p className="font-mono">{agent.tokens.total.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Cost</span>
                <p className="font-mono">${agent.cost?.toFixed(3) || '0.00'}</p>
              </div>
            </>
          )}
        </div>
      </CardContent>

      <CardFooter className="pt-2 flex gap-2">
        <Button size="sm" variant="outline" className="flex-1">
          <Eye className="w-3 h-3 mr-1" />
          Inspect
        </Button>
        <Button 
          size="sm" 
          variant="destructive"
          onClick={() => kill(agent.sessionId)}
        >
          <X className="w-3 h-3" />
        </Button>
      </CardFooter>
    </Card>
  );
}
```

### 3. `src/components/agent-view/section.tsx`
**Collapsible section wrapper**

```tsx
interface SectionProps {
  title: string;
  badge?: number;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

export function Section({ 
  title, 
  badge, 
  collapsible, 
  defaultCollapsed,
  children 
}: SectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed || false);

  return (
    <div className="section">
      <div 
        className="section-header"
        onClick={collapsible ? () => setCollapsed(!collapsed) : undefined}
      >
        <h3 className="text-sm font-semibold">
          {title}
          {badge !== undefined && badge > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">
              {badge}
            </Badge>
          )}
        </h3>
        {collapsible && (
          <ChevronDown 
            className={cn("w-4 h-4 transition-transform", {
              "rotate-180": !collapsed
            })}
          />
        )}
      </div>
      
      {!collapsed && (
        <div className="section-content">
          {children}
        </div>
      )}
    </div>
  );
}
```

---

## 🔌 Data Layer

### Interfaces
```typescript
interface ActiveAgent {
  sessionId: string;
  agentId: string; // 'codex', 'research', etc.
  task: string;
  status: 'running' | 'paused';
  model: string;
  startedAt: string; // ISO timestamp
  progress?: number; // 0-100
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
  cost?: number;
  estimatedCompletion?: string;
}

interface QueuedAgent {
  id: string;
  agentId: string;
  task: string;
  priority: 'low' | 'normal' | 'high';
  estimatedStart?: string;
}

interface HistoryAgent extends ActiveAgent {
  completedAt: string;
  status: 'complete' | 'failed';
  error?: string;
  transcriptPath?: string;
}
```

### Hooks

#### `src/hooks/use-agents.ts`
```typescript
export function useAgents() {
  const { data: sessions } = useSessions();

  const active = useMemo(() => {
    return sessions
      ?.filter(s => s.kind === 'isolated' && s.status === 'running')
      .map(s => ({
        sessionId: s.id,
        agentId: s.agentId || 'unknown',
        task: s.initialMessage || 'No task description',
        status: 'running',
        model: s.model,
        startedAt: s.createdAt,
        tokens: s.usage?.tokens,
        cost: s.usage?.cost,
      })) as ActiveAgent[] || [];
  }, [sessions]);

  const queued: QueuedAgent[] = [];

  const history: HistoryAgent[] = useMemo(() => {
    return sessions
      ?.filter(s => s.kind === 'isolated' && s.status !== 'running')
      .slice(0, 10) // Last 10
      .map(s => ({
        sessionId: s.id,
        agentId: s.agentId || 'unknown',
        task: s.initialMessage || 'No task description',
        status: s.status === 'error' ? 'failed' : 'complete',
        model: s.model,
        startedAt: s.createdAt,
        completedAt: s.updatedAt,
        tokens: s.usage?.tokens,
        cost: s.usage?.cost,
        error: s.error,
      })) as HistoryAgent[] || [];
  }, [sessions]);

  return { active, queued, history };
}
```

#### `src/hooks/use-agent-view-panel.ts`
```typescript
export function useAgentViewPanel() {
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('openclaw-agent-view-open');
    // Auto-open on wide screens
    return saved ? JSON.parse(saved) : window.innerWidth >= 1440;
  });

  const toggle = () => {
    setIsOpen(prev => {
      const newValue = !prev;
      localStorage.setItem('openclaw-agent-view-open', JSON.stringify(newValue));
      return newValue;
    });
  };

  return { isOpen, toggle };
}
```

#### `src/hooks/use-kill-agent.ts`
```typescript
export function useKillAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      await fetch(`/api/sessions/${sessionId}/kill`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['sessions']);
      toast.success('Agent terminated');
    },
  });
}
```

---

## 🎨 Styling

```css
.agent-view-panel {
  @apply fixed right-0 top-0 h-full w-80 bg-background border-l border-border;
  @apply flex flex-col z-30;
}

.agent-view-toggle {
  @apply fixed right-4 bottom-4 p-3 rounded-full bg-primary text-primary-foreground;
  @apply shadow-lg hover:shadow-xl transition-all z-30;
}

.agent-view-content {
  @apply flex-1 overflow-y-auto p-4 space-y-4;
}

.section {
  @apply space-y-2;
}

.section-header {
  @apply flex items-center justify-between cursor-pointer py-2;
}

.section-content {
  @apply space-y-2;
}

.agent-card {
  @apply text-xs;
}

/* Adjust main content when agent view is open */
.main-content.with-agent-view {
  margin-right: 320px;
}
```

---

## 🧪 Testing Checklist

- [ ] Panel toggles open/close
- [ ] Active agents appear in real-time
- [ ] Progress bars update
- [ ] Runtime counter ticks
- [ ] Kill button terminates agent
- [ ] Inspect opens agent details
- [ ] History shows completed agents
- [ ] Collapsed sections persist
- [ ] Responsive on narrow screens
- [ ] Auto-opens on wide screens

---

## 🚀 Success Criteria

1. ✅ Real-time agent monitoring
2. ✅ Live progress tracking
3. ✅ Quick actions (kill, inspect)
4. ✅ Agent history
5. ✅ Collapsible sections
6. ✅ Responsive design

---

**Estimated Completion:** 2-3 hours
