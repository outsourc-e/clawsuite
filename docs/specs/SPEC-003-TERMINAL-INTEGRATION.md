# SPEC-003: Terminal Integration

**Agent:** `terminal-integration`  
**Priority:** P1 (High Value)  
**Est. Tokens:** 80k  
**Dependencies:** Terminal component already exists (aad81618)  
**Blocks:** None

---

## 🎯 Objective

Integrate the existing terminal component into OpenClaw Studio as both a bottom panel (VSCode-style) and a dedicated route.

**NOTE:** Terminal component already built (`terminal/` folder, 234k tokens). This spec is about **UI integration**, not building the terminal from scratch.

---

## 📋 Requirements

### 1. Bottom Panel (Primary UI)
- Toggle panel with `Ctrl+\`` (backtick) keyboard shortcut
- Resizable height (drag top border)
- Multiple terminal tabs
- Minimize/maximize/close buttons
- Persists state in localStorage

### 2. Dedicated Route (Secondary)
- **Path:** `/terminal`
- Full-screen terminal view
- Same tab management as bottom panel
- Link in left sidebar nav

### 3. Terminal Features (Already Exist)
- ✅ xterm.js integration
- ✅ PTY session spawning
- ✅ Command history
- ✅ Output streaming
- ✅ Copy/paste support

---

## 🧩 Components to Create/Modify

### 1. `src/components/terminal-panel.tsx` (NEW)
**Bottom panel container**

```tsx
export function TerminalPanel() {
  const { isOpen, height, setHeight } = useTerminalPanel();
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  if (!isOpen) return null;

  return (
    <div 
      className="terminal-panel"
      style={{ height: `${height}px` }}
    >
      <TerminalPanelHeader 
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onNewTab={handleNewTab}
        onCloseTab={handleCloseTab}
        onToggle={() => setIsOpen(false)}
      />
      
      <Resizer onResize={setHeight} />
      
      <div className="terminal-content">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={cn("terminal-tab", {
              active: tab.id === activeTab
            })}
          >
            <Terminal sessionId={tab.sessionId} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 2. `src/components/terminal-panel-header.tsx` (NEW)
**Panel header with tabs**

```tsx
interface TerminalPanelHeaderProps {
  tabs: TerminalTab[];
  activeTab: string | null;
  onTabChange: (id: string) => void;
  onNewTab: () => void;
  onCloseTab: (id: string) => void;
  onToggle: () => void;
}

