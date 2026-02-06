# SPEC-007: Swarm Animations

**Agent:** `swarm-animations`
**Priority:** P1 (High UX Value)
**Est. Tokens:** 90k
**Dependencies:** `SPEC-004 Agent View`, existing chat stream/events, Framer Motion
**Blocks:** None

---

## 🎯 Objective

Build a dynamic “agent swarm” animation system that visually links chat activity to live agent cards, continuously reorganizes cards by completion state, and reflects real-time status updates with smooth, performant transitions on desktop and mobile.

---

## 📋 Requirements

### 1. Chat → Swarm Spawn Animation
- Trigger when a user message causes one or more agents to start.
- Animation sequence:
  1. Message bubble visually “flies” from chat list to swarm panel origin.
  2. New swarm card drops into list with spring physics.
  3. Card settles and enters normal list layout flow.
- If multiple agents spawn from one message, stagger card drops by 40–80ms.
- Respect reduced motion (`prefers-reduced-motion`) with opacity/scale fallback.

### 2. Dynamic Card Organization by Completion Status
- Continuously order cards by derived completion score.
- Near-complete cards drift toward top.
- Queued/early cards settle toward bottom.
- Reorder updates should feel stable (no jitter) using hysteresis threshold.

### 3. Status Bubbles on Cards
- Each card must show one live status bubble:
  - `thinking`
  - `checkpoint`
  - `question`
- Bubble style and micro-animation differ by state.
- Bubble updates in real time from event stream.

### 4. FLIP Reordering Animations
- Animate card position changes with FLIP pipeline:
  - First: capture previous bounds.
  - Last: compute new bounds after sort.
  - Invert: apply transform delta.
  - Play: spring back to identity.
- Reordering must preserve scroll position and avoid layout jump.

### 5. Pulsing Connection Lines
- Draw connection lines from source message anchor to active card anchors.
- Pulse intensity/frequency based on per-agent activity level.
- Fade out lines when agent reaches terminal state.

### 6. Framer Motion Implementation
- Must use:
  - `layoutId` for shared element transitions (chat bubble → swarm token/ghost).
  - `AnimatePresence` for card enter/exit.
  - Spring-based motion for drop/reorder.
- No CSS-only substitutes for core transitions.

### 7. WebSocket Real-Time Updates
- Status and progress changes come from WS events.
- Events must support out-of-order handling, idempotency, and reconnect replay.

### 8. Mobile-Responsive Behavior
- Must support phone-sized viewports with alternate motion paths and lower visual density.
- Motion cost must degrade gracefully on low-power devices.

---

## 🧱 Architecture

### Rendering Layers
1. **Chat Layer**: message list and message anchor refs.
2. **Swarm Layer**: agent card list container and card anchor refs.
3. **Overlay FX Layer**: absolute-position SVG/canvas lines and transient flight ghosts.

Use one shared coordination hook to map ids → DOM rects and animation intents.

### Core Modules
- `src/components/swarm/swarm-panel.tsx`
- `src/components/swarm/swarm-card.tsx`
- `src/components/swarm/swarm-status-bubble.tsx`
- `src/components/swarm/swarm-connection-overlay.tsx`
- `src/components/swarm/swarm-flight-layer.tsx`
- `src/hooks/use-swarm-animation-coordinator.ts`
- `src/hooks/use-swarm-ordering.ts`
- `src/hooks/use-swarm-websocket.ts`
- `src/lib/swarm/sort-score.ts`
- `src/lib/swarm/flip.ts`
- `src/lib/swarm/types.ts`

---

## 📐 Data Model

```ts
type SwarmAgentState = 'queued' | 'thinking' | 'checkpoint' | 'question' | 'complete' | 'failed';

type SwarmBubbleState = 'thinking' | 'checkpoint' | 'question';

type SwarmAgent = {
  agentId: string;
  sourceMessageId: string;
  title: string;
  state: SwarmAgentState;
  progress: number; // 0..1
  activity: number; // 0..1, decays when idle
  queueIndex: number;
  updatedAt: number;
  revision: number; // monotonic per agent
};

type SwarmSortSnapshot = {
  agentId: string;
  score: number;
  rank: number;
};

type SwarmAnimationIntent =
  | { type: 'spawn'; agentId: string; sourceMessageId: string; at: number }
  | { type: 'reorder'; at: number }
  | { type: 'state-change'; agentId: string; from: SwarmAgentState; to: SwarmAgentState; at: number };
```

---

## 🔢 Ordering Strategy

### Completion Score

