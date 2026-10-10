// Thin logger. The Electron entry wires electron-log as the backend (rotation 5 x 2 MB).
// Never log secrets: callers pass plain messages only.
export type Level = 'error' | 'warn' | 'info' | 'debug';
export interface LogBackend { log(level: Level, msg: string): void }

let backend: LogBackend = { log: () => undefined };
const SECRET_RE = /(sk-or-[A-Za-z0-9_-]{8,}|api[-_]?key=[^&\s]+|Bearer\s+[A-Za-z0-9._-]{8,})/gi;

export function setLogBackend(b: LogBackend): void { backend = b; }
export function redact(msg: string): string { return msg.replace(SECRET_RE, '[redacted]'); }
const emit = (l: Level) => (msg: string): void => backend.log(l, redact(msg));
export const log = { error: emit('error'), warn: emit('warn'), info: emit('info'), debug: emit('debug') };
