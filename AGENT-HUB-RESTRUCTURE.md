# Agent Hub Restructure Spec

## Goal
Restructure the Agent Hub from 5 confusing tabs into 3 clear workflow-driven tabs: Overview → Configure → Missions

## Current State
- File: `src/screens/gateway/agent-hub-layout.tsx` (~2800 lines)
- Sub-components: `src/screens/gateway/components/` (team-panel, task-board, live-feed-panel, approvals-panel, agents-working-panel, agent-output-panel, live-activity-panel)
- Current tabs: Office, Mission, Reports, Team, Approvals + Live Feed toggle
- Problems: flow isn't intuitive, organized by feature not workflow, config is buried

## New 3-Tab Structure

### Tab 1: Overview (default landing)
**Purpose:** At-a-glance status. "What's happening right now?"

Layout:
```
┌─────────────────────────────────────────────────────┐
│ Agent Hub // Mission Control          🟢 Connected  │
├─────────────────────────────────────────────────────┤
│ [Overview]  [Configure]  [Missions]                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌─ Mission Status Banner ─────────────────────────┐ │
│ │ 🚀 "Content Pipeline" running · 3 agents · 2/5  │ │
│ │    tasks done          [View Mission] [Stop]     │ │
│ └─────────────────────────────────────────────────┘ │
│  (or "No active mission" with [Start Mission] CTA)  │
│                                                     │
│ ┌─ Quick Stats ───────────────────────────────────┐ │
│ │ 3 Agents │ 2 Active │ 14.2K Tokens │ $0.42     │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─ Agent Cards Grid (2-3 col) ────────────────────┐ │
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐         │ │
│ │ │ R        │ │ W        │ │ E        │         │ │
│ │ │Researcher│ │ Writer   │ │ Editor   │         │ │
│ │ │ Opus     │ │ Sonnet   │ │ Flash    │         │ │
│ │ │ ● idle   │ │ ● active │ │ ● idle   │         │ │
│ │ │[Configure│ │[View Out]│ │[Configure│         │ │
│ │ └──────────┘ └──────────┘ └──────────┘         │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─ Recent Activity ───────────────────────────────┐ │
│ │ 2m ago  Writer completed task "Draft intro"     │ │
│ │ 5m ago  Researcher started research phase       │ │
│ │ 8m ago  Mission "Content Pipeline" launched     │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

Components to reuse:
- Agent cards from current Office tab (simplified)
- Quick stats from current Office stats
- Activity feed from LiveFeedPanel (compact version)

### Tab 2: Configure
**Purpose:** Set up your agents, teams, and connections before launching.

Layout:
```
┌─────────────────────────────────────────────────────┐
│ [Overview]  [Configure]  [Missions]                 │
├────────┬────────────────────────────────────────────┤
│ NAV    │ CONTENT                                    │
│        │                                            │
│ Agents │ (when Agents selected)                     │
│ Teams  │ Agent list with edit capabilities           │
│ Keys   │ Click agent → edit name, model, prompt,    │
│ Mail   │ tools, guardrails                          │
│        │                                            │
│        │ (when Teams selected)                      │
│        │ Team templates, drag agents into roles     │
│        │                                            │
│        │ (when Keys selected)                       │
│        │ Connected providers, API key status        │
│        │                                            │
│        │ (when Approvals/Mail selected)             │
│        │ Pending approval requests                  │
└────────┴────────────────────────────────────────────┘
```

Sub-sections (left nav):
- **Agents** — list of configured agents, click to edit (name, avatar color, model preset, system prompt/soul, role description)
- **Teams** — team templates (Content Pipeline, Research Squad, etc.), assign agents to roles  
- **API Keys** — show connected providers from gateway, status indicators
- **Approvals** — pending human-in-the-loop approvals (moved from separate tab)

### Tab 3: Missions
**Purpose:** Launch, monitor, and review missions.

Layout when no mission active:
```
┌─────────────────────────────────────────────────────┐
│ [Overview]  [Configure]  [Missions]                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌─ Launch Mission ────────────────────────────────┐ │
│ │ Team: [Content Pipeline ▾]                      │ │
│ │ Goal: [Enter mission objective...]              │ │
│ │                        [Launch Mission →]       │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─ Mission History ───────────────────────────────┐ │
│ │ Feb 22 · Content Pipeline · 5 tasks · $0.42    │ │
│ │ Feb 21 · Research Squad · 3 tasks · $0.18      │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

Layout when mission active:
```
┌─────────────────────────────────────────────────────┐
│ [Overview]  [Configure]  [Missions]                 │
├─────────────────────────────────────────────────────┤
│ ┌─ Agents Working ────────────────────────────────┐ │
│ │ Researcher ● active  Opus    ⋯                  │ │
│ │ Writer     ● idle    Sonnet  ⋯                  │ │
│ │ Editor     ● idle    Flash   ⋯                  │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─ Task Board (Kanban) ──────────────────┐ ┌─────┐ │
│ │ INBOX │ ASSIGNED │ IN PROG │ DONE     │ │Notes│ │
│ │       │          │         │          │ │     │ │
│ │       │          │ [task]  │          │ │Team │ │
│ │       │          │ [task]  │          │ │     │ │
│ └────────────────────────────────────────┘ └─────┘ │
│                                                     │
│ (Selected agent output panel slides in from right)  │
└─────────────────────────────────────────────────────┘
```

## Implementation Notes

### What to keep
- All existing sub-components (TaskBoard, AgentsWorkingPanel, LiveFeedPanel, ApprovalsPanel, TeamPanel, AgentOutputPanel)
- The Launch Mission wizard dialog
- The restore previous mission banner
- Gateway connection status pill

### What to reorganize
- Office view content → Overview tab (simplified agent cards + stats)
- Mission tab content → Missions tab (when active)
- Team tab content → Configure > Teams
- Approvals tab content → Configure > Approvals
- Reports → Missions > History section
- Live Feed → collapsible panel on Missions tab (keep the toggle)

### What to simplify
- Remove the isometric office concept entirely for now
- Agent cards in Overview should be clean, minimal (name, model badge, status, one action button)
- The Configure tab should feel like a settings panel, not a dashboard

### Styling
- All light theme (bg-white, bg-neutral-50, border-neutral-200)
- Orange accent for active states and CTAs
- Clean enterprise typography
- Consistent card styling: white bg, border-neutral-200, rounded-xl, shadow-sm

### Tab definitions
```tsx
const TAB_DEFS = [
  { id: 'overview', label: 'Overview', icon: '🏠' },
  { id: 'configure', label: 'Configure', icon: '⚙️' },
  { id: 'missions', label: 'Missions', icon: '🚀' },
]
```

### Configure sub-nav
```tsx
const CONFIG_SECTIONS = [
  { id: 'agents', label: 'Agents', icon: UsersIcon },
  { id: 'teams', label: 'Teams', icon: TeamIcon },
  { id: 'keys', label: 'API Keys', icon: KeyIcon },
  { id: 'approvals', label: 'Approvals', icon: CheckIcon },
]
```
