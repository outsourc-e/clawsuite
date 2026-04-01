"use strict";
/**
 * ClawSuite Electron Main Process
 * Wraps the Vite-built web app in a native desktop window.
 *
 * Production mode starts a local HTTP server that serves the built client
 * files and proxies /api/* requests to the OpenClaw gateway.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = require("path");
const fs_1 = require("fs");
const child_process_1 = require("child_process");

// Prevent multiple instances
const gotTheLock = electron_1.app.requestSingleInstanceLock();
if (!gotTheLock) {
    electron_1.app.quit();
}

let mainWindow = null;
let tray = null;
let quickChatWindow = null;
let gatewayProcess = null;
let localServer = null;
let localServerPort = 0;

// Gateway detection
const DEFAULT_GATEWAY_PORT = 18789;
const DEV_PORT = 3000;
const GATEWAY_HEALTH_URL = `http://127.0.0.1:${DEFAULT_GATEWAY_PORT}/health`;

// ── Gateway Monitor ───────────────────────────────────────────────────────
/**
 * GatewayMonitor: polls /health every 10s, auto-restarts on 3 consecutive
 * failures, notifies renderer via 'gateway:status' IPC events.
 */
class GatewayMonitor {
    constructor() {
        this.state = 'starting';
        this.consecutiveFailures = 0;
        this.restartAttempts = 0;
        this.maxRestartAttempts = 2;
        this.pollIntervalMs = 10000;
        this.failureThreshold = 3;
        this.pollTimer = null;
        this.manualStop = false; // set true when user deliberately stops gateway
    }

    start() {
        if (this.pollTimer) return;
        this.pollTimer = setInterval(() => this._tick(), this.pollIntervalMs);
        console.log('[GatewayMonitor] Started');
    }

    stop() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        console.log('[GatewayMonitor] Stopped');
    }

    notifyManualStop() {
        this.manualStop = true;
    }

    notifyManualStart() {
        this.manualStop = false;
        this.restartAttempts = 0;
        this.consecutiveFailures = 0;
    }

    _sendStatus(state, message) {
        if (this.state !== state || message) {
            this.state = state;
            console.log(`[GatewayMonitor] State: ${state} — ${message || ''}`);
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('gateway:status', { state, message: message || '' });
        }
    }

    async _checkHealth() {
        try {
            const http = require('http');
            return await new Promise((resolve) => {
                const req = http.get(GATEWAY_HEALTH_URL, { timeout: 3000 }, (res) => {
                    resolve(res.statusCode === 200);
                });
                req.on('error', () => resolve(false));
                req.on('timeout', () => { req.destroy(); resolve(false); });
            });
        } catch {
            return false;
        }
    }

    async _attemptRestart() {
        if (this.manualStop) {
            console.log('[GatewayMonitor] Skipping restart — manual stop flag set');
            return false;
        }
        if (!isOpenClawInstalled()) {
            console.log('[GatewayMonitor] openclaw not found, cannot restart');
            return false;
        }
        this.restartAttempts++;
        console.log(`[GatewayMonitor] Restart attempt ${this.restartAttempts}/${this.maxRestartAttempts}`);
        this._sendStatus('restarting', `Restarting gateway (attempt ${this.restartAttempts})...`);

        try {
            const child = (0, child_process_1.spawn)('openclaw', ['gateway', 'start'], {
                detached: true,
                stdio: 'ignore',
                shell: true,
            });
            child.unref();
        } catch (err) {
            console.error('[GatewayMonitor] Failed to spawn restart:', err);
            return false;
        }

        // Poll up to 30s for health to return
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 2000));
            if (await this._checkHealth()) {
                return true;
            }
        }
        return false;
    }

    async _tick() {
        const healthy = await this._checkHealth();
        if (healthy) {
            if (this.consecutiveFailures > 0 || this.state !== 'connected') {
                this._sendStatus('connected', 'Gateway connected ✓');
            }
            this.consecutiveFailures = 0;
            this.restartAttempts = 0;
        } else {
            this.consecutiveFailures++;
            console.log(`[GatewayMonitor] Health check failed (${this.consecutiveFailures}/${this.failureThreshold})`);

            if (this.consecutiveFailures < this.failureThreshold) {
                this._sendStatus('disconnected', 'Gateway disconnected — reconnecting...');
                return;
            }

            // 3 consecutive failures → attempt restart
            if (this.manualStop) {
                this._sendStatus('disconnected', 'Gateway offline (manually stopped)');
                return;
            }

            if (this.restartAttempts >= this.maxRestartAttempts) {
                this._sendStatus('failed', 'Gateway offline — click to retry');
                return;
            }

            const recovered = await this._attemptRestart();
            if (recovered) {
                this.consecutiveFailures = 0;
                this._sendStatus('connected', 'Gateway connected ✓');
            } else if (this.restartAttempts >= this.maxRestartAttempts) {
                this._sendStatus('failed', 'Gateway offline — click to retry');
            }
        }
    }
}

