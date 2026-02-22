# ClawSuite Agent Hub - Development Prompts

## Current Status
- Server running on port 3001
- Route: /agents or /gateway
- Specs 1-5 implemented in code

## Prompt for Codex - Verify Live Session Roster (Spec 2)
```
Verify and fix the Live Session Roster in ClawSuite Agent Hub.

Location: src/screens/gateway/agent-hub-layout.tsx
Spec: data/specs/spec-2-session-roster.md

The roster should:
1. Poll /api/sessions every 5 seconds
2. Show real status dots for each agent (idle/thinking/done/error)
3. Have a retry spawn button for dead sessions
4. Use agentSessionMap to track which session belongs to which agent

Test at localhost:3001/agents - verify the team panel shows live status.
Fix any issues in the polling loop and status rendering.
```

## Prompt for Codex - Verify Live Output Streaming (Spec 3)
```
Verify and fix Live Output Streaming in ClawSuite Agent Hub.

Location: src/screens/gateway/components/agent-output-panel.tsx
Spec: data/specs/spec-3-live-output.md

The output panel should:
1. Connect to SSE endpoint /api/chat-events?sessionKey=...
2. Stream responses in real-time as they arrive
3. Show thinking indicators during generation
4. Parse and display tool calls separately

Test at localhost:3001/agents - start a mission and verify output streams live.
Fix any SSE connection or parsing issues.
```

## Prompt for Codex - Verify Mission Execution Robustness (Spec 4)
```
Verify and fix Mission Execution Robustness in ClawSuite Agent Hub.

Location: src/screens/gateway/agent-hub-layout.tsx
Spec: data/specs/spec-4-mission-execution.md

The mission controls should:
1. Use dispatchedTaskIdsRef for idempotency (prevent duplicate sends)
2. Implement pause that prevents new dispatches
3. Implement resume that continues from paused state
4. On stop, call POST /api/chat-abort for active sessions

Test the full mission lifecycle: start -> pause -> resume -> stop.
Fix any issues with state management or API calls.
```

## Prompt for Codex - Verify Enterprise Polish (Spec 5)
```
Verify and fix Enterprise Usability Polish in ClawSuite Agent Hub.

Location: src/screens/gateway/components/live-feed-panel.tsx, agent-hub-layout.tsx
Spec: data/specs/spec-5-enterprise-polish.md

Features to verify:
1. Gateway status banner (connected/disconnected)
2. Live Feed: relative timestamps, color coding, clear button
3. Create Mission: empty state with example chips
4. Task detail: click to see full details
5. Agent card expand: role description, model selector, kill button
6. Keyboard shortcuts: Cmd+Enter (start), Escape (close), Space (pause/resume)

Test each feature at localhost:3001/agents and fix any missing pieces.
```
