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
const WORKSPACE_DAEMON_PORT = 3099;
let workspaceDaemonProcess = null;

// Prevent multiple instances
const gotTheLock = electron_1.app.requestSingleInstanceLock();
if (!gotTheLock) {
    electron_1.app.quit();
}

let mainWindow = null;
let tray = null;
let gatewayProcess = null;
let localServer = null;
let localServerPort = 0;

// Gateway detection
const DEFAULT_GATEWAY_PORT = 18789;
const DEV_PORT = 3000;

// ── Production app server ─────────────────────────────────────────────────

function getGatewayUrl() {
    try {
        const code = (0, child_process_1.execSync)(
            `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${DEFAULT_GATEWAY_PORT}/health`,
            { timeout: 3000 }
        ).toString().trim();
        if (code !== '200') throw new Error('not 200');
        return `http://127.0.0.1:${DEFAULT_GATEWAY_PORT}`;
    } catch {
        return null;
    }
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
    try {
        await fetch(`http://127.0.0.1:${WORKSPACE_DAEMON_PORT}/api/stats`, {
            signal: AbortSignal.timeout(1000),
        });
        return true;
    } catch {
        return false;
    }
}

async function startWorkspaceDaemonIfNeeded() {
    if (await isWorkspaceDaemonRunning()) {
        return;
    }
    const repoDir = (0, path_1.join)(__dirname, "..");
    const daemonPath = (0, path_1.join)(__dirname, "..", "workspace-daemon", "dist", "server.js");
    const srcEntry = (0, path_1.join)(repoDir, "workspace-daemon", "src", "server.ts");
    const dbPath = (0, path_1.join)(electron_1.app.getPath("userData"), "workspace.db");
    if ((0, fs_1.existsSync)(daemonPath)) {
        workspaceDaemonProcess = (0, child_process_1.spawn)("node", [daemonPath], {
            env: { ...process.env, PORT: String(WORKSPACE_DAEMON_PORT), DB_PATH: dbPath },
            stdio: "pipe",
        });
        workspaceDaemonProcess.stdout?.on("data", (data) => {
            console.log(`[daemon] ${data.toString().trimEnd()}`);
        });
        workspaceDaemonProcess.stderr?.on("data", (data) => {
            console.error(`[daemon] ${data.toString().trimEnd()}`);
        });
        return;
    }
    if ((0, fs_1.existsSync)(srcEntry)) {
        workspaceDaemonProcess = (0, child_process_1.spawn)("npx", ["--prefix", "workspace-daemon", "tsx", "src/server.ts"], {
            cwd: repoDir,
            env: { ...process.env, PORT: String(WORKSPACE_DAEMON_PORT), DB_PATH: dbPath },
            stdio: "ignore",
            detached: false,
            shell: true,
        });
    }
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

        // Start the bundled production server (electron/prod-server.cjs)
        const prodServerPath = (0, path_1.join)(__dirname, 'prod-server.cjs');
        if (!(0, fs_1.existsSync)(prodServerPath)) {
            console.error('[ClawSuite] prod-server.cjs not found');
            return reject(new Error('Production server not found'));
        }

        console.log(`[ClawSuite] Starting production server on port ${PROD_SERVER_PORT}...`);
        appProcess = (0, child_process_1.spawn)(process.execPath, [prodServerPath], {
            env: { ...process.env, PORT: String(PROD_SERVER_PORT) },
            stdio: 'pipe',
        });

        let started = false;
        const timeout = setTimeout(() => {
            if (!started) {
                started = true;
                localServerPort = PROD_SERVER_PORT;
                resolve(PROD_SERVER_PORT);
            }
        }, 10000);

        appProcess.stdout?.on('data', (data) => {
            const output = data.toString();
            console.log('[prod-server]', output.trim());
            if (!started && output.includes('listening')) {
                started = true;
                clearTimeout(timeout);
                localServerPort = PROD_SERVER_PORT;
                console.log(`[ClawSuite] Production server ready on port ${PROD_SERVER_PORT}`);
                resolve(PROD_SERVER_PORT);
            }
        });

        appProcess.stderr?.on('data', (data) => {
            console.error('[prod-server-err]', data.toString().trim());
        });

        appProcess.on('error', (err) => {
            console.error('[ClawSuite] Production server failed:', err);
            if (!started) {
                started = true;
                clearTimeout(timeout);
                reject(err);
            }
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

    const gatewayUrl = getGatewayUrl();
    if (!gatewayUrl && isOpenClawInstalled()) {
        console.log('[ClawSuite] Gateway not running, auto-starting...');
        try {
            gatewayProcess = (0, child_process_1.spawn)('openclaw', ['gateway', 'start'], {
                shell: true,
                stdio: 'ignore',
                detached: true,
            });
            gatewayProcess.unref();
            await new Promise((resolve) => setTimeout(resolve, 3000));
        } catch (err) {
            console.error('[ClawSuite] Failed to auto-start gateway:', err);
        }
    }

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

function createTray() {
    const iconPath = (0, path_1.join)(__dirname, '..', 'assets', 'tray-icon.png');
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
                accelerator: 'CommandOrControl+Shift+C',
            },
            { type: 'separator' },
            {
                label: 'Quick Chat',
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.focus();
                        // Navigate to chat
                        mainWindow.webContents.executeJavaScript(
                            `window.location.hash = ''; window.location.pathname = '/';`
                        ).catch(() => {});
                    }
                },
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
    tray.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

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

electron_1.ipcMain.handle('workspace-daemon:status', async () => {
    try {
        await fetch(`http://127.0.0.1:${WORKSPACE_DAEMON_PORT}/api/stats`, {
            signal: AbortSignal.timeout(1000),
        });
        return { running: true };
    } catch {
        return { running: false };
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
electron_1.app.whenReady().then(async () => {
    await startWorkspaceDaemonIfNeeded();
    createWindow();
    createTray();
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
    tray?.destroy();
    if (appProcess) {
        appProcess.kill();
        appProcess = null;
    }
    if (gatewayProcess) {
        gatewayProcess.kill();
        gatewayProcess = null;
    }
    if (workspaceDaemonProcess) {
        workspaceDaemonProcess.kill();
        workspaceDaemonProcess = null;
    }
});

electron_1.app.setName('ClawSuite');