const gatewayMonitor = new GatewayMonitor();

// ── Production app server ─────────────────────────────────────────────────

function getGatewayUrl() {
    try {
        const code = (0, child_process_1.execSync)(
            `curl -s -o /dev/null -w "%{http_code}" ${GATEWAY_HEALTH_URL}`,
            { timeout: 3000 }
        ).toString().trim();
        if (code !== '200') throw new Error('not 200');
        return `http://127.0.0.1:${DEFAULT_GATEWAY_PORT}`;
    } catch {
        return null;
    }
}

/**
 * Async version of getGatewayUrl using http module (no execSync).
 * Returns the gateway base URL or null.
 */
async function getGatewayUrlAsync() {
    try {
        const http = require('http');
        const ok = await new Promise((resolve) => {
            const req = http.get(GATEWAY_HEALTH_URL, { timeout: 3000 }, (res) => {
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
        });
        return ok ? `http://127.0.0.1:${DEFAULT_GATEWAY_PORT}` : null;
    } catch {
        return null;
    }
}

/**
 * Auto-start the gateway on app launch. Waits up to 30s for it to come online.
 * Returns true if gateway is healthy.
 */
async function ensureGatewayRunning() {
    // Already up?
    if (await getGatewayUrlAsync()) {
        console.log('[ClawSuite] Gateway already running');
        return true;
    }

    if (!isOpenClawInstalled()) {
        console.log('[ClawSuite] openclaw not installed, skipping auto-start');
        return false;
    }

    console.log('[ClawSuite] Gateway not running — auto-starting with --bind lan...');
    try {
        const child = (0, child_process_1.spawn)('openclaw', ['gateway', 'start', '--bind', 'lan'], {
            detached: true,
            stdio: 'ignore',
            shell: true,
        });
        child.unref();
    } catch (err) {
        console.error('[ClawSuite] Failed to spawn gateway start:', err);
        return false;
    }

    // Poll up to 30s
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        if (await getGatewayUrlAsync()) {
            console.log('[ClawSuite] Gateway came online');
            return true;
        }
    }

    console.warn('[ClawSuite] Gateway did not come online within 30s');
    return false;
}

function isOpenClawInstalled() {
    try {
        (0, child_process_1.execSync)('which openclaw || where openclaw', { timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

async function isWorkspaceDaemonRunning() {
}

// ── Find or start ClawSuite server ────────────────────────────────────────
let appProcess = null;
const PROD_SERVER_PORT = 3003;

function startLocalServer(_gatewayUrl) {
    return new Promise((resolve, reject) => {
        // Check if something is already running on common ports
        for (const port of [3000, 3003, 3001]) {
            try {
                const code = (0, child_process_1.execSync)(
                    `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${port}/`,
                    { timeout: 2000 }
                ).toString().trim();
                if (['200', '301', '307', '401', '503'].includes(code)) {
                    localServerPort = port;
                    console.log(`[ClawSuite] Found running server on port ${port}`);
                    return resolve(port);
                }
            } catch { /* not running */ }
        }

        // Start an inline HTTP server serving the SSR build
        const http = require('http');
        const DIST_CLIENT = (0, path_1.join)(__dirname, '..', 'dist', 'client');
        const BUNDLED_SERVER = (0, path_1.join)(__dirname, 'server-bundle.mjs');

        const MIME_TYPES = {
            '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
            '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
            '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
            '.webmanifest': 'application/manifest+json', '.gif': 'image/gif',
        };

        console.log(`[ClawSuite] Starting inline SSR server on port ${PROD_SERVER_PORT}...`);

        import(`file://${BUNDLED_SERVER}`).then((serverModule) => {
            const serverBuild = serverModule.default;

            const server = http.createServer(async (req, res) => {
                const url = req.url || '/';
                const pathname = url.split('?')[0];

                // Serve static files from dist/client
                if (pathname !== '/' && !pathname.startsWith('/api/')) {
                    const filePath = (0, path_1.join)(DIST_CLIENT, pathname);
                    if ((0, fs_1.existsSync)(filePath) && (0, fs_1.statSync)(filePath).isFile()) {
                        const ext = (0, path_1.extname)(filePath);
                        const mime = MIME_TYPES[ext] || 'application/octet-stream';
                        const content = (0, fs_1.readFileSync)(filePath);
                        res.writeHead(200, {
                            'Content-Type': mime,
                            'Cache-Control': pathname.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
                        });
                        res.end(content);
                        return;
                    }
                }

                // SSR
                try {
                    const headers = new Headers();
                    for (const [key, value] of Object.entries(req.headers)) {
                        if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
                    }
                    const fullUrl = `http://127.0.0.1:${PROD_SERVER_PORT}${url}`;
                    const webRequest = new Request(fullUrl, {
                        method: req.method,
                        headers,
                        body: req.method !== 'GET' && req.method !== 'HEAD'
                            ? await new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); })
                            : undefined,
                        duplex: 'half',
                    });
                    const webResponse = await serverBuild.fetch(webRequest);
                    const resHeaders = {};
                    webResponse.headers.forEach((v, k) => { resHeaders[k] = v; });
                    res.writeHead(webResponse.status, webResponse.statusText || '', resHeaders);
                    if (webResponse.body) {
                        const reader = webResponse.body.getReader();
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            res.write(value);
                        }
                    }
                    res.end();
                } catch (err) {
                    console.error('[ClawSuite] SSR error:', err);
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Internal Server Error');
                }
            });

            server.listen(PROD_SERVER_PORT, '127.0.0.1', () => {
                localServerPort = PROD_SERVER_PORT;
                console.log(`[ClawSuite] SSR server ready on port ${PROD_SERVER_PORT}`);
                resolve(PROD_SERVER_PORT);
            });

            server.on('error', (err) => {
                console.error('[ClawSuite] SSR server failed:', err);
                reject(err);
            });
        }).catch((err) => {
            console.error('[ClawSuite] Failed to load server bundle:', err);
            reject(err);
        });
    });
}

function getAppUrl() {
    if (process.env.NODE_ENV === 'development') {
        return `http://localhost:${DEV_PORT}`;
    }
    // In production, use the local server
    if (localServerPort > 0) {
        return `http://127.0.0.1:${localServerPort}`;
    }
    // Fallback (should not happen)
    return `file://${(0, path_1.join)(__dirname, '..', 'dist', 'client', 'index.html')}`;
}

async function createWindow() {
    const iconPath = (0, path_1.join)(__dirname, '..', 'assets', 'icon.png');
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: 'ClawSuite',
        icon: (0, fs_1.existsSync)(iconPath) ? iconPath : undefined,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 12 },
        backgroundColor: '#0a0a0f',
        show: false,
        webPreferences: {
            preload: (0, path_1.join)(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
        mainWindow?.focus();
    });

    if (process.env.NODE_ENV !== 'development') {
        try {
            await startLocalServer(getGatewayUrl());
        } catch (err) {
            console.error('[ClawSuite] Failed to start local server:', err);
        }
    }

    const appUrl = getAppUrl();
    console.log(`[ClawSuite] Loading: ${appUrl}`);
    mainWindow.loadURL(appUrl);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http')) {
            electron_1.shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function createQuickChatWindow() {
    if (quickChatWindow) return; // already created, just toggle

    quickChatWindow = new electron_1.BrowserWindow({
        width: 400,
        height: 500,
        show: false,
        frame: false,
        resizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        transparent: false,
        vibrancy: 'under-window', // macOS frosted glass (subtle, no-op on other OS)
        visualEffectState: 'active',
        roundedCorners: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: (0, path_1.join)(__dirname, 'quick-chat-preload.cjs'),
        },
    });

    quickChatWindow.loadFile((0, path_1.join)(__dirname, 'quick-chat.html'));

    // Hide instead of close when user clicks the OS close button
    quickChatWindow.on('close', (e) => {
        e.preventDefault();
        quickChatWindow?.hide();
    });

    quickChatWindow.on('blur', () => {
        // Hide on blur (click outside), but only after a small delay
        // so clicks on the tray icon don't double-fire
        setTimeout(() => {
            if (quickChatWindow && !quickChatWindow.isDestroyed() && quickChatWindow.isVisible()) {
                quickChatWindow.hide();
            }
        }, 100);
    });
}

