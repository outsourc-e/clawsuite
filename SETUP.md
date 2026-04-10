# ControlSuite — Setup Guide

> This file is optimized for both humans and AI agents. Every step includes verification commands so you can confirm it worked.

## Prerequisites

### 1. Node.js 22+

```bash
node --version
# Expected: v22.x.x or higher
```

If not installed: [nodejs.org](https://nodejs.org/) — use the LTS version.

### 2. OpenClaw Gateway

ControlSuite is a dashboard for OCPlatform. It connects to the OCPlatform gateway via WebSocket on port `18789`.

**Check if gateway is running:**

```bash
# Check if something is listening on the gateway port
nc -z 127.0.0.1 18789 2>/dev/null && echo "Gateway is running" || echo "Gateway is NOT running"

# Alternative: check with node
node -e "require('net').createConnection(18789,'127.0.0.1').on('connect',()=>{console.log('Gateway is running');process.exit()}).on('error',()=>{console.log('Gateway is NOT running');process.exit(1)})"
```

If the gateway is not running, install and start OCPlatform first — install via `npm install -g ocplatform` then run `ocplatform gateway start`.

**Get your gateway token:**

```bash
# Option 1: Read from config file
cat ~/.ocplatform/openclaw.json | grep -o '"token":"[^"]*"' | head -1

# Option 2: Use the CLI (if installed)
ocplatform config get gateway.auth.token
```

Save this token — you'll need it in the next step.

---

## Install

```bash
git clone https://github.com/outsourc-e/clawsuite.git
cd clawsuite
npm install
```

**Verify install:**

```bash
ls node_modules/.package-lock.json 2>/dev/null && echo "Install OK" || echo "Install FAILED — run npm install again"
```

---

## Configure

```bash
cp .env.example .env
```

Edit `.env` and set these two **required** variables:

```env
CLAWDBOT_GATEWAY_URL=ws://127.0.0.1:18789
CLAWDBOT_GATEWAY_TOKEN=<paste your token from above>
```

**That's it.** All other variables in `.env` are optional.

### Optional Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CLAWSUITE_PASSWORD` | _(empty)_ | Password-protect the web UI |
| `CLAWSUITE_ALLOWED_HOSTS` | _(empty)_ | Allow non-localhost access (e.g. Tailscale IP) |

---

## Start

```bash
npm run dev
```

**Expected output:**

```
VITE vX.X.X  ready in XXX ms
  ➜  Local:   http://localhost:3000/
```

Open `http://localhost:3000` in your browser.

**Verify it works:**

```bash
curl -s http://localhost:3000 -o /dev/null -w "%{http_code}"
# Expected: 200
```

---

## First Launch

On first launch, ControlSuite will show a **setup wizard** that helps you:

1. Enter your gateway URL and token
2. Test the connection
3. Optionally configure an AI provider (OpenAI, Anthropic, etc.)

If you already configured `.env` correctly, the wizard will auto-detect and connect.

---

## Troubleshooting

### White screen after loading

**Cause:** The gateway is not reachable or not configured.

**Fix:**

1. Check gateway is running:
   ```bash
   nc -z 127.0.0.1 18789 && echo "Running" || echo "Not running"
   ```
2. Check `.env` has the correct values:
   ```bash
   grep CLAWDBOT_ .env
   ```
3. Make sure you're using `ws://` not `http://` for the gateway URL
4. Restart the dev server after changing `.env`

### "Connection refused" errors

**Cause:** OCPlatform gateway is not running on port 18789.

**Fix:** Start the gateway first, then start ControlSuite.

### Wrong port

ControlSuite runs on port `3000` by default. The OCPlatform gateway runs on port `18789`. These are different services — don't mix them up.

### Agent messed up the code

If an AI agent made changes that broke the setup:

```bash
git checkout .
npm install
```

This resets all code to the clean repo state.

---

## Architecture (for AI agents)

```
clawsuite/
├── src/
│   ├── routes/          # TanStack Router pages + API routes
│   ├── screens/         # Major screen layouts (chat, dashboard, etc.)
│   ├── components/      # Shared UI components
│   ├── hooks/           # React hooks
│   ├── lib/             # Utilities
│   └── server/          # Server-side gateway communication
├── .env                 # Local config (not committed)
├── .env.example         # Template for .env
└── package.json         # Dependencies and scripts
```

### Key concepts

- **ControlSuite** is a frontend dashboard that connects to OCPlatform via WebSocket
- **OCPlatform Gateway** (port 18789) is the backend that manages AI agents
- The server-side code in `src/server/gateway.ts` handles the WebSocket connection
- All API routes in `src/routes/api/` proxy through the gateway connection
- The gateway URL and token are configured via environment variables, not hardcoded

### Available scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Run production build |
| `npm run lint` | Run ESLint |
| `npm run test` | Run tests |

---

## Common `.env` Mistakes

| Wrong | Right | Why |
|-------|-------|-----|
| `GATEWAY_URL=...` | `CLAWDBOT_GATEWAY_URL=...` | Variable name must include `CLAWDBOT_` prefix |
| `CLAWDBOT_GATEWAY_URL=http://...` | `CLAWDBOT_GATEWAY_URL=ws://...` | Must use WebSocket protocol (`ws://` or `wss://`) |
| `CLAWDBOT_GATEWAY_URL=ws://localhost:3000` | `CLAWDBOT_GATEWAY_URL=ws://127.0.0.1:18789` | Port 3000 is ControlSuite, port 18789 is the gateway |
| No `.env` file at all | `cp .env.example .env` | The file must exist |