export function TerminalPanelHeader(props: TerminalPanelHeaderProps) {
  return (
    <div className="terminal-panel-header">
      <div className="tabs-container">
        {props.tabs.map(tab => (
          <div
            key={tab.id}
            className={cn("tab", { active: tab.id === props.activeTab })}
            onClick={() => props.onTabChange(tab.id)}
          >
            <Terminal className="w-3 h-3" />
            <span>{tab.name || 'Terminal'}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                props.onCloseTab(tab.id);
              }}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button className="new-tab-btn" onClick={props.onNewTab}>
          <Plus className="w-3 h-3" />
        </button>
      </div>
      
      <div className="actions">
        <button onClick={props.onToggle} title="Close Terminal (Ctrl+`)">
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
```

### 3. `src/components/resizer.tsx` (NEW)
**Resizable panel divider**

```tsx
export function Resizer({ onResize }: { onResize: (height: number) => void }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.clientY;
      onResize(Math.max(100, Math.min(600, newHeight)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onResize]);

  return (
    <div 
      className={cn("resizer", { dragging: isDragging })}
      onMouseDown={handleMouseDown}
    />
  );
}
```

### 4. `src/hooks/use-terminal-panel.ts` (NEW)
**Panel state management**

```typescript
export function useTerminalPanel() {
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('openclaw-terminal-panel-open');
    return saved ? JSON.parse(saved) : false;
  });

  const [height, setHeight] = useState(() => {
    const saved = localStorage.getItem('openclaw-terminal-panel-height');
    return saved ? parseInt(saved) : 300;
  });

  useEffect(() => {
    localStorage.setItem('openclaw-terminal-panel-open', JSON.stringify(isOpen));
  }, [isOpen]);

  useEffect(() => {
    localStorage.setItem('openclaw-terminal-panel-height', height.toString());
  }, [height]);

  // Keyboard shortcut: Ctrl+`
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { isOpen, setIsOpen, height, setHeight };
}
```

### 5. Modify `src/screens/chat/chat-screen.tsx`
**Add terminal panel to main layout**

```tsx
export function ChatScreen() {
  const { isOpen } = useTerminalPanel();

  return (
    <div className={cn("chat-screen", {
      "with-terminal": isOpen
    })}>
      {/* Existing chat content */}
      <div className="chat-content">
        {/* ... */}
      </div>

      {/* NEW: Terminal panel */}
      <TerminalPanel />
    </div>
  );
}
```

### 6. `src/screens/terminal/terminal-screen.tsx` (EXISTS)
**Full-screen terminal route**

**Modify to:**
- Use full viewport height
- Add toolbar with terminal controls
- Share state with bottom panel (same tabs)

```tsx
export function TerminalScreen() {
  const { tabs, activeTab, createTab, closeTab, switchTab } = useTerminalTabs();

  return (
    <div className="terminal-screen">
      <TerminalToolbar 
        tabs={tabs}
        activeTab={activeTab}
        onNewTab={createTab}
        onCloseTab={closeTab}
        onTabChange={switchTab}
      />
      
      <div className="terminal-content-fullscreen">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={cn("terminal-tab", {
              active: tab.id === activeTab
            })}
          >
            <Terminal sessionId={tab.sessionId} fullscreen />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 🔌 Data Layer

### Terminal Tab Interface
```typescript
interface TerminalTab {
  id: string; // unique tab id
  sessionId: string; // PTY session id from OpenClaw
  name?: string; // custom tab name
  cwd?: string; // current working directory
  status: 'active' | 'idle' | 'error';
}
```

### Hooks

#### `src/hooks/use-terminal-tabs.ts` (NEW)
```typescript
export function useTerminalTabs() {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const createTab = async () => {
    const sessionId = await spawnTerminalSession();
    const newTab: TerminalTab = {
      id: `tab-${Date.now()}`,
      sessionId,
      status: 'active'
    };
    setTabs([...tabs, newTab]);
    setActiveTab(newTab.id);
  };

  const closeTab = (id: string) => {
    const tab = tabs.find(t => t.id === id);
    if (tab) {
      killTerminalSession(tab.sessionId);
    }
    setTabs(tabs.filter(t => t.id !== id));
    if (activeTab === id && tabs.length > 1) {
      setActiveTab(tabs[0].id);
    }
  };

  const switchTab = (id: string) => {
    setActiveTab(id);
  };

  return { tabs, activeTab, createTab, closeTab, switchTab };
}
```

#### API Calls
```typescript
async function spawnTerminalSession(): Promise<string> {
  const res = await fetch('/api/terminal/spawn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      cwd: '~/.openclaw/workspace',
      shell: process.env.SHELL || '/bin/bash'
    })
  });
  const { sessionId } = await res.json();
  return sessionId;
}

async function killTerminalSession(sessionId: string) {
  await fetch(`/api/terminal/${sessionId}`, {
    method: 'DELETE'
  });
}
```

---

## 🎨 Styling

```css
/* Terminal Panel (Bottom) */
.terminal-panel {
  @apply fixed bottom-0 left-0 right-0 bg-background border-t border-border;
  @apply flex flex-col;
  z-index: 40;
}

.terminal-panel-header {
  @apply flex items-center justify-between px-2 py-1 bg-muted/50;
  @apply border-b border-border;
}

.terminal-panel .tabs-container {
  @apply flex items-center gap-1;
}

.terminal-panel .tab {
  @apply flex items-center gap-2 px-3 py-1 rounded-t-md;
  @apply text-sm cursor-pointer hover:bg-muted;
}

.terminal-panel .tab.active {
  @apply bg-background border-t border-l border-r border-border;
}

.terminal-content {
  @apply flex-1 overflow-hidden;
}

.terminal-tab {
  @apply hidden h-full;
}

.terminal-tab.active {
  @apply block;
}

/* Resizer */
.resizer {
  @apply h-1 bg-border cursor-ns-resize hover:bg-primary transition-colors;
}

.resizer.dragging {
  @apply bg-primary;
}

/* Full-screen Terminal */
.terminal-screen {
  @apply h-full flex flex-col;
}

.terminal-content-fullscreen {
  @apply flex-1 overflow-hidden;
}

/* Layout adjustments when terminal is open */
.chat-screen.with-terminal .chat-messages {
  /* Reduce height to make room for terminal */
  height: calc(100vh - 400px); /* Adjust based on terminal height */
}
```

---

## 🧪 Testing Checklist

- [ ] Press Ctrl+` → Terminal panel toggles
- [ ] Drag top border → Panel resizes
- [ ] Panel height persists after refresh
- [ ] Create new tab → New terminal spawns
- [ ] Close tab → Terminal session ends
- [ ] Switch tabs → Active terminal changes
- [ ] Commands execute correctly
- [ ] Output streams in real-time
- [ ] Copy/paste works
- [ ] `/terminal` route works
- [ ] Full-screen terminal functional
- [ ] Tabs sync between panel and route
- [ ] No memory leaks (sessions cleanup)

---

## 📦 Dependencies

**Already installed:**
- xterm.js
- Terminal component code

**May need:**
```bash
npm install @xterm/xterm @xterm/addon-fit
```

---

## 🚀 Success Criteria

1. ✅ Bottom panel toggles with Ctrl+`
2. ✅ Resizable height persists
3. ✅ Multiple tabs working
4. ✅ Terminal sessions spawn correctly
5. ✅ Full-screen route functional
6. ✅ Keyboard shortcuts work
7. ✅ Clean session cleanup on tab close

---

**Estimated Completion:** 3-4 hours