function toggleQuickChat() {
    if (!quickChatWindow || quickChatWindow.isDestroyed()) {
        
        // Wait for window to be created then show it
        quickChatWindow?.once('ready-to-show', () => positionAndShowQuickChat());
        return;
    }

    if (quickChatWindow.isVisible()) {
        quickChatWindow.hide();
    } else {
        positionAndShowQuickChat();
    }
}

function positionAndShowQuickChat() {
    if (!quickChatWindow || quickChatWindow.isDestroyed()) return;

    // Position near tray icon on macOS (top-right of screen)
    const { screen } = electron_1;
    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint);
    const { bounds } = display;
    const windowBounds = quickChatWindow.getBounds();

    // Try to anchor near the tray area: top-right, with some margin
    let x = bounds.x + bounds.width - windowBounds.width - 20;
    let y = bounds.y + 30; // below macOS menu bar

    // If tray is available, try to get its bounds for a more accurate position
    if (tray) {
        try {
            const trayBounds = tray.getBounds();
            if (trayBounds && trayBounds.x) {
                x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
                y = trayBounds.y + trayBounds.height + 4;
                // Keep within screen bounds
                x = Math.max(bounds.x + 10, Math.min(x, bounds.x + bounds.width - windowBounds.width - 10));
            }
        } catch { /* tray bounds not available on all platforms */ }
    }

    quickChatWindow.setPosition(x, y);
    quickChatWindow.show();
    quickChatWindow.focus();
}

