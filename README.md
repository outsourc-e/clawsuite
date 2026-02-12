# ClawSuite

### Command Center for OpenClaw

**ClawSuite** is an open-source, self-hosted chat interface for OpenClaw AI agents. Build, monitor, and interact with AI-powered automation through a beautifully designed dashboard that puts you in full control.

![ClawSuite Dashboard](./public/screenshots/dashboard.png)

> Self-hosted command center — chat with any model, orchestrate agents, manage your gateway.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-orange.svg)](CONTRIBUTING.md)

---

## ✨ Features

### 💬 **Intelligent Chat**
- Real-time conversations with AI agents powered by OpenClaw
- Multi-session management with session history
- Inline message editing and regeneration
- Markdown rendering with syntax highlighting
- Attachment support (images, files, code snippets)
- Message search (Cmd+F)

### 🤖 **Agent Hub**
- Browse and manage AI agent instances
- Launch CLI agents directly from the UI
- View active sessions and agent status
- Agent swarm orchestration for multi-agent workflows
- Real-time agent performance metrics

### 📊 **Dashboard & Monitoring**
- Live usage and cost tracking across all providers
- Interactive charts showing API consumption
- Provider-specific breakdowns (OpenAI, Anthropic, Google, etc.)
- Budget alerts and spending insights
- Gateway health monitoring

### 🛠️ **Developer Tools**
- **Terminal**: Full-featured integrated terminal with PTY support
- **File Explorer**: Browse workspace files with Monaco code editor
- **Debug Console**: Gateway diagnostics with pattern-based troubleshooter
- **Memory Viewer**: Inspect and manage agent memory state
- **Skills Browser**: Discover and install skills from ClawdHub
- **Cron Manager**: Schedule recurring tasks and automation

### 🔍 **Power User Features**
- **Global Search** (Cmd+K): Quick navigation across all screens
- **Browser Automation**: Control panel for web scraping and browser tasks
- **Activity Feed**: Real-time event stream from Gateway WebSocket
- **Session Management**: Pause, resume, or switch between conversations
- **Keyboard Shortcuts**: Press `?` to see all shortcuts

### ⚙️ **Configuration & Setup**
- Provider setup wizard with guided onboarding
- Model switcher with undo, confirmations, and premium detection
- Custom gateway URL configuration
- Dark/light theme toggle
- Persistent settings across sessions

---

## 🚀 Getting Started

### Prerequisites

Before running ClawSuite, ensure you have:

- **Node.js 22+** ([Download](https://nodejs.org/))
- **OpenClaw Gateway** running locally ([Setup Guide](https://openclaw.ai/docs/installation))
  - Default gateway URL: `http://localhost:18789`

### Installation

```bash
# Clone the repository
git clone https://github.com/outsourc-e/clawsuite.git
cd clawsuite

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
# Build optimized production bundle
npm run build

# Preview production build
npm run preview
```

### Optional: Desktop App (Tauri)

ClawSuite can be packaged as a native desktop application using Tauri:

```bash
# Install Tauri CLI (if not already installed)
npm install -g @tauri-apps/cli

# Run desktop app
tauri dev

# Build desktop app
tauri build
```

---

## ⚙️ Configuration

### Gateway URL

ClawSuite connects to your OpenClaw gateway. Set the gateway URL in:

1. **Environment Variable** (recommended):
   ```bash
   # Create .env file
   echo "CLAWDBOT_GATEWAY_URL=ws://127.0.0.1:18789" > .env
   ```

2. **In-App Settings**:
   - Navigate to Settings → Gateway
   - Enter your gateway URL
   - Click "Test Connection"

### Environment Variables

Create a `.env` file in the project root:

```bash
# Gateway configuration
CLAWDBOT_GATEWAY_URL=ws://127.0.0.1:18789

# Optional: Gateway authentication token
CLAWDBOT_GATEWAY_TOKEN=your_token_here

# Optional: Gateway password (alternative to token)
# CLAWDBOT_GATEWAY_PASSWORD=your_password

# Optional: Custom port for dev server
PORT=3000

# Optional: Enable debug logging
DEBUG=true
```

See [.env.example](.env.example) for all available options.

---

## 🏗️ Architecture

ClawSuite is built with modern web technologies for performance and developer experience:

### Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) (React 19 SSR framework)
- **Routing**: [TanStack Router](https://tanstack.com/router) with file-based routing
- **State Management**: [TanStack Query](https://tanstack.com/query) + [Zustand](https://zustand-demo.pmnd.rs/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Language**: TypeScript (strict mode)
- **Desktop**: [Tauri 2](https://tauri.app/) (optional)

### How It Works

ClawSuite acts as a **client UI** for the OpenClaw Gateway:

1. **Frontend** (React) renders the UI and handles user interactions
2. **Server Routes** (`/api/*`) proxy requests to the OpenClaw Gateway
3. **WebSocket** maintains real-time connection for streaming responses
4. **Gateway** processes AI requests and manages agent sessions

```
┌─────────────┐      HTTP/WebSocket      ┌──────────────┐
│  ClawSuite  │ ◄────────────────────────► │   Gateway    │
│  (Browser)  │                           │  (localhost)  │
└─────────────┘                           └──────────────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │  AI Providers │
                                          │ (OpenAI, etc) │
                                          └──────────────┘
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture documentation.

---

## 📁 Project Structure

```
clawsuite/
├── src/
│   ├── routes/           # TanStack Router routes + API endpoints
│   │   ├── index.tsx     # Dashboard (home page)
│   │   ├── chat/         # Chat interface
│   │   ├── terminal.tsx  # Integrated terminal
│   │   ├── skills.tsx    # Skills marketplace
│   │   ├── settings/     # Settings screens
│   │   └── api/          # Server-side API routes
│   │       ├── send.ts          # Send chat message
│   │       ├── stream.ts        # SSE streaming
│   │       ├── terminal-*.ts    # Terminal PTY
│   │       └── gateway/         # Gateway RPC proxy
│   ├── screens/          # Feature screen components
│   │   ├── chat/         # Chat UI logic
│   │   ├── dashboard/    # Dashboard widgets
│   │   ├── skills/       # Skills browser
│   │   └── settings/     # Settings panels
│   ├── components/       # Shared UI components
│   │   ├── ui/           # Base UI primitives
│   │   ├── terminal/     # Terminal components
│   │   ├── agent-chat/   # Chat message components
│   │   └── search/       # Global search (Cmd+K)
│   ├── lib/              # Utilities and helpers
│   │   ├── gateway-api.ts       # Gateway API client
│   │   ├── provider-catalog.ts  # AI provider metadata
│   │   └── utils.ts             # Shared utilities
│   ├── server/           # Server-side code
│   │   ├── gateway.ts           # Gateway RPC client
│   │   ├── terminal-sessions.ts # PTY session manager
│   │   └── pty-helper.py        # Python PTY wrapper
│   └── types/            # TypeScript type definitions
├── public/               # Static assets
├── docs/                 # Documentation
├── scripts/              # Build and dev scripts
└── src-tauri/            # Tauri desktop app config
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Cmd+K** (Ctrl+K) | Open global search |
| **Cmd+F** (Ctrl+F) | Search messages in chat |
| **Cmd+`** (Ctrl+`) | Toggle terminal |
| **Cmd+Enter** | Send message |
| **Cmd+N** | New chat session |
| **Cmd+/** | Toggle chat panel |
| **?** | Show all shortcuts |
| **Esc** | Close dialogs/modals |

---

## 🤝 Contributing

We welcome contributions! Whether it's bug reports, feature requests, or code contributions, we'd love to hear from you.

### Quick Start

```bash
# Fork and clone the repo
git clone https://github.com/YOUR_USERNAME/clawsuite.git
cd clawsuite

# Create a feature branch
git checkout -b feature/your-feature-name

# Make your changes and commit
git commit -m "Add amazing feature"

# Push and open a PR
git push origin feature/your-feature-name
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines, including:
- Code style and conventions (TypeScript strict, Tailwind, **no portals/ScrollArea**)
- PR checklist and review process
- Architecture decisions
- Testing requirements

### Development Guidelines

- **No ScrollArea or Portal patterns**: Use native overflow and positioning
- **TypeScript strict mode**: All code must pass type checking
- **Tailwind-first**: Use utility classes; avoid custom CSS
- **Accessibility**: All interactive elements must be keyboard-navigable

---

## 📜 License

ClawSuite is open-source software licensed under the [MIT License](LICENSE).

---

## 🔗 Links

- **Website**: [clawsuite.io](https://clawsuite.io)
- **OpenClaw**: [openclaw.ai](https://openclaw.ai)
- **X (Twitter)**: [@clawsuite](https://x.com/clawsuite)
- **GitHub**: [outsourc-e/clawsuite](https://github.com/outsourc-e/clawsuite)
- **Documentation**: [docs/INDEX.md](docs/INDEX.md)

---

## 🙏 Acknowledgments

ClawSuite is built on top of the incredible [OpenClaw](https://openclaw.ai) project. Special thanks to all contributors and the open-source community.

---

**Built with 🦞 by [Eric](https://github.com/outsourc-e)**
