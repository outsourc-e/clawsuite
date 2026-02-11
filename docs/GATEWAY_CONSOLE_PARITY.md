# Gateway Console Parity Audit

> Generated: 2026-02-10
> Reference: Gateway Console navigation IA

## Legend
- ✅ Wired — fetches from gateway, handles disconnect
- ⚠️ Partially wired — fetches from gateway but missing fields/behaviors
- ❌ Not wired — no route or no gateway data
- 🆕 New — needs route + screen created

---

## STUDIO

### Chat
- **Route:** `/chat/:sessionKey` (also `/new`)
- **Endpoint(s):** `sessions.list`, `sessions.resolve`, `sessions.patch`, `sessions.delete`, SSE via `/api/events`, `/api/send-stream`
- **Status:** ✅ Wired
- **Notes:** Full session lifecycle. SSE stream for real-time events. Send via gateway proxy.

### Dashboard (Studio Overview)
- **Route:** `/dashboard`
- **Endpoint(s):** `/api/session-status`, `/api/cost`, `/api/usage` (→ `sessions.usage`), `/api/provider-usage`, `/api/sessions` (→ `sessions.list`)
- **Status:** ✅ Wired
- **Notes:** Aggregates multiple gateway + provider sources. Widgets poll independently.

---

## GATEWAY (Control Plane)

### Overview
- **Route:** —
- **Endpoint(s):** `usage.status`, `usage.cost`, `channels.status`, `sessions.usage`
- **Status:** ❌ No dedicated route
- **Notes:** Dashboard partially covers this. Could be a dedicated gateway overview page showing connection status, uptime, channel health, session counts. **Candidate for future route** — gateway endpoints exist.

### Channels
- **Route:** —
- **Endpoint(s):** `channels.status` (returns per-channel connection state)
- **Status:** ❌ No route exists
- **Notes:** Gateway supports `channels.status` which returns channel names + connection states. Config available via `config.get` (channels section). **Candidate for new route** — endpoint exists.

### Instances
- **Route:** —
- **Endpoint(s):** No known gateway RPC for listing connected clients/instances
- **Status:** ❌ Missing — no gateway endpoint
- **Notes:** The gateway tracks connected WebSocket clients internally but does not expose an `instances.list` RPC. **Cannot implement without gateway changes.** Flag as missing endpoint.

### Sessions
- **Route:** — (sidebar shows session list, no dedicated `/sessions` page)
- **Endpoint(s):** `sessions.list`, `sessions.usage`, `sessions.preview`, `sessions.usage.logs`, `sessions.usage.timeseries`
- **Status:** ⚠️ Partially wired
- **Notes:** Session list exists in sidebar. No dedicated sessions management page (bulk view, search, delete multiple). Gateway endpoints exist for a full sessions page. **Candidate for new route.**

### Usage
- **Route:** — (widget in dashboard, pill in header)
- **Endpoint(s):** `sessions.usage`, `usage.status`, `usage.cost`, `sessions.usage.logs`, `sessions.usage.timeseries`
- **Status:** ⚠️ Partially wired
- **Notes:** Usage data shown in dashboard widgets + header pill. No dedicated usage page with breakdowns by session/model/time. Gateway endpoints exist for timeseries + logs. **Candidate for new route.**

### Cron Jobs
- **Route:** `/cron`
- **Endpoint(s):** `cron.list` (via fallback chain: `cron.list`, `cron.jobs.list`, `scheduler.jobs.list`), `cron.run`, `cron.runs`, `cron.add`, `cron.update`, `cron.remove`, `cron.status`
- **Status:** ✅ Wired
- **Notes:** Full CRUD. Polls gateway. Shows job list, run history, enable/disable toggle, manual trigger.

---

## AGENT

### Agents
- **Route:** —
- **Endpoint(s):** `agents.list`, `agents.create`, `agents.update`, `agents.delete`, `agents.files.list`, `agents.files.get`, `agents.files.set`
- **Status:** ❌ No route exists
- **Notes:** Gateway has full agent CRUD. Studio has no dedicated agent management page. Active Agents widget on dashboard shows sessions with agent info, but no agent config management. **Candidate for new route** — endpoints exist.