function createTray() {
    // Check app bundle Resources/assets first (production), then relative path (dev)
    let iconPath = (0, path_1.join)(process.resourcesPath || '', 'assets', 'tray-icon.png');
    if (!(0, fs_1.existsSync)(iconPath)) {
        iconPath = (0, path_1.join)(__dirname, '..', 'assets', 'tray-icon.png');
    }
    if (!(0, fs_1.existsSync)(iconPath)) return;

    const trayIcon = electron_1.nativeImage.createFromPath(iconPath);
    // macOS tray icons should be 22px (template for dark/light auto-switch)
    trayIcon.setTemplateImage(true);
    tray = new electron_1.Tray(trayIcon.resize({ width: 22, height: 22 }));
    tray.setToolTip('ClawSuite');

    function buildTrayMenu() {
        const gatewayUrl = getGatewayUrl();
        const isConnected = !!gatewayUrl;

        const contextMenu = electron_1.Menu.buildFromTemplate([
            {
                label: 'Open ClawSuite',
                click: () => { mainWindow?.show(); mainWindow?.focus(); },
            },
            { type: 'separator' },
            {
                label: 'Quick Chat',
                accelerator: 'CommandOrControl+Shift+C',
                click: () => { mainWindow?.show(); mainWindow?.focus(); },
            },
            { type: 'separator' },
            {
                label: 'Navigate',
                submenu: [
                    { label: '📊 Dashboard', click: () => navigateTo('/dashboard') },
                    { label: '🚀 Conductor', click: () => navigateTo('/conductor') },
                    { label: '📋 Tasks', click: () => navigateTo('/tasks') },
                    { label: '⏰ Cron', click: () => navigateTo('/cron') },
                    { label: '💰 Costs', click: () => navigateTo('/costs') },
                    { label: '⚙️ Settings', click: () => navigateTo('/settings') },
                ],
            },
            { type: 'separator' },
            {
                label: `Gateway: ${isConnected ? '● Connected' : '○ Disconnected'}`,
                enabled: false,
            },
            { type: 'separator' },
            { label: 'Quit ClawSuite', click: () => electron_1.app.quit() },
        ]);

        tray.setContextMenu(contextMenu);
    }

    function navigateTo(path) {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            const base = localServerPort > 0
                ? `http://127.0.0.1:${localServerPort}`
                : `http://localhost:${DEV_PORT}`;
            mainWindow.loadURL(`${base}${path}`);
        }
    }

    buildTrayMenu();
    // Refresh tray menu every 30s to update gateway status
    setInterval(buildTrayMenu, 30000);
    tray.on("click", () => { mainWindow?.show(); mainWindow?.focus(); });
}

