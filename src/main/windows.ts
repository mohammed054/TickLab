// docs/05 §5.4 — two windows (Feed + Detail). Bounds persisted in settings; restored only if still on a visible display.
import { BrowserWindow, screen, shell, type Rectangle } from 'electron';

import type { SettingsStore } from './settings/store';

type Kind = 'feed' | 'detail';
interface Saved { x: number; y: number; width: number; height: number; displayId?: number; maximized?: boolean }
const DEFAULTS: Record<Kind, { width: number; height: number; minWidth: number; minHeight: number }> = {
  feed: { width: 1280, height: 800, minWidth: 900, minHeight: 560 },
  detail: { width: 560, height: 800, minWidth: 420, minHeight: 480 },
};
export const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

const visible = (r: Rectangle): boolean => screen.getAllDisplays().some((d) => {
  const b = d.workArea;
  return r.x < b.x + b.width - 40 && r.x + r.width > b.x + 40 && r.y < b.y + b.height - 40 && r.y + r.height > b.y + 40;
});

export class Windows {
  feed: BrowserWindow | null = null; detail: BrowserWindow | null = null;
  constructor(private settings: SettingsStore, private preloadPath: string, private rendererUrl: string | null, private rendererFile: string) {}

  private create(kind: Kind): BrowserWindow {
    const d = DEFAULTS[kind]; const saved = this.settings.get(kind === 'feed' ? 'window.feed' : 'window.detail') as Saved | null;
    const useSaved = saved && visible(saved);
    const win = new BrowserWindow({
      ...d, ...(useSaved ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height } : {}),
      show: false, backgroundColor: '#0B0E11', title: kind === 'feed' ? 'TickLab Radar' : 'TickLab Radar — Detail', autoHideMenuBar: true,
      webPreferences: { preload: this.preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false },
    });
    if (useSaved && saved.maximized) win.maximize();
    win.once('ready-to-show', () => win.show());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    const save = (): void => {
      if (win.isDestroyed()) return;
      const b = win.getNormalBounds();
      try { this.settings.set(kind === 'feed' ? 'window.feed' : 'window.detail', { ...b, displayId: screen.getDisplayMatching(b).id, maximized: win.isMaximized() }); } catch { /* bounds are best-effort */ }
    };
    win.on('close', save);
    const route = `#/${kind}`;
    if (this.rendererUrl) void win.loadURL(`${this.rendererUrl}${route}`); else void win.loadFile(this.rendererFile, { hash: `/${kind}` });
    return win;
  }

  open(): void {
    this.feed = this.create('feed');
    this.feed.on('closed', () => { this.feed = null; this.detail?.close(); });
    this.openDetail(false);
  }
  openDetail(focus: boolean): void {
    if (this.detail && !this.detail.isDestroyed()) { if (focus) { if (this.detail.isMinimized()) this.detail.restore(); this.detail.focus(); } return; }
    this.detail = this.create('detail');
    this.detail.on('closed', () => { this.detail = null; });
  }
  setPin(pinned: boolean): void { this.detail?.setAlwaysOnTop(pinned); }
  send(channel: string, payload: unknown): void {
    for (const w of [this.feed, this.detail]) if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  }
  isOpen(): boolean { return this.feed !== null; }
}
export const openLinkExternally = (url: string): void => { void shell.openExternal(url); };
