// The ONLY bridge between renderer and main. Exposes an allowlisted invoke/on; nothing else (docs/06 §6.1).
import { contextBridge, ipcRenderer } from 'electron';
import { isEventChannel, isInvokeChannel } from '../shared/ipc';
import type { RendererApi } from '../shared/api';

const api: RendererApi = {
  invoke: (channel, payload) => {
    if (!isInvokeChannel(channel)) return Promise.resolve({ ok: false, error: { code: 'VALIDATION', message: 'Unknown channel.' } });
    return ipcRenderer.invoke(channel, payload);
  },
  on: (channel, cb) => {
    if (!isEventChannel(channel)) return () => undefined;
    const listener = (_e: unknown, payload: unknown): void => cb(payload as never);
    ipcRenderer.on(channel, listener);
    return () => { ipcRenderer.removeListener(channel, listener); };
  },
};
contextBridge.exposeInMainWorld('api', api);
