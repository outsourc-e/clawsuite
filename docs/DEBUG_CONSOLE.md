# Debug Console

## Overview

The Gateway Debug Console is available at `/debug` and is designed to help
users quickly diagnose Gateway issues without exposing secrets or running
commands automatically.

It includes three sections:

1. Connection Status
- Current connection state (`connected`, `connecting`, `disconnected`)
- Masked Gateway URL (`protocol://host:port` only)
- Uptime (while connected) or time since last disconnect
- Manual reconnect trigger

2. Recent Errors & Events
- Reuses `useActivityEvents` stream client
- Shows only `warn` and `error` level events
- Displays the last 20 issue events
- Event details are expandable

3. LLM Troubleshooter (Safe Mode)
- Static pattern matcher (no live LLM/API calls)
- Suggests copy-only commands for common failures
- Shows a clear safety disclaimer
- Links to OpenClaw docs: https://docs.openclaw.ai

## Safety Guardrails

- No command execution is performed by the Debug Console.
- Commands are copy-only.
- Sensitive fields are sanitized in server-side activity event processing.
- Gateway URL output is masked to host/port only.
- Tokens, passwords, API keys, and similar secrets are never intentionally
  rendered in Debug Console output.

## Extending the Suggestion Map

Suggestion matching is implemented in:

- `src/screens/debug/debug-console-screen.tsx`

To add a new mapping:

1. Add a new entry to `TROUBLESHOOTER_RULES` with:
- `id`
- `patterns` (one or more regex patterns)
- `suggestion` text
- `command` (copy-only command string)

2. Keep suggestions operational and safe:
- Do not add command execution behavior.
- Do not include secrets in suggestion text.

3. Keep a default fallback:
- `DEFAULT_TROUBLESHOOTER_RULE` is used when no pattern matches.

## Error Pattern Mapping Reference

| Pattern | Suggestion | Command |
| --- | --- | --- |
| `Gateway connection closed` | Check if OpenClaw Gateway is running: `openclaw gateway status` | `openclaw gateway status` |
| `Gateway connection refused` | Start the Gateway: `openclaw gateway start` | `openclaw gateway start` |
| `Authentication failed` or `401` | Verify your Gateway token in `openclaw.json` | `openclaw status` |
| `ECONNREFUSED` | Gateway may not be running. Try: `openclaw gateway restart` | `openclaw gateway restart` |
| `timeout` | Gateway may be overloaded. Check system resources. | `openclaw status` |
| Unknown / unmatched | Run `openclaw status` for diagnostics | `openclaw status` |
