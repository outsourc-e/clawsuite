<div align="center">

<img src="./public/logo-final.svg" alt="ClawSuite" width="80" />

# ClawSuite

**The full-stack mission control platform for OpenClaw AI agents.**

[![Version](https://img.shields.io/badge/version-3.0.0-orange.svg)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-orange.svg)](CONTRIBUTING.md)

> Not a chat wrapper. A complete command center — orchestrate agents, run missions, track costs, and control everything from one place.

![ClawSuite Dashboard](./public/screenshots/dashboard-v3.png)

</div>

---

## ✨ What's New in v3.0

- 🤖 **Mission Control** — Full multi-agent orchestration with an isometric office view, live agent status, and mission lifecycle management (spawn → pause → resume → abort)
- 📊 **Cost Analytics** — Per-agent spend, daily trends, MTD totals, and projected EOM cost backed by real gateway data
- 🎨 **3-Theme System** — Paper Light, Ops Dark, Premium Dark — deep dark mode wiring across 66+ components
- 🔒 **Security Hardened** — Auth middleware on all API routes, wildcard CORS removed, exec approval prompts
- 📱 **Mobile-First PWA** — Full feature parity on any device, installable as a native app on iOS and Android
- ⚡ **Live SSE Streaming** — Real-time agent output streams to Mission Control and chat — no polling
- 🧠 **Memory Browser** — Browse, search, and edit agent memory files directly from the UI

---

## 📸 Screenshots

| Agent Hub — Mission Control | Chat — Live Streaming |
|:---:|:---:|
| ![Agent Hub](./public/screenshots/agent-hub-v3.png) | ![Chat](./public/screenshots/chat-v3.png) |

| Mobile Dashboard | Mission Control |
|:---:|:---:|
| ![Mobile](./public/screenshots/mobile-dashboard-v3.png) | ![Missions](./public/screenshots/mission-control-v3.png) |

<details>
<summary>📸 More Screenshots</summary>

| Mission Wizard | Tasks Board |
|:---:|:---:|
| ![Mission Wizard](./public/screenshots/gallery/mission-wizard.png) | ![Tasks](./public/screenshots/gallery/tasks-board.png) |

| Skills Marketplace | Cron Manager |
|:---:|:---:|
| ![Skills](./public/screenshots/gallery/skills-browser.png) | ![Cron](./public/screenshots/gallery/cron-manager.png) |

| Agents Configuration | Mobile Agent Hub |
|:---:|:---:|
| ![Agents](./public/screenshots/gallery/agents-config.png) | ![Mobile Hub](./public/screenshots/gallery/mobile-agent-hub.png) |

</details>

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 22+** — [nodejs.org](https://nodejs.org/)
- **OpenClaw Gateway** running locally — [Setup Guide](https://openclaw.ai/docs/installation)

### Install & Run

```bash
git clone https://github.com/outsourc-e/clawsuite.git
cd clawsuite
npm install
cp .env.example .env       # Add your gateway URL + password
npm run dev                # Starts on http://localhost:3000
```

### Environment Variables

```env
GATEWAY_URL=http://localhost:18789
GATEWAY_TOKEN=your_gateway_token
STUDIO_PASSWORD=your_dashboard_password
```

---

## 📱 Install as App (Recommended)

ClawSuite is a **Progressive Web App (PWA)** — install it for the full native app experience with no browser chrome, keyboard shortcuts, and offline support.

### 🖥️ Desktop (macOS / Windows / Linux)

1. Open ClawSuite in **Chrome** or **Edge** at `http://localhost:3000`
2. Click the **install icon** (⊕) in the address bar
3. Click **Install** — ClawSuite opens as a standalone desktop app
4. Pin to Dock / Taskbar for quick access

> **macOS users:** After installing, you can also add it to your Launchpad.

### 📱 iPhone / iPad (iOS Safari)

1. Open ClawSuite in **Safari** on your iPhone
2. Tap the **Share** button (□↑)
3. Scroll down and tap **"Add to Home Screen"**
4. Tap **Add** — the ClawSuite icon appears on your home screen
5. Launch from home screen for the full native app experience

### 🤖 Android

1. Open ClawSuite in **Chrome** on your Android device
2. Tap the **three-dot menu** (⋮) → **"Add to Home screen"**
3. Tap **Add** — ClawSuite is now a native-feeling app on your device

---

## 📡 Mobile Access via Tailscale

Access ClawSuite from anywhere on your devices — no port forwarding, no VPN complexity.

### Setup

1. **Install Tailscale** on your Mac and mobile device:
   - Mac: [tailscale.com/download](https://tailscale.com/download)
   - iPhone/Android: Search "Tailscale" in the App Store / Play Store

2. **Sign in** to the same Tailscale account on both devices

3. **Find your Mac's Tailscale IP:**
   ```bash
   tailscale ip -4
   # Example output: 100.x.x.x
   ```

4. **Open ClawSuite on your phone:**
   ```
   http://100.x.x.x:3000
   ```

5. **Add to Home Screen** using the steps above for the full app experience

> 💡 Tailscale works over any network — home wifi, mobile data, even across countries. Your traffic stays end-to-end encrypted.

---

## 🖥️ Native Desktop App

> **Status: In Development** — A native Electron-based desktop app is in active development.

The desktop app will offer:
- Native window management and tray icon
- System notifications for agent events and mission completions
- Auto-launch on startup
- Deep OS integration (macOS menu bar, Windows taskbar)

**In the meantime:** Install ClawSuite as a PWA (see above) for a near-native desktop experience — it works great.

---

## ☁️ Cloud & Hosted Setup

> **Status: Coming Soon**

A fully managed cloud version of ClawSuite is in development:

- **One-click deploy** — No self-hosting required
- **Multi-device sync** — Access your agents from any device
- **Team collaboration** — Shared mission control for your whole team
- **Automatic updates** — Always on the latest version

Features pending cloud infrastructure:
- Cross-device session sync
- Team shared memory and workspaces
- Cloud-hosted gateway with managed uptime
- Webhook integrations and external triggers

---

## ✨ Features

### 🤖 Mission Control & Agent Hub
- Full multi-agent orchestration — spawn, pause, resume, abort
- **Isometric office view** — see your agents working in real time
- Live SSE output streaming per agent
- Mission reports with success rate, token count, and artifacts
- Exec approval prompts — approve/deny sensitive commands in-UI

### 💬 Chat
- Real-time token streaming (no waiting for full response)
- Multi-session management with full history
- File and image attachments
- Markdown + syntax highlighting
- Message search (Cmd+F)

### 📊 Dashboard & Cost Analytics
- Per-agent spend breakdown with daily trend charts
- MTD totals and projected EOM cost
- Provider-specific breakdowns (OpenAI, Anthropic, Google, etc.)
- Gateway health, uptime, and system metrics footer

### 🌐 Built-in Browser
- Headed Chromium with stealth anti-detection
- Agent handoff — share live pages with your AI
- Persistent sessions (cookies survive restarts)

### 🛒 Skills Marketplace
- 2,000+ skills from ClawdHub registry
- Security scanning before install — every skill audited
- One-click install with dependency resolution

### 🛠️ Developer Tools
- **Terminal** — Full PTY with cross-platform support
- **File Browser** — Navigate workspace, preview and edit files (Monaco editor)
- **Memory Browser** — Browse and edit agent memory files
- **Cron Manager** — Schedule recurring tasks and automations
- **Debug Console** — Gateway diagnostics and pattern-based troubleshooter

### 🎨 Themes
- Paper Light, Ops Dark, Premium Dark
- Theme persists across sessions
- Full mobile dark mode support

### 🔒 Security
- Auth middleware on all API routes
- Wildcard CORS locked to localhost
- Path traversal prevention on file/memory routes
- Rate limiting on all endpoints
- Skills security scanning before install
- Exec approval workflow for sensitive commands

---

## 🗺️ Roadmap

| Feature | Status |
|---------|--------|
| Mission Control + Agent Hub | ✅ Shipped (v3.0) |
| Live SSE Streaming | ✅ Shipped (v3.0) |
| Cost Analytics | ✅ Shipped (v3.0) |
| Mobile PWA + Tailscale | ✅ Shipped (v3.0) |
| Native Desktop App (Electron) | 🔨 In Development |
| Cloud / Hosted Version | 🔜 Coming Soon |
| Team Collaboration | 🔜 Coming Soon |
| Multi-device Session Sync | 🔜 Coming Soon |
| Provider Approval Workflow | 🔨 In Development |
| Board Groups / Project Hierarchy | 📋 Planned |

---

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=outsourc-e/clawsuite&type=date&logscale&legend=top-left)](https://www.star-history.com/#outsourc-e/clawsuite&type=date&logscale&legend=top-left)

---

## 💛 Support the Project

ClawSuite is free and open source. If it's saving you time and powering your workflow, consider supporting development:

**ETH:** `0xB332D4C60f6FBd94913e3Fd40d77e3FE901FAe22`

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-%E2%9D%A4-pink?logo=github)](https://github.com/sponsors/outsourc-e)

Every contribution helps keep this project moving. Thank you 🙏

---

## 🤝 Contributing

PRs are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- Bug fixes → open a PR directly
- New features → open an issue first to discuss
- Security issues → see [SECURITY.md](SECURITY.md) for responsible disclosure

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <sub>Built with ⚡ by <a href="https://github.com/outsourc-e">@outsourc-e</a> and the ClawSuite community</sub>
</div>