// IPC: quick chat hide
electron_1.ipcMain.on('quick-chat:hide', () => {
    quickChatWindow?.hide();
});

// IPC: renderer-triggered gateway restart (from GatewayStatusToast retry button)
electron_1.ipcMain.on('gateway:restart', async () => {
    console.log('[ClawSuite] Renderer requested gateway restart');
    gatewayMonitor.notifyManualStart();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('gateway:status', { state: 'restarting', message: 'Restarting gateway...' });
    }
    try {
        (0, child_process_1.execSync)('openclaw gateway stop', { timeout: 5000 });
    } catch { /* may not be running */ }
    const child = (0, child_process_1.spawn)('openclaw', ['gateway', 'start'], {
        detached: true,
        stdio: 'ignore',
        shell: true,
    });
    child.unref();
    // Let the monitor pick up the recovery on next tick
});

// IPC handlers for onboarding wizard
electron_1.ipcMain.handle('gateway:check', () => {
    return { url: getGatewayUrl(), installed: isOpenClawInstalled() };
});

electron_1.ipcMain.handle('gateway:install', async () => {
    return new Promise((resolve, reject) => {
        try {
            const install = (0, child_process_1.spawn)('npm', ['install', '-g', 'openclaw'], {
                shell: true,
                stdio: 'pipe',
            });
            let output = '';
            install.stdout?.on('data', (d) => { output += d.toString(); });
            install.stderr?.on('data', (d) => { output += d.toString(); });
            install.on('close', (code) => {
                if (code === 0) resolve({ success: true, output });
                else reject(new Error(`Install failed (${code}): ${output}`));
            });
        } catch (err) {
            reject(err);
        }
    });
});

electron_1.ipcMain.handle('gateway:start', async () => {
    return new Promise((resolve) => {
        gatewayProcess = (0, child_process_1.spawn)('openclaw', ['gateway', 'start'], {
            shell: true,
            stdio: 'pipe',
            detached: true,
        });
        gatewayProcess.unref();
        setTimeout(() => {
            const url = getGatewayUrl();
            resolve({ success: !!url, url });
        }, 5000);
    });
});

electron_1.ipcMain.handle('gateway:restart', async () => {
    try {
        (0, child_process_1.execSync)('openclaw gateway stop', { timeout: 5000 });
    } catch { /* may not be running */ }

    return new Promise((resolve) => {
        gatewayProcess = (0, child_process_1.spawn)('openclaw', ['gateway', 'start'], {
            shell: true,
            stdio: 'pipe',
            detached: true,
        });
        gatewayProcess.unref();
        setTimeout(() => {
            const url = getGatewayUrl();
            resolve({ success: !!url, url });
        }, 5000);
    });
});

electron_1.ipcMain.handle('gateway:connect', async (_event, url) => {
    try {
        const code = (0, child_process_1.execSync)(`curl -s -o /dev/null -w "%{http_code}" ${url}/health`, { timeout: 3000 }).toString().trim();
        if (code !== '200') throw new Error('not 200');
        return { success: true, url };
    } catch {
        return { success: false, error: 'Could not connect to gateway' };
    }
});