```ts
type ScoreInput = {
  state: SwarmAgentState;
  progress: number;
  activity: number;
  queueIndex: number;
  updatedAt: number;
  now: number;
};

function computeCompletionScore(input: ScoreInput): number {
  const stateBoost = {
    complete: 1.0,
    checkpoint: 0.82,
    thinking: 0.55,
    question: 0.48,
    queued: 0.2,
    failed: 0.1,
  }[input.state];

  const progressWeight = input.progress * 0.65;
  const activityWeight = input.activity * 0.2;
  const queuePenalty = Math.min(input.queueIndex * 0.015, 0.15);
  const freshnessBoost = Math.max(0, 1 - (input.now - input.updatedAt) / 15000) * 0.08;

  return stateBoost + progressWeight + activityWeight + freshnessBoost - queuePenalty;
}
```

### Jitter Prevention (Hysteresis)
- Reorder only when candidate rank delta persists for `>= 250ms`.
- Ignore score changes `< 0.035` compared with previous stable score.
- Cap reorder frequency to 8Hz max.

### Tie Breakers
1. Higher `score`
2. More recent `updatedAt`
3. Lower `queueIndex`
4. Stable previous rank

---

## 🎬 Animation Spec

### A. Chat → Swarm Spawn Sequence

#### Trigger
- `agent_spawned` event with `sourceMessageId`.

#### Steps
1. Resolve `sourceMessage` DOM rect and swarm panel entry rect.
2. Render transient ghost chip in `swarm-flight-layer` with `layoutId="spawn-{agentId}"`.
3. Animate ghost along curved path (`x`, `y`, `scale`, `opacity`) in 280–420ms.
4. On flight completion, mount card in list with `AnimatePresence` + drop spring:
   - Initial: `{ y: -18, opacity: 0, scale: 0.96 }`
   - Animate: `{ y: 0, opacity: 1, scale: 1 }`
   - Transition: spring `{ stiffness: 420, damping: 30, mass: 0.7 }`
5. Remove ghost node.

#### Reduced Motion
- Skip path flight.
- Use 120ms opacity crossfade and minimal scale.

### B. Card Reorder (FLIP + Framer Layout)
- Each card is `motion.div layout`.
- Card key is stable `agentId`.
- Reorder driven by sorted array updates.
- Use:
  - `layout="position"`
  - transition spring `{ stiffness: 500, damping: 38, mass: 0.72 }`
- For large jumps (> 240px), add subtle overshoot clamp to prevent bounce chaos.

### C. Status Bubble Animation
- `thinking`: soft pulse (1.0 → 1.06) every 1.6s.
- `checkpoint`: short ping burst on enter.
- `question`: gentle wobble every 2.2s until resolved.
- Bubble transitions use `AnimatePresence` keyed by bubble state.

### D. Connection Line Pulse
- Overlay draws bezier from message anchor to card anchor.
- Pulse amplitude from `activity`:
  - low: alpha 0.25, 2.5s pulse
  - medium: alpha 0.45, 1.5s pulse
  - high: alpha 0.7, 0.9s pulse
- Terminal states fade line to 0 in 300ms.

---

## 🧩 Framer Motion Contract

```tsx
<AnimatePresence mode="popLayout" initial={false}>
  {orderedAgents.map(function renderAgent(agent) {
    return (
      <motion.div
        key={agent.agentId}
        layout="position"
        layoutId={`swarm-card-${agent.agentId}`}
        initial={{ y: -18, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 8, opacity: 0, scale: 0.97 }}
        transition={{
          layout: { type: 'spring', stiffness: 500, damping: 38, mass: 0.72 },
          default: { type: 'spring', stiffness: 420, damping: 30, mass: 0.7 },
        }}
      >
        <SwarmCard agent={agent} />
      </motion.div>
    );
  })}
</AnimatePresence>
```

Use a shared `LayoutGroup` for the chat bubble ghost + swarm card handoff.

---

## 🔌 WebSocket Event Spec

### Transport
- Channel: `swarm.events`
- Format: JSON
- Delivery: at-least-once
- Client dedupe key: `{agentId}:{revision}`

### Event Types

```ts
type SwarmEventBase = {
  eventId: string;
  ts: number;
  sessionId: string;
  agentId: string;
  revision: number;
};

type SwarmAgentSpawnedEvent = SwarmEventBase & {
  type: 'agent_spawned';
  sourceMessageId: string;
  title: string;
  queueIndex: number;
};

type SwarmAgentProgressEvent = SwarmEventBase & {
  type: 'agent_progress';
  state: SwarmAgentState;
  progress: number; // 0..1
  activity: number; // 0..1
};

type SwarmAgentBubbleEvent = SwarmEventBase & {
  type: 'agent_bubble';
  bubble: SwarmBubbleState;
  ttlMs?: number;
};

type SwarmAgentTerminalEvent = SwarmEventBase & {
  type: 'agent_terminal';
  state: 'complete' | 'failed';
};

type SwarmSnapshotEvent = {
  type: 'swarm_snapshot';
  ts: number;
  sessionId: string;
  agents: SwarmAgent[];
};
```

