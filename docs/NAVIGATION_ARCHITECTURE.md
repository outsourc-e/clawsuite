# Navigation Architecture

## Two Shells

### DashboardShell (`/dashboard`)
- **Purpose**: Observe. System health, cost, agents, activity.
- **Layout**: No sidebar. Thin header with system context.
- **Primary action**: "Enter Workspace →"
- **Feel**: Monitoring room, not a workspace.

### WorkspaceShell (`/chat/*`, `/terminal`, `/files`, etc.)
- **Purpose**: Work. Chat, code, browse, automate.
- **Layout**: Left sidebar + content area.
- **Default route**: `/chat/main` (Sessions)
- **Primary action**: "View Dashboard" in sidebar.

## Routing Map

| Path | Shell | Screen |
|------|-------|--------|
| `/` | — | → redirect to `/chat/main` |
| `/dashboard` | DashboardShell | Dashboard |
| `/chat/:sessionKey` | WorkspaceShell | Chat |
| `/chat/main` | WorkspaceShell | Chat (main session) |
| `/new` | — | → redirect to `/chat/new` |
| `/terminal` | WorkspaceShell | Terminal |
| `/files` | WorkspaceShell | Files |
| `/skills` | WorkspaceShell | Skills |
| `/memory` | WorkspaceShell | Memory |
| `/browser` | WorkspaceShell | Browser |
| `/activity` | WorkspaceShell | Activity |
| `/cron` | WorkspaceShell | Cron |
| `/settings` | WorkspaceShell | Settings |
| `/settings/providers` | WorkspaceShell | Providers |
| `/debug` | WorkspaceShell | Debug |

## Sidebar IA (WorkspaceShell)

```
PRIMARY
  Sessions          /chat/main     (emphasized, default)
  Dashboard         /dashboard     (secondary link)

TOOLS
  Terminal          /terminal
  Browser           /browser
  Skills            /skills

AUTOMATION
  Cron              /cron
  Activity          /activity

SYSTEM
  Memory            /memory
  Files             /files
  Providers         /settings/providers
  Settings          /settings
  Debug             /debug
```

## Widget Metadata (structural prep, no UI)

```ts
type WidgetMeta = {
  id: string
  scope: 'dashboard' | 'workspace'
  tier: 'primary' | 'secondary' | 'demo'
  defaultVisible: boolean
}
```

## Design Principles
- Dashboard = observe (no sidebar, monitoring-only)
- Workspace = work (sidebar, sessions-first)
- No mixing of concerns
- Enterprise routing: calm, predictable, no surprises
