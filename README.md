# OpenClaw Studio

![Cover](./public/cover.webp)

**Supercharged chat interface for OpenClaw AI agents**

A modern, feature-rich web client for OpenClaw with:
- 💬 **Real-time streaming** - ChatGPT-style character-by-character responses
- 📊 **Usage Tracking** - Session & provider-level token/cost monitoring with alerts
- 📁 **File Explorer** - Browse, edit, and manage workspace files with Monaco editor
- 💻 **Integrated Terminal** - Full terminal access with tabs and history
- 🎨 **Dark mode** - Beautiful, responsive UI that adapts to your preferences
- 📱 **PWA support** - Install as a native app

Currently in beta.

## Setup

Create `.env.local` with `CLAWDBOT_GATEWAY_URL` and either `CLAWDBOT_GATEWAY_TOKEN` (recommended) or `CLAWDBOT_GATEWAY_PASSWORD`. These map to your OpenClaw Gateway auth (`gateway.auth.token` or `gateway.auth.password`). Default URL is `ws://127.0.0.1:18789`. Docs: https://docs.openclaw.ai/gateway

```bash
npm install
npm run dev
```
