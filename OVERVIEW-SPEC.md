# Overview Tab — Final Spec

## Layout (top to bottom)
```
┌─────────────────────────────────────────────────────────────┐
│ Compact Hero Bar (1 line)                                   │
│ Mission Control Overview · 3 agents · 0 active · 0/0 tasks │
│ [Open Missions] [Configure]                   [Start Mission]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─── ISOMETRIC OFFICE (focal point, ~400px) ────────────┐  │
│  │  Checkerboard floor (light blue/dark blue tiles)      │  │
│  │  Desk sprites with monitors at grid positions         │  │
│  │  Robot agents walking/sitting at desks                │  │
│  │  Each robot: colored body, name label, status dot     │  │
│  │  Animated: blinking lights, clock, idle animations    │  │
│  │  When agent active: typing animation at desk          │  │
│  │  Footer: "ClawSuite Office · 3 agents · 0 sessions"  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌── Widget Grid (2-3 cols) ─────────────────────────────┐  │
│  │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │  │
│  │ │ Team        │ │ Activity    │ │ Approvals   │      │  │
│  │ │ Forge       │ │ Forge done  │ │ 0 pending   │      │  │
│  │ │ Sentinel    │ │ Spark idle  │ │ All clear   │      │  │
│  │ │ Spark       │ │             │ │             │      │  │
│  │ └─────────────┘ └─────────────┘ └─────────────┘      │  │
│  │ ┌─────────────┐ ┌─────────────┐                      │  │
│  │ │ Reports     │ │ Missions    │                      │  │
│  │ │ No reports  │ │ No missions │                      │  │
│  │ └─────────────┘ └─────────────┘                      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Isometric Office Requirements
- Canvas-like div with CSS grid/positioned elements
- Floor: repeating tile pattern (alternating neutral-100/neutral-200 diamonds or squares)
- Desks: simple SVG rectangles with monitor shapes, positioned in a grid
- Robots: use the AgentAvatar pixel robot SVGs, scaled up, positioned at desks
- Each robot has: name label below, status dot (green=active, yellow=idle, gray=none)
- When active: add a small "typing" animation (dots or cursor blink near the desk)
- Background decorations: potted plants (green circles), clock (shows real time), water cooler
- Footer bar: "ClawSuite Office · {n} agents · {n} sessions"

## Widget Cards
All widgets: white bg, border-neutral-200, rounded-xl, shadow-sm, p-3
- **Team**: agent list with avatars, names, model badges, status
- **Activity**: last 5 events with timestamps
- **Approvals**: pending count, "All clear" when 0
- **Reports**: last mission report summary or "No reports yet"  
- **Missions**: current mission status or recent 2-3
