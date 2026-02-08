# Activity Logs — Architecture & Reference

## Overview
Studio surfaces real-time Gateway events in a unified Activity Log. Events flow from the Gateway WebSocket stream through a server-side buffer to the browser via SSE.

## Architecture
```
Gateway WS → activity-stream.ts → activity-events.ts (ring buffer)
                                        ↓
                                  /api/events (SSE) → Browser EventSource
                                  /api/events/recent (JSON) → Initial load
```

## Event Types
| Type | Source | Example |
|------|--------|---------|
| `gateway` | WS connect/disconnect | "Gateway connected" |
| `model` | Agent events with model info | "Model switched to claude-sonnet-4-5" |
| `usage` | Usage update events | "Usage updated" |
| `cron` | Cron execution events | "Cron job ran" |
| `tool` | Tool invocation events | "Tool invoked: web_search" |
| `error` | Any error | "Gateway connection failed" |
| `session` | Chat/session events | "Session activity" |

## Event Levels
- `info` — Normal operation (green dot)
- `warn` — Attention needed (amber dot)
- `error` — Problem occurred (red dot)

## Security
All event payloads are sanitized before reaching the browser:
- Fields matching `apiKey`, `token`, `secret`, `password`, `refresh` are recursively stripped
- Regex pattern also catches inline `api_key=VALUE` patterns in strings
- Sanitizer is in `src/server/activity-stream.ts`

## Key Files
- `src/server/activity-events.ts` — Ring buffer (100 events), EventEmitter
- `src/server/activity-stream.ts` — Gateway WS → event normalization + sanitization
- `src/routes/api/events.ts` — SSE endpoint
- `src/routes/api/events/recent.ts` — JSON endpoint for initial load
- `src/screens/activity/use-activity-events.ts` — React hook (SSE + fetch)
- `src/screens/dashboard/components/activity-log-widget.tsx` — Dashboard widget
- `src/screens/activity/activity-screen.tsx` — Full-page view at `/activity`

## Extending
Add new event types by:
1. Adding the type to `ActivityEvent['type']` in `src/types/activity-event.ts`
2. Mapping Gateway events in `activity-stream.ts`
3. Adding icon/label in `activity-event-row.tsx`