### Skills
- **Route:** `/skills`
- **Endpoint(s):** `skills.status`, `skills.bins`, `skills.install`, `skills.update`, `skills.load.watch` + local filesystem scan
- **Status:** ✅ Wired
- **Notes:** Lists installed + marketplace skills. Install/update via gateway. Also reads local skill directories.

### Nodes
- **Route:** —
- **Endpoint(s):** `node.list`, `node.describe`, `node.pair.list`, `node.pair.approve`, `node.pair.reject`, `node.rename`, `node.invoke`
- **Status:** ❌ No route exists
- **Notes:** Gateway has full node management RPCs. Studio has no node page. **Candidate for new route** — endpoints exist.

---

## SETTINGS

### Config
- **Route:** `/settings` + `/settings/providers`
- **Endpoint(s):** `config.get`, `config.apply`, `config.patch`, `config.schema`, `config.set`
- **Status:** ⚠️ Partially wired
- **Notes:** Settings page exists but is a legacy dialog + basic providers page. Does not expose full config editor. Gateway config RPCs are comprehensive. Could be expanded to show/edit full gateway config.

### Debug
- **Route:** `/debug`
- **Endpoint(s):** `/api/debug/status` (gateway ping/reconnect), `/api/diagnostics` (→ `config.providers`), SSE events
- **Status:** ✅ Wired
- **Notes:** Shows connection status, recent errors/warnings, diagnostic bundle export. Reconnect button. Polls for recent issues every 20s.

### Logs
- **Route:** `/activity` (also `/logs` redirects)
- **Endpoint(s):** SSE via `/api/events` (gateway event stream)
- **Status:** ✅ Wired
- **Notes:** Real-time activity log via SSE. Filters by level/source. Full gateway event stream.

---

## RESOURCES

### Docs
- **Route:** —
- **Endpoint(s):** N/A (static content, links to docs.openclaw.ai)
- **Status:** ❌ No route exists
- **Notes:** Could be a simple page with links to docs, GitHub, Discord. No gateway endpoint needed. **Trivial to add.**

---

## ADDITIONAL STUDIO PAGES (no reference equivalent)

These exist in Studio but aren't in the reference IA:

| Page | Route | Notes |
|------|-------|-------|
| Browser | `/browser` | Studio tool — browser automation UI |
| Terminal | `/terminal` | Studio tool — embedded terminal |
| Tasks | `/tasks` | Studio tool — localStorage kanban |
| Files | `/files` | Agent workspace file browser |
| Memory | `/memory` | Agent memory file viewer |
| Search | modal | Session search overlay |

---

## Missing Gateway Endpoints (cannot implement without gateway changes)

| Feature | Required Endpoint | Notes |
|---------|-------------------|-------|
| Instances | `instances.list` or `clients.list` | Need to list connected WS clients |

---

## Summary

| Section | Items | ✅ Wired | ⚠️ Partial | ❌ Missing Route | ❌ No Endpoint |
|---------|-------|----------|------------|-----------------|----------------|
| Studio | 2 | 2 | 0 | 0 | 0 |
| Gateway | 6 | 1 | 2 | 2 | 1 |
| Agent | 3 | 1 | 0 | 2 | 0 |
| Settings | 3 | 2 | 1 | 0 | 0 |
| Resources | 1 | 0 | 0 | 1 | 0 |
| **Total** | **15** | **6** | **3** | **5** | **1** |

### Routes that can be created (gateway endpoints exist):
1. `/channels` — `channels.status` + `config.get`
2. `/sessions` — `sessions.list` + `sessions.usage` (dedicated management page)
3. `/usage` — `sessions.usage` + `usage.status` + `sessions.usage.timeseries`
4. `/agents` — `agents.list` + `agents.files.*`
5. `/nodes` — `node.list` + `node.pair.*`
6. `/docs` — Static links page (no endpoint needed)

### Routes that CANNOT be created (missing endpoint):
1. `/instances` — No gateway RPC to list connected clients

### Gateway Overview:
Could aggregate `channels.status` + `sessions.usage` + `usage.status` into an overview page, but this overlaps with Dashboard. Recommend Dashboard as the overview equivalent.
