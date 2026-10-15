// T0.1 — Machine and storage profile: records Windows version, CPU, RAM, disks, GPU/VRAM/driver,
// Python, CUDA availability, and current model cache sizes. Read-only: no downloads, no secrets.
// Acceptance: prints and saves data/p0/system.json; every field populated or explicitly "unknown".
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { cpus, freemem, homedir, release, totalmem, version as osKernelVersion } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_FILE = join(REPO_ROOT, 'data', 'p0', 'system.json');
const UNKNOWN = 'unknown';

async function tryRun(file, args, timeoutMs = 15_000) {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (e) {
    return {
      ok: false,
      stdout: String(e?.stdout ?? '').trim(),
      stderr: String(e?.stderr ?? e?.message ?? e).trim(),
      code: e?.code ?? UNKNOWN,
    };
  }
}

// node:os fallbacks for anything WMI cannot answer
const OS_FALLBACK = { caption: osKernelVersion(), release: release(), arch: process.arch };
const HOME = homedir();
const DRIVE_TYPES = { 2: 'removable', 3: 'fixed', 4: 'network', 5: 'cd-rom', 6: 'ram' };
const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const humanBytes = (b) => {
  if (typeof b !== 'number' || !Number.isFinite(b)) return UNKNOWN;
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let n = b;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 2 : 0)} ${units[i]}`;
};
const gib = (b) => (typeof b === 'number' && Number.isFinite(b) ? +(b / 1024 ** 3).toFixed(2) : UNKNOWN);

async function wmiSnapshot() {
  const script = [
    '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;',
    '$os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture;',
    '$cpu = Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed;',
    '$disks = Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName,DriveType,FileSystem,Size,FreeSpace;',
    '$gpu = Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,AdapterRAM;',
    '[pscustomobject]@{ os=$os; cpu=$cpu; disks=$disks; gpu=$gpu } | ConvertTo-Json -Depth 6 -Compress',
  ].join(' ');
  const r = await tryRun('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], 30_000);
  if (!r.ok) return { ok: false, error: r.stderr || String(r.code) };
  try {
    return { ok: true, data: JSON.parse(r.stdout.replace(/^\uFEFF/, '')) };
  } catch (e) {
    return { ok: false, error: `unparseable PowerShell output: ${String(e)}` };
  }
}

async function nvidiaSmiProbe() {
  const query = await tryRun(
    'nvidia-smi',
    ['--query-gpu=name,memory.total,memory.free,driver_version', '--format=csv,noheader,nounits'],
    15_000,
  );
  if (!query.ok) return { present: false, cudaVersion: UNKNOWN, devices: [] };
  const plain = await tryRun('nvidia-smi', [], 15_000);
  const cudaVersion = plain.ok
    ? (/CUDA (?:UMD )?Version:\s*([\d.]+)/.exec(plain.stdout)?.[1] ?? UNKNOWN)
    : UNKNOWN;
  const devices = query.stdout
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [name, total, free, driver] = line.split(',').map((s) => s.trim());
      return {
        name: name || UNKNOWN,
        vramTotalMiB: Number(total) || UNKNOWN,
        vramFreeMiB: Number(free) || UNKNOWN,
        driverVersion: driver || UNKNOWN,
        source: 'nvidia-smi',
      };
    });
  return { present: true, cudaVersion, devices };
}

async function pythonProbe() {
  for (const cmd of [['python'], ['py', '-3'], ['python3']]) {
    const r = await tryRun(cmd[0], [...cmd.slice(1), '--version'], 15_000);
    if (r.ok) {
      const raw = [r.stdout, r.stderr].filter(Boolean).join(' ').trim();
      return {
        command: cmd.join(' '),
        raw: raw || UNKNOWN,
        version: /Python\s+([\d.]+)/.exec(raw)?.[1] ?? UNKNOWN,
        base: cmd,
      };
    }
  }
  return { command: UNKNOWN, raw: UNKNOWN, version: UNKNOWN, base: null };
}

async function torchProbe(python) {
  if (!python.base) return { installed: UNKNOWN, reason: 'python not found' };
  const find = await tryRun(
    python.base[0],
    [...python.base.slice(1), '-c', "import importlib.util as u, json; print(json.dumps({'installed': bool(u.find_spec('torch'))}))"],
    30_000,
  );
  let found;
  try {
    found = JSON.parse(find.stdout);
  } catch {
    return { installed: UNKNOWN, error: find.stderr || 'torch probe failed' };
  }
  if (!found?.installed) return { installed: false };
  const r = await tryRun(
    python.base[0],
    [...python.base.slice(1), '-c', "import torch, json; print(json.dumps({'version': torch.__version__, 'cudaAvailable': bool(torch.cuda.is_available()), 'cudaVersion': torch.version.cuda}))"],
    120_000,
  );
  try {
    return { installed: true, ...JSON.parse(r.stdout) };
  } catch {
    return { installed: true, error: r.stderr || 'torch import failed' };
  }
}

async function nvccProbe() {
  const r = await tryRun('nvcc', ['--version'], 15_000);
  if (!r.ok) return { present: false };
  return { present: true, version: /release\s+([\d.]+)/.exec(r.stdout)?.[1] ?? UNKNOWN };
}

function dirSize(path, deadlineMs = 60_000) {
  if (!existsSync(path)) return { exists: false, bytes: 0, files: 0, timedOut: false };
  const deadline = Date.now() + deadlineMs;
  let bytes = 0;
  let files = 0;
  let timedOut = false;
  let unreadable = 0;
  const stack = [path];
  while (stack.length > 0) {
    if (Date.now() > deadline) { timedOut = true; break; }
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      unreadable++;
      continue;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      try {
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile()) { bytes += statSync(full).size; files++; }
      } catch {
        unreadable++;
      }
    }
  }
  return { exists: true, bytes, files, timedOut, unreadable };
}

function driveOf(path) {
  const m = /^([A-Za-z]:)/.exec(path ?? '');
  return m ? m[1].toUpperCase() : UNKNOWN;
}

const notes = ['No model downloads were performed; profile is read-only.'];
const [wmi, nvidia] = await Promise.all([wmiSnapshot(), nvidiaSmiProbe()]);
if (!wmi.ok) notes.push(`WMI snapshot failed: ${wmi.error}`);
const wmiData = wmi.ok ? wmi.data : {};

const wmiOs = asArray(wmiData.os)[0];
const wmiCpus = asArray(wmiData.cpu);
const wmiCpu = wmiCpus[0];
const osCpus = cpus();

const disks = asArray(wmiData.disks).map((d) => ({
  deviceId: d.DeviceID ?? UNKNOWN,
  volumeName: d.VolumeName ?? '',
  type: DRIVE_TYPES[d.DriveType] ?? UNKNOWN,
  fileSystem: d.FileSystem ?? UNKNOWN,
  totalBytes: typeof d.Size === 'number' ? d.Size : UNKNOWN,
  totalHuman: humanBytes(d.Size),
  freeBytes: typeof d.FreeSpace === 'number' ? d.FreeSpace : UNKNOWN,
  freeHuman: humanBytes(d.FreeSpace),
}));
if (disks.length === 0) notes.push('No disks reported by WMI.');

const diskByDrive = new Map(disks.filter((d) => d.deviceId !== UNKNOWN).map((d) => [d.deviceId, d]));
const locations = {};
for (const [name, path] of [
  ['repoRoot', REPO_ROOT],
  ['userDataBase', process.env.APPDATA ?? UNKNOWN],
  ['home', HOME],
]) {
  if (path === UNKNOWN) { locations[name] = { path: UNKNOWN, drive: UNKNOWN, freeBytes: UNKNOWN }; continue; }
  const drive = driveOf(path);
  const disk = diskByDrive.get(drive);
  locations[name] = {
    path,
    drive,
    freeBytes: disk?.freeBytes ?? UNKNOWN,
    freeHuman: disk?.freeHuman ?? UNKNOWN,
  };
}

const wmiGpus = asArray(wmiData.gpu);
if (!nvidia.present && wmiGpus.length > 0) {
  notes.push('nvidia-smi unavailable; GPU data from WMI only. WMI AdapterRAM is a UInt32 and under-reports VRAM (caps around 4 GiB), so exact VRAM is unknown.');
}
const gpuDevices = nvidia.present
  ? nvidia.devices
  : wmiGpus.map((g) => ({
    name: g.Name ?? UNKNOWN,
    vramTotalMiB: UNKNOWN,
    vramFreeMiB: UNKNOWN,
    driverVersion: g.DriverVersion ?? UNKNOWN,
    source: 'wmi-fallback',
    wmiAdapterRamBytes: g.AdapterRAM ?? UNKNOWN,
  }));

const python = await pythonProbe();
const [torch, nvcc] = await Promise.all([torchProbe(python), nvccProbe()]);

const hfHome = process.env.HF_HOME ?? join(HOME, '.cache', 'huggingface');
if (process.env.HF_HOME) notes.push('HF_HOME set; huggingface cache measured at HF_HOME.');
const modelCaches = [
  { name: 'huggingface', path: hfHome },
  { name: 'torch', path: join(HOME, '.cache', 'torch') },
  { name: 'ollama', path: join(HOME, '.ollama', 'models') },
].map((c) => {
  const size = dirSize(c.path);
  return {
    name: c.name,
    path: c.path,
    exists: size.exists,
    bytes: size.bytes,
    human: humanBytes(size.bytes),
    files: size.files,
    timedOut: size.timedOut,
    unreadable: size.unreadable,
  };
});

const report = {
  schema: 't0.1-system-profile-v1',
  capturedAt: new Date().toISOString(),
  agent: 'opencode (Executor)',
  host: {
    platform: process.platform,
    osRelease: release(),
    osVersion: osKernelVersion(),
    arch: process.arch,
    nodeVersion: process.version,
    repoRoot: REPO_ROOT,
  },
  windows: {
    caption: wmiOs?.Caption ?? OS_FALLBACK.caption,
    version: wmiOs?.Version ?? OS_FALLBACK.release,
    build: wmiOs?.BuildNumber ?? UNKNOWN,
    architecture: wmiOs?.OSArchitecture ?? OS_FALLBACK.arch,
  },
  cpu: {
    model: wmiCpu?.Name ?? osCpus[0]?.model ?? UNKNOWN,
    physicalCores: wmiCpu?.NumberOfCores ?? UNKNOWN,
    logicalProcessors: wmiCpu?.NumberOfLogicalProcessors ?? osCpus.length ?? UNKNOWN,
    maxClockMHz: wmiCpu?.MaxClockSpeed ?? UNKNOWN,
    osReportedSpeedMHz: osCpus[0]?.speed ?? UNKNOWN,
  },
  ram: {
    totalBytes: totalmem(),
    totalGiB: gib(totalmem()),
    freeBytes: freemem(),
    freeGiB: gib(freemem()),
  },
  disks,
  locations,
  gpu: {
    probedVia: nvidia.present ? 'nvidia-smi' : wmiGpus.length > 0 ? 'wmi-fallback' : UNKNOWN,
    devices: gpuDevices,
  },
  cuda: {
    driverReportedVersion: nvidia.present ? nvidia.cudaVersion : UNKNOWN,
    nvidiaSmiPresent: nvidia.present,
    toolkit: nvcc,
    pythonTorch: torch,
  },
  python: {
    command: python.command,
    version: python.version,
    raw: python.raw,
  },
  modelCaches,
  notes,
};

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.info(JSON.stringify(report, null, 2));
console.info(`Saved: ${OUT_FILE}`);
