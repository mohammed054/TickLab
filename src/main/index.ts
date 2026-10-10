// Electron main entry. Single instance; DB under userData; secrets via safeStorage; two windows (docs/01, 05, 07).
import { app, safeStorage, session, shell, powerMonitor, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import log from 'electron-log/main';
import { openDb } from './db/open';
import { migrate } from './db/migrate';
import { setLogBackend } from './logger';
import { createFileSecretStore, createMemorySecretStore } from './settings/secrets';
import { createRuntime } from './app/runtime';
import { installCrashHandlers } from './app/crash';
import { Windows, CSP } from './windows';
import { buildMenu } from './menu';
import { INVOKE_CHANNELS } from '../shared/ipc';
import { logError } from './db/queries/usage';

const DEV = !app.isPackaged;
if (!app.requestSingleInstanceLock()) { app.quit(); } else { void boot(); }

async function boot(): Promise<void> {
  log.transports.file.maxSize = 2 * 1024 * 1024;
  setLogBackend({ log: (level, msg) => log[level](msg) });
  installCrashHandlers();
  await app.whenReady();

  const dataDir = app.getPath('userData');
  mkdirSync(dataDir, { recursive: true });
  const db = openDb(join(dataDir, 'ticklab.db'));
  migrate(db);
  const secrets = safeStorage.isEncryptionAvailable()
    ? createFileSecretStore(join(dataDir, 'secrets.bin'), { available: () => safeStorage.isEncryptionAvailable(), encrypt: (p) => safeStorage.encryptString(p), decrypt: (b) => safeStorage.decryptString(b) })
    : createMemorySecretStore(); // never persisted in plain text

  // Renderer has no network: CSP header on every response + deny all permission requests.
  session.defaultSession.webRequest.onHeadersReceived((d, cb) => cb({ responseHeaders: { ...d.responseHeaders, 'Content-Security-Policy': [CSP] } }));
  session.defaultSession.setPermissionRequestHandler((_w, _p, cb) => cb(false));

  let windows: Windows | null = null;
  const rt = createRuntime({
    db, secrets,
    os: {
      version: app.getVersion(), dataDir,
      openExternal: (u) => { void shell.openExternal(u); }, openDataFolder: () => { void shell.openPath(dataDir); },
      focusDetail: () => windows?.openDetail(true), setPin: (p) => windows?.setPin(p),
    },
    emit: (c, p) => windows?.send(c, p),
  });
  windows = new Windows(rt.settings, join(__dirname, '../preload/index.js'), DEV ? (process.env['ELECTRON_RENDERER_URL'] ?? null) : null, join(__dirname, '../renderer/index.html'));

  for (const ch of INVOKE_CHANNELS) ipcMain.handle(ch, (_e, payload: unknown) => rt.dispatch(ch, payload)); // only allowlisted channels exist

  buildMenu({ openDetail: () => windows?.openDetail(true), openDataFolder: () => { void shell.openPath(dataDir); }, dev: DEV });
  windows.open();
  await rt.start();
  rt.backup();
  const backupTimer = setInterval(() => rt.backup(), 24 * 3_600_000); backupTimer.unref();

  powerMonitor.on('suspend', () => { void rt.suspend(); });
  powerMonitor.on('resume', () => { rt.resume(); });
  app.on('second-instance', () => { const w = windows?.feed; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  app.on('render-process-gone', (_e, _wc, d) => { logError(db, 'app', 'RENDERER_GONE', d.reason, Date.now()); });
  app.on('window-all-closed', () => { app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) windows?.open(); });
  let closing = false;
  app.on('before-quit', (e) => {
    if (closing) return;
    e.preventDefault(); closing = true;
    void rt.stop().finally(() => { try { rt.backup(); db.close(); } catch { /* already closed */ } app.exit(0); });
  });
}
