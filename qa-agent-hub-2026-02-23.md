## TypeScript Errors
- `npx tsc --noEmit`: no errors.

## Critical Bugs (P0)
- `src/screens/gateway/agent-hub-layout.tsx:3009` Keyboard `Space` pause/resume uses stale `missionState` captured by a `useEffect([])` listener, so it can send the wrong pause intent (typically always resume) after state changes.
- `src/screens/gateway/agent-hub-layout.tsx:3623` Dispatch failures are forcibly marked as `done` (`moveTasksToStatus(..., 'done')`), producing false-success mission progress/completion and masking real failures.

## Theme / Dark Mode Issues (P1)
- `src/screens/gateway/components/agent-output-panel.tsx:304` (and throughout panel) hardcoded light surfaces/text (`bg-white`, `text-neutral-900`, etc.) with no `dark:` variants; output panel becomes inconsistent in dark themes.
- `src/screens/gateway/components/mission-timeline.tsx:54` (and throughout timeline) uses light-only card/text styles (`bg-white`, `text-neutral-900`) without dark/theme token support.
- `src/screens/gateway/agent-hub-layout.tsx:5380` mission area cards/sections are light-only (`bg-white`, no `dark:` on many blocks), causing mixed-theme UI when app is in dark mode.
- `src/screens/gateway/agent-hub-layout.tsx:6013` Steer modal `Cancel` button lacks dark styles (`border-neutral-200`, `text-neutral-600`, `hover:bg-neutral-50` only).
- `src/screens/gateway/agent-hub-layout.tsx:6144` Kill button in live status row has no dark variants (`hover:bg-red-50` only), low contrast in dark themes.
- `src/routes/__root.tsx:261` splash script only branches on light/dark from `openclaw-settings` and ignores `clawsuite-theme` variants (`paper-light`/`ops-dark`/`premium-dark`) for palette selection, so launch experience is inconsistent with enterprise theme mode.

## Usability Issues (P2)
- `src/screens/gateway/agent-hub-layout.tsx:3323` Mission state is updated optimistically before pause/resume API calls settle; partial failures can leave UI showing paused/running while agents are actually mixed.
- `src/screens/gateway/components/mission-timeline.tsx:104` Non-active agents are labeled `Stopped` even for idle/paused/not-started states, which is misleading.
- `src/screens/gateway/components/mission-timeline.tsx:152` Completion row always says `Mission stopped` for both completed and stopped paths; loses distinction between success and abort.
- `src/screens/gateway/components/agent-output-panel.tsx:197` On SSE error panel only shows `Stream disconnected`; no retry/reconnect control is provided.
- `src/screens/gateway/agent-hub-layout.tsx:5374` History cards set `failed: !completed`; all non-`done` runs (including clean `stopped`) are presented as failed.

## Minor / Polish (P3)
- `src/screens/gateway/agent-hub-layout.tsx:2937` and `src/screens/gateway/agent-hub-layout.tsx:3160` completion events are emitted as `mission_started`, polluting feed semantics and filters.
- `src/screens/gateway/components/live-feed-panel.tsx:260` Clear button hover style (`hover:bg-neutral-800 hover:text-neutral-300`) is tuned for dark UI and appears visually harsh in light mode.
- `src/routes/__root.tsx:145` static `<meta name="theme-color" content="#f97316">` does not adapt per selected theme.
