# Agent Behaviors System — Build Spec

## Overview
Make the virtual office ALIVE. Agents should move around, take breaks, chat with each other, change expressions, and feel like a real office simulation (think Gather.town / The Sims).

## Files to Create/Modify

### 1. NEW: `src/components/agent-swarm/agent-behaviors.ts`
State machine for agent activities:

```typescript
type AgentActivity = 
  | 'idle'           // Just arrived, standing
  | 'walking'        // Moving between locations
  | 'coding'         // At desk, typing away
  | 'thinking'       // At desk, pondering (maps to swarmStatus 'thinking')
  | 'water_break'    // Walking to/at water cooler
  | 'coffee_break'   // At coffee machine  
  | 'lunch'          // Eating at break area
  | 'meeting'        // At meeting table with others
  | 'chatting'       // Talking to another agent at their desk
  | 'celebrating'    // Task complete! 🎉
  | 'frustrated'     // Task failed 😤

type AgentBehaviorState = {
  activity: AgentActivity
  position: { x: number; y: number }        // Current position (%)
  targetPosition: { x: number; y: number }   // Where they're heading
  deskPosition: { x: number; y: number }     // Their assigned desk
  expression: 'neutral' | 'happy' | 'focused' | 'confused' | 'tired' | 'excited'
  chatMessage: string | null                  // Current speech bubble text
  chatTarget: string | null                   // Who they're talking to (persona name)
  lastBreak: number                           // Timestamp
  breakInterval: number                       // Random 20-60s between breaks
}
```

**Activity transitions based on swarmStatus:**
- `running` → cycles: `coding` (15-30s) → random break (5-10s) → back to `coding`
- `thinking` → `thinking` at desk with thought bubbles
- `complete` → `celebrating` for 5s → `idle`
- `failed` → `frustrated` for 5s → `idle`
- When no swarmStatus (idle session) → random: `water_break`, `chatting`, `coffee_break`

**Break behaviors:**
- Water break: Walk to water cooler (x:5, y:45), stand 5s, walk back
- Coffee break: Walk to coffee area (x:90, y:42), stand 5s, walk back
- Lunch: Walk to break area (x:88, y:85), stand 8-12s, walk back
- Meeting: Walk to meeting table (x:45, y:52), stand until meeting ends
- Chatting: Walk to another agent's desk, show speech bubbles

**Chat messages (random from pool):**
- Working: "Almost done...", "This is interesting", "Compiling...", "Reading docs...", "Found a bug!", "Writing tests..."
- Water break: "Need water 💧", "brb", "Quick break"
- Coffee: "Coffee time ☕", "Need caffeine"  
- Chatting with another agent: "Hey {name}!", "Check this out", "Can you review?", "Nice work!", "I need your help", "Let's sync up"
- Complete: "Done! 🎉", "Ship it!", "All green ✅"
- Failed: "Hmm...", "That's broken", "Need help..."

### 2. NEW: `src/hooks/use-agent-behaviors.ts`
React hook that manages the behavior loop:
- Takes sessions array, returns `Map<sessionKey, AgentBehaviorState>`
- Runs a 1s interval timer to update activities
- Handles transitions, walking interpolation, break scheduling
- Walking speed: lerp position ~2% per tick toward target
- Chat bubbles appear for 3-4s then fade

### 3. MODIFY: `src/components/agent-swarm/pixel-avatar.tsx`
Add expression support:
- `expression` prop that changes the eyes/mouth:
  - `neutral`: current eyes (dots)
  - `happy`: eyes become ^ ^ (upward curves), add small mouth curve
  - `focused`: eyes become — — (narrow), no mouth
  - `confused`: one eye higher than other, ? above head
  - `tired`: eyes half-closed (half rects), zZz above
  - `excited`: eyes become ★ ★, mouth open O
- Add `isWalking` prop: when true, legs animate alternating up/down
- Add `direction` prop: 'left' | 'right' — flip the SVG horizontally when walking left

### 4. MODIFY: `src/components/agent-swarm/isometric-office.tsx`
Major updates:
- Import and use `useAgentBehaviors` hook
- Replace static `AgentInOffice` with new `AnimatedAgent` that:
  - Uses smooth `motion.div` with `animate={{ left, top }}` based on behavior state position
  - Shows chat bubbles above agent with fade in/out
  - Shows activity indicator (☕ 💧 🍕 💻 💭 🎉 etc)
  - Walking agents face direction of movement
- Add coffee machine decoration near x:90 y:42
- Add break/lunch area near x:88 y:85
- Add subtle grid floor lines for depth
- When agents chat: draw a faint dotted line between them
- Add ambient details: clock showing real time, whiteboard with task count

### 5. MODIFY: `src/components/agent-swarm/agent-character.tsx`  
(Check what's in here and update or replace as needed)

## Key Behaviors to Implement

### Walking System
- Agents smoothly interpolate position using CSS transitions or framer-motion
- Speed: move ~3% of office per tick (1 tick = 1s)
- Face direction of travel (flip SVG)
- Legs animate while walking
- Arrival: stop, change activity

### Chat System
- When 2+ agents are active, randomly one will "visit" another every 30-60s
- Walking agent goes to target's desk position
- Both show speech bubbles for 4-5s
- Speech bubbles have typing animation (dots first, then message)
- After chat, walker returns to own desk

### Break Cycle (for running agents)
- After 20-40s of coding, agent takes a random break type
- Break lasts 5-12s depending on type
- Then returns to desk and resumes coding
- Each agent has independent random timers (so they don't all break at once)

### Expression Mapping
- `coding` → focused
- `thinking` → confused 
- `water_break` / `coffee_break` → tired
- `lunch` → happy
- `meeting` → neutral
- `chatting` → happy
- `celebrating` → excited  
- `frustrated` → confused
- `idle` → neutral

## Important Notes
- Keep SVG pixel art style — don't switch to complex graphics
- All animations via framer-motion (already in project)
- Performance: max 8 agents, 1s tick interval, CSS transitions for smooth movement
- Chat messages should feel natural and fun, not robotic
- The office should feel ALIVE even with just 1-2 agents
