# ClawSuite Architecture

This document provides a comprehensive overview of ClawSuite's architecture, design decisions, and implementation details.

---

## 📐 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         ClawSuite UI                          │
│                       (React 19 + Vite)                       │
├─────────────────────────┬────────────────────────────────────┤
│   Browser (Client)      │     TanStack Start (Server)        │
│                         │                                    │
│  ┌──────────────────┐   │   ┌────────────────────────────┐  │
│  │  React Router    │   │   │   API Routes (/api/*)      │  │
│  │  (File-based)    │   │   │   - send.ts                │  │
│  │                  │   │   │   - stream.ts              │  │
│  │  - Dashboard     │   │   │   - terminal-*.ts          │  │
│  │  - Chat          │   │   │   - files.ts               │  │
│  │  - Terminal      │   │   │   - skills.ts              │  │
│  │  - Settings      │   │   │   - gateway/*              │  │
│  └──────────────────┘   │   └────────────────────────────┘  │
│                         │                                    │
│  ┌──────────────────┐   │   ┌────────────────────────────┐  │
│  │ State Management │   │   │   Server Utils             │  │
│  │                  │   │   │   - gateway.ts (RPC)       │  │
│  │  - TanStack Query│───┼───│   - terminal-sessions.ts   │  │
│  │  - Zustand stores│   │   │   - pty-helper.py          │  │
│  │  - React state   │   │   │   - activity-stream.ts     │  │
│  └──────────────────┘   │   └────────────────────────────┘  │
│                         │              │                     │
│  ┌──────────────────┐   │              │ HTTP/WebSocket     │
│  │  UI Components   │   │              ▼                     │
│  │                  │   │   ┌────────────────────────────┐  │
│  │  - Chat messages │   │   │   Gateway Proxy            │  │
│  │  - Terminal      │   │   │   - RPC forwarding         │  │
│  │  - File explorer │   │   │   - SSE streaming          │  │
│  │  - Modal/dialogs │   │   │   - WebSocket relay        │  │
│  └──────────────────┘   │   └────────────────────────────┘  │
└─────────────────────────┴────────────────────────────────────┘
                                   │
                                   │ HTTP/WS
                                   ▼
                    ┌──────────────────────────────┐
                    │      OpenClaw Gateway        │
                    │      (localhost:18789)       │
                    │                              │
                    │  - Agent sessions            │
                    │  - AI provider routing       │
                    │  - Tool execution            │
                    │  - Event streaming           │
                    └──────────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │       AI Providers           │
                    │  (OpenAI, Anthropic, etc.)   │
                    └──────────────────────────────┘
```

---

## 🎯 Core Components

### 1. Frontend (Browser)

#### TanStack Router (File-Based Routing)

Routes are defined by the file structure in `src/routes/`:

```
src/routes/
├── __root.tsx          # Root layout (nav, theme, shortcuts)
├── index.tsx           # Dashboard (home)
├── chat/
│   ├── $sessionId.tsx  # Chat interface with session ID
│   └── index.tsx       # New chat
├── terminal.tsx        # Integrated terminal
├── skills.tsx          # Skills marketplace
├── settings/
│   ├── index.tsx       # Settings overview
│   ├── providers.tsx   # Provider configuration
│   └── gateway.tsx     # Gateway connection
└── api/                # Server-side routes (see below)
```

**Dynamic routes** use `$param` syntax (e.g., `chat.$sessionId.tsx`).

#### State Management

**1. TanStack Query** (Server State)
- Handles all API requests to Gateway
- Automatic caching, refetching, and invalidation
- Query keys for data identification

**Example:**
```typescript
// Fetch sessions from Gateway
const { data: sessions, isLoading } = useQuery({
  queryKey: ['sessions'],
  queryFn: async () => {
    const res = await fetch('/api/sessions');
    return res.json();
  },
  refetchInterval: 5000, // Poll every 5s
});
```

**2. Zustand** (Global Client State)
- UI state (theme, sidebar visibility, modals)
- User preferences (keyboard shortcuts, layout)
- Non-server state

**Example:**
```typescript
// Theme store
export const useThemeStore = create<ThemeStore>((set) => ({
  theme: 'dark',
  setTheme: (theme) => set({ theme }),
}));

// Usage in component
const theme = useThemeStore((state) => state.theme);
```

**3. React State** (Local Component State)
- Form inputs, toggles, temporary UI state
- Scoped to individual components

#### Component Architecture

```
src/
├── components/          # Shared UI components
│   ├── ui/              # Base primitives (Button, Input, etc.)
│   ├── agent-chat/      # Chat-specific components
│   ├── terminal/        # Terminal UI
│   └── search/          # Global search (Cmd+K)
├── screens/             # Feature screens (business logic)
│   ├── chat/            # Chat screen logic
│   ├── dashboard/       # Dashboard widgets
│   └── settings/        # Settings panels
└── routes/              # Route entry points (render screens)
```

**Design principle**: 
- **Components** are dumb, reusable UI
- **Screens** contain feature logic and state
- **Routes** connect screens to URLs

---

### 2. Server (TanStack Start)

TanStack Start provides server-side rendering and API routes.

#### API Routes (`src/routes/api/`)

All API routes are server-only and run in Node.js:

| Route | Method | Description |
|-------|--------|-------------|
| `/api/send` | POST | Send message to AI agent (one-shot) |
| `/api/stream` | GET | SSE stream for real-time responses |
| `/api/chat-events` | POST | Subscribe to chat events (SSE) |
| `/api/sessions` | GET | List all agent sessions |
| `/api/terminal-stream` | GET | WebSocket for terminal PTY |
| `/api/terminal-input` | POST | Send input to terminal |
| `/api/terminal-resize` | POST | Resize terminal dimensions |
| `/api/terminal-close` | POST | Close terminal session |
| `/api/files` | GET/POST | File operations (read, write, delete) |
| `/api/skills` | GET | Fetch skills from ClawdHub |
| `/api/gateway/*` | ALL | Proxy all Gateway RPC calls |

#### Gateway Integration (`src/server/gateway.ts`)

The Gateway client handles all communication with OpenClaw:

```typescript
export async function callGateway<T>(
  method: string,
  params?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${GATEWAY_URL}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now(),
    }),
  });
  
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}
```

**Gateway RPC Methods Used:**
- `sessions_list` — List all sessions
- `sessions_create` — Create new session
- `send` — Send message to agent
- `stream_events` — Subscribe to event stream
- `model_switch` — Change AI model
- `session_status` — Get session details
- `usage_get` — Fetch usage/cost data

---

### 3. WebSocket & SSE Streaming

#### Server-Sent Events (SSE)

For real-time streaming from the AI:

**Client (Browser):**
```typescript
const eventSource = new EventSource('/api/stream?sessionId=abc123');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'text') {
    appendMessage(data.content);
  }
};
```

**Server (`src/routes/api/stream.ts`):**
```typescript
export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');
  
  const stream = new ReadableStream({
    async start(controller) {
      // Forward Gateway event stream
      for await (const event of gatewayEventStream(sessionId)) {
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
      }
    },
  });
  
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
```

#### WebSocket (Terminal)

For bidirectional terminal communication:

**Client:**
```typescript
const ws = new WebSocket('ws://localhost:3000/api/terminal-stream');

ws.onmessage = (event) => {
  terminal.write(event.data); // Write to xterm.js
};

terminal.onData((data) => {
  ws.send(JSON.stringify({ type: 'input', data }));
});
```

**Server (`src/server/terminal-sessions.ts`):**
- Uses Python PTY wrapper (`pty-helper.py`) to spawn shell
- Relays stdin/stdout between WebSocket and PTY
- Handles terminal resizing (SIGWINCH)

---

## 🛠️ Terminal Implementation

### Architecture

```
┌──────────────┐         WebSocket          ┌──────────────────┐
│   Browser    │◄───────────────────────────►│  Node.js Server  │
│  (xterm.js)  │                             │  (WS handler)    │
└──────────────┘                             └──────────────────┘
                                                      │
                                                      │ spawn
                                                      ▼
                                              ┌──────────────────┐
                                              │  pty-helper.py   │
                                              │  (Python PTY)    │
                                              └──────────────────┘
                                                      │
                                                      │ PTY
                                                      ▼
                                              ┌──────────────────┐
                                              │   Shell Process  │
                                              │   (zsh/bash)     │
                                              └──────────────────┘
```

### Why Python PTY?

Node.js `node-pty` has compatibility issues on some platforms. Using Python's `pty` module provides:
- Cross-platform compatibility (macOS, Linux, Windows WSL)
- Proper ANSI escape sequence handling
- Signal forwarding (Ctrl+C, Ctrl+Z)
- Terminal resizing support

**`src/server/pty-helper.py`:**
```python
import pty
import os
import sys
import select
import json

def main():
    master_fd, slave_fd = pty.openpty()
    pid = os.fork()
    
    if pid == 0:  # Child process
        os.setsid()
        os.dup2(slave_fd, 0)  # stdin
        os.dup2(slave_fd, 1)  # stdout
        os.dup2(slave_fd, 2)  # stderr
        os.execvp('/bin/zsh', ['/bin/zsh'])
    else:  # Parent process
        while True:
            r, _, _ = select.select([master_fd, sys.stdin], [], [])
            if master_fd in r:
                data = os.read(master_fd, 1024)
                if data:
                    sys.stdout.buffer.write(data)
                    sys.stdout.flush()
```

---

## 📊 Client-Side State Flow

### Example: Sending a Message

```
User types message in chat
         │
         ▼
React component state updates
         │
         ▼
TanStack Query mutation triggered
         │
         ▼
POST /api/send (server route)
         │
         ▼
Server calls Gateway RPC (send method)
         │
         ▼
Gateway processes message
         │
         ▼
SSE stream (/api/stream) receives events
         │
         ▼
Client EventSource receives chunks
         │
         ▼
React state updated, UI re-renders
         │
         ▼
Message appears in chat
```

**Code:**
```typescript
// 1. Component
const sendMessage = useMutation({
  mutationFn: async (content: string) => {
    const res = await fetch('/api/send', {
      method: 'POST',
      body: JSON.stringify({ sessionId, content }),
    });
    return res.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries(['messages', sessionId]);
  },
});

// 2. Server route (src/routes/api/send.ts)
export async function POST({ request }) {
  const { sessionId, content } = await request.json();
  const result = await callGateway('send', { sessionId, content });
  return Response.json(result);
}

// 3. Gateway client (src/server/gateway.ts)
export async function callGateway(method, params) {
  // ... (see Gateway Integration section)
}
```

---

## 🗂️ Data Flow Patterns

### 1. Server State (API Data)

- **Fetch on mount** with TanStack Query
- **Auto-refetch** on window focus or interval
- **Optimistic updates** for mutations

### 2. Real-Time State (Streaming)

- **SSE** for one-way streams (AI responses, activity feed)
- **WebSocket** for bidirectional (terminal, live chat)
- **Event handlers** update React state

### 3. Persisted State

- **LocalStorage** for preferences (theme, layout)
- **Server-side** for user data (via Gateway)

---

## 🔐 Security Considerations

### Client-Side
- **No secrets in browser code** — all API keys handled server-side
- **CSRF tokens** for state-changing operations
- **Input sanitization** for user-provided data

### Server-Side
- **Gateway auth** via environment variables
- **Rate limiting** on API routes
- **No shell injection** — PTY input sanitized
- **Path traversal protection** in file explorer

---

## 🚀 Performance Optimizations

### Code Splitting
- TanStack Router lazy-loads routes
- Components use dynamic imports for large dependencies (Monaco, xterm.js)

### Caching
- TanStack Query caches API responses
- Gateway responses cached with TTL
- Static assets fingerprinted for long-term caching

### Rendering
- React 19 optimizations (automatic batching, transitions)
- `useMemo`/`useCallback` for expensive operations
- Virtualization for large lists (chat history)

---

## 📦 Build & Deployment

### Development
```bash
npm run dev
# Vite dev server with HMR
# Server routes run in Node.js
```

### Production
```bash
npm run build
# Outputs to dist/ (static assets + server)
npm run preview
# Test production build locally
```

### Deployment Targets

1. **Self-hosted** (Node.js server)
   - Run `node dist/server/index.js`
   - Requires OpenClaw Gateway accessible

2. **Desktop app** (Tauri)
   - `tauri build` creates native executable
   - Bundles web UI and Gateway proxy

---

## 🧩 Extension Points

Want to add a new feature? Here are common patterns:

### 1. Add a New Page
- Create `src/routes/my-feature.tsx`
- Add screen component in `src/screens/my-feature/`
- Route will be auto-registered at `/my-feature`

### 2. Add an API Endpoint
- Create `src/routes/api/my-endpoint.ts`
- Export `GET`, `POST`, etc. functions
- Access at `/api/my-endpoint`

### 3. Add Global State
- Create Zustand store in `src/lib/stores/`
- Export hooks for components
- Persist to localStorage if needed

### 4. Add a Gateway Method
- Extend `src/server/gateway.ts`
- Add TypeScript types in `src/types/gateway.ts`
- Use in API routes or server utils

---

## 🔍 Debugging

### Frontend
- **React DevTools** for component inspection
- **TanStack Query DevTools** for query state
- **Browser DevTools** for network/console

### Server
- Check `console.log` in terminal running `npm run dev`
- Gateway logs at `~/.openclaw/logs/`
- Use Debug Console in ClawSuite UI

### Common Issues

| Issue | Solution |
|-------|----------|
| Gateway not connecting | Check `CLAWDBOT_GATEWAY_URL` in `.env` |
| Terminal not working | Verify Python installed and `pty-helper.py` accessible |
| Hot reload broken | Restart dev server |
| Type errors | Run `npm run check` to lint/format |

---

## 📚 Additional Resources

- [TanStack Start Docs](https://tanstack.com/start)
- [TanStack Router Docs](https://tanstack.com/router)
- [TanStack Query Docs](https://tanstack.com/query)
- [OpenClaw Gateway RPC Spec](https://openclaw.ai/docs/rpc)
- [Tailwind CSS Docs](https://tailwindcss.com)

---

**Questions?** Open an issue or check the [CONTRIBUTING.md](../CONTRIBUTING.md) guide.