electron_1.ipcMain.handle('onboarding:complete', async (_event, config) => {
    if (mainWindow) {
        // Start local server with the configured gateway
        if (process.env.NODE_ENV !== 'development' && !localServer) {
            try {
                await startLocalServer(config.gatewayUrl);
            } catch (err) {
                console.error('[ClawSuite] Failed to start local server:', err);
            }
        }
        const appUrl = getAppUrl();
        const url = new URL(appUrl);
        url.searchParams.set('gateway', config.gatewayUrl);
        mainWindow.loadURL(url.toString());
    }
});

// App lifecycle
// ── Update checker ────────────────────────────────────────────────────────
async function checkForUpdates() {
    try {
        const pkg = require((0, path_1.join)(__dirname, '..', 'package.json'));
        const currentVersion = pkg.version;
        const res = await (await import('node:https')).default;
        const data = await new Promise((resolve, reject) => {
            const https = require('https');
            https.get('https://api.github.com/repos/outsourc-e/clawsuite/releases/latest', {
                headers: { 'User-Agent': 'ClawSuite/' + currentVersion },
            }, (resp) => {
                let body = '';
                resp.on('data', (c) => body += c);
                resp.on('end', () => {
                    try { resolve(JSON.parse(body)); } catch { resolve(null); }
                });
            }).on('error', reject);
        });
        if (!data || !data.tag_name) return;
        const latestVersion = data.tag_name.replace(/^v/, '');
        if (latestVersion === currentVersion) return;
        // Simple semver compare
        const cur = currentVersion.split('.').map(Number);
        const lat = latestVersion.split('.').map(Number);
        const isNewer = lat[0] > cur[0] || (lat[0] === cur[0] && lat[1] > cur[1]) || (lat[0] === cur[0] && lat[1] === cur[1] && lat[2] > cur[2]);
        if (!isNewer) return;
        // Find DMG asset
        const dmgAsset = (data.assets || []).find((a) => a.name.includes('arm64') && a.name.endsWith('.dmg'));
        const downloadUrl = dmgAsset ? dmgAsset.browser_download_url : data.html_url;
        const { dialog, shell } = require('electron');
        const result = await dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update Available',
            message: `ClawSuite v${latestVersion} is available`,
            detail: `You're running v${currentVersion}. ${data.body ? data.body.slice(0, 200) : ''}`,
            buttons: ['Download Update', 'Later'],
            defaultId: 0,
        });
        if (result.response === 0) {
            shell.openExternal(downloadUrl);
        }
    } catch (err) {
        console.log('[ClawSuite] Update check failed:', err.message);
    }
}

electron_1.app.whenReady().then(async () => {
    // Auto-start gateway before creating the window so the app loads connected
    await ensureGatewayRunning();

    createWindow();
    createTray();

    // Start monitoring gateway health — auto-restarts on failure, notifies renderer
    gatewayMonitor.start();

    // Send initial connected status once window is ready
    if (mainWindow) {
        mainWindow.webContents.once('did-finish-load', async () => {
            const isUp = await getGatewayUrlAsync();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('gateway:status', {
                    state: isUp ? 'connected' : 'disconnected',
                    message: isUp ? 'Gateway connected ✓' : 'Gateway disconnected — reconnecting...',
                });
            }
        });
    }

    // Check for updates after 10s (non-blocking)
    setTimeout(checkForUpdates, 10000);

    // Global shortcut: Cmd+Shift+C toggles quick chat popup
    electron_1.globalShortcut.register('CommandOrControl+Shift+C', () => {
        mainWindow?.show(); mainWindow?.focus();
    });

    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});

electron_1.app.on('before-quit', () => {
    electron_1.globalShortcut.unregisterAll();
    tray?.destroy();
    gatewayMonitor.stop();
    if (appProcess) {
        appProcess.kill();
        appProcess = null;
    }
    if (gatewayProcess) {
        gatewayProcess.kill();
        gatewayProcess = null;
    }
});

electron_1.app.setName('ClawSuite');