### Client Rules
- Ignore event when `revision <= localRevision` for agent.
- On reconnect, request `swarm_snapshot` then apply buffered events with higher revision.
- If spawn event missing but progress arrives, synthesize minimal agent and mark `isRecovered=true`.
- Expire transient bubble state by `ttlMs` (default 2200ms) with timer wheel/shared scheduler.

---

## 📱 Mobile Responsive Spec

### Breakpoints
- `>= 1024px`: persistent side panel + full line overlay.
- `640px..1023px`: collapsible tray; shorter line paths; reduced concurrent lines.
- `< 640px`: bottom sheet swarm view; no long cross-pane flight path.

### Mobile Motion Rules
- Replace long curved flight with short local transform from message edge to sheet handle.
- Limit simultaneous animated cards to 4; overflow updates become instant layout changes.
- Disable line pulse blur filters on low-power mode.

### Touch + Scroll
- Keep overlay `pointer-events: none`.
- Use `ResizeObserver` + throttled `requestAnimationFrame` rect sync.
- Preserve list scroll offset during reorders using anchor item compensation.

---

## ⚡ Performance Targets

- Reorder animation frame budget: `< 6ms` scripting per frame on mid-tier laptop.
- Overlay redraw cap: `<= 30fps` when idle, `<= 60fps` when active.
- Max active lines rendered simultaneously: 24 desktop, 10 mobile.
- Avoid React-wide rerender: card rows memoized by `{state, progress, bubble, rank}`.

---

## ♿ Accessibility

- Respect `prefers-reduced-motion` and expose user setting override.
- Status bubble has text label (`aria-live="polite"`) without flooding announcements.
- Maintain visible focus styles on cards during motion.
- Color is not sole status signal; include icon/label in bubble.

---

## 🧪 Testing Plan

### Unit
- `computeCompletionScore` ordering and hysteresis behavior.
- WS reducer idempotency and out-of-order event handling.
- Bubble TTL expiry.

### Integration
- Spawn sequence: message anchor to card creation.
- Reorder after progress bursts and rank changes.
- Reconnect flow snapshot + replay merge.

### Visual Regression
- Storybook/Chromatic states:
  - initial spawn
  - high-activity pulse lines
  - reorder cascade
  - reduced-motion mode

### Manual
- 10+ concurrent agents under throttled CPU.
- Mobile Safari and Chrome Android gesture + scroll checks.

---

## 🛠️ Implementation Plan

1. Define shared swarm types and WS reducer in `src/lib/swarm`.
2. Build `use-swarm-websocket` with dedupe/reconnect snapshot merge.
3. Implement `use-swarm-ordering` with score + hysteresis.
4. Add `swarm-panel` and `swarm-card` with `AnimatePresence` + layout springs.
5. Add status bubble component and event-driven bubble lifecycle.
6. Add flight layer with `layoutId` handoff from chat anchors.
7. Add connection overlay with activity-based pulse logic.
8. Add responsive behavior gates and reduced-motion fallback.
9. Write tests for sorting/reducer/ttl + integration harness.
10. Validate performance and tune spring constants.

---

## ✅ Acceptance Criteria

- User message that spawns agents visibly transitions into swarm panel.
- Newly spawned card enters with spring drop and no layout jump.
- Cards reorder by completion progression with stable, understandable movement.
- Live status bubbles reflect `thinking/checkpoint/question` within 150ms of event receipt.
- Reordering uses FLIP/layout transitions instead of hard jumps.
- Connection lines pulse proportionally to activity and fade on completion.
- WS reconnect preserves correctness (no duplicate or stale states).
- Experience remains usable and smooth on mobile and reduced-motion environments.

---

## 🚧 Risks & Mitigations

- **Risk:** Anchor rect drift during scroll/resize.
  - **Mitigation:** Central rect registry + rAF-throttled updates + observer cleanup.
- **Risk:** Visual overload with many agents.
  - **Mitigation:** Limit active FX, adaptive pulse quality, cap line count.
- **Risk:** Event ordering race conditions.
  - **Mitigation:** Monotonic revision checks + snapshot replay protocol.
- **Risk:** Motion sickness for some users.
  - **Mitigation:** Reduced-motion mode and motion intensity toggle.
