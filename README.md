# ClawSuite

### The Enterprise Command Center for AI Agents

**ClawSuite** is an open-source, self-hosted platform for managing AI agents powered by [OpenClaw](https://github.com/openclaw/openclaw). Not just a chat wrapper — it's a complete command center with real-time dashboard, agent orchestration, warden controls, and an enterprise-grade mobile experience.

> Think ChatGPT, but for managing your entire AI agent fleet.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-orange.svg)](CONTRIBUTING.md)

---

## ✨ What Makes ClawSuite Different

| Feature | Others | ClawSuite |
|---------|--------|-----------|
| Chat with agents | ✅ | ✅ Real-time streaming with typing indicators |
| See what agents are doing | ❌ | ✅ Live activity feed + status monitoring |
| Control running agents | ❌ | ✅ Steer, pause, kill from Agent Hub |
| Mobile-first dashboard | ❌ | ✅ iOS widget-style, installable PWA |
| Multi-agent orchestration | ❌ | ✅ Agent Registry with squad status |
| Works from your phone | ❌ | ✅ Full mobile app experience |

---

## 🚀 Features

### 📊 Enterprise Dashboard
- iOS widget-style metric cards (sessions, agents, cost, uptime)
- Real-time activity log with parsed events
- Usage meter with token/cost tracking
- Task board with status indicators
- Trend indicators (↑↓) vs previous period

### 🤖 Agent Hub + Warden Controls
- **Agent Registry** — always see all your agents (active, idle, paused)
- **Steer** — inject directives into running agents ("focus on X")
- **Pause/Resume** — toggle agent heartbeats on/off
- **Kill** — terminate agent sessions instantly
- **Squad Status** — who's running, what they're doing, last heartbeat
- Apple Shortcuts-style colored cards per agent

### 💬 Intelligent Chat
- Real-time streaming (word-by-word, Telegram-style)
- Multi-session management with history
- Slash commands (/model, /status, /reasoning, /new)
- Model switching mid-conversation
- Markdown rendering with syntax highlighting
- File attachments and image support

### 🛠️ Skills Browser
- Browse and manage installed OpenClaw skills
- One-click enable/disable
- ClawdHub marketplace integration

### 📱 Mobile-First
- Installable PWA (add to home screen)
- iOS Safari optimized
- Tab bar navigation
- Touch-friendly cards and controls
- Works on any device on your network

---

## 📸 Screenshots

| Dashboard | Agent Hub | Chat |
|-----------|-----------|------|
| ![Dashboard](./public/screenshots/dashboard.png) | ![Agent Hub](./public/screenshots/agent-hub.png) | ![Chat](./public/screenshots/chat.png) |

---

## ⚡ Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) >= 22.0.0
- [OpenClaw](https://github.com/openclaw/openclaw) gateway running
- An API key for at least one AI provider (Anthropic, OpenAI, etc.)

### Install & Run

```bash
git clone https://github.com/outsourc-e/clawsuite.git
cd clawsuite
npm install
npm run dev
```

Open `http://localhost:3000` on your browser or phone.

### Connect to OpenClaw

ClawSuite auto-discovers your OpenClaw gateway on the local network. If it doesn't connect automatically:

1. Open Settings (⚙️) in ClawSuite
2. Enter your gateway URL (usually `ws://localhost:18789`)
3. Enter your gateway token (from `openclaw.json`)

### Access from Your Phone

ClawSuite works as a PWA. On your phone:

1. Open `http://<your-computer-ip>:3000` in Safari/Chrome
2. Tap "Add to Home Screen"
3. ClawSuite appears as a native app icon

For remote access, use [Tailscale](https://tailscale.com) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

---

## 🏗️ Tech Stack

- **Frontend:** TanStack Start + React 19 + Tailwind CSS
- **Backend:** TanStack Server Functions + WebSocket RPC
- **Gateway:** OpenClaw (WebSocket protocol)
- **Build:** Vite 7
- **Desktop (planned):** Tauri v2

---

## 🗺️ Roadmap

### ✅ Shipped
- [x] Enterprise dashboard with iOS widget cards
- [x] Agent Hub with warden controls (steer/kill/pause)
- [x] Real-time chat with streaming
- [x] Slash command menu
- [x] Model switching
- [x] Mobile-first PWA
- [x] Dark mode

### 🔜 Coming Soon
- [ ] Desktop app (Tauri — 5MB installer)
- [ ] Cloud hosted version (no self-hosting required)
- [ ] Agent task board with drag-to-assign
- [ ] Live agent output streaming in Agent Hub
- [ ] Push notifications
- [ ] Remote access built-in (Cloudflare Tunnel)
- [ ] Multi-user support
- [ ] Plugin/integration marketplace

---

## 🤝 Contributing

PRs welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Development
npm run dev          # Start dev server
npm run build        # Production build
npx tsc --noEmit     # Type check
```

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

**Built by [@outsourc_e](https://x.com/outsourc_e)**
