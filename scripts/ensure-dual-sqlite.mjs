// Postinstall helper: stage better-sqlite3 native binaries per runtime ABI.
//
// Problem: `bindings` (used by better-sqlite3 v12) resolves build/Release
// first, but Node (vitest) and Electron (app) need DIFFERENT ABIs. A single
// build/Release binary can only serve one of them, so `npm test` and
// `npm run dev` cannot both pass. Fix: keep one binary per ABI under
// lib/binding/node-v<ABI>-<platform>-<arch>/ (paths `bindings` probes after
// build/*) and leave build/{Release,Debug} empty of .node files so each
// runtime falls through to its own ABI directory.
//
// Run from repo root via the `postinstall` script (after
// `electron-builder install-app-deps`). Uses only node builtins plus
// binaries already in node_modules (.bin or package-local).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BS = join(ROOT, 'node_modules', 'better-sqlite3');
const IS_WIN = process.platform === 'win32';

function fail(msg) {
  console.error(`ensure-dual-sqlite: FATAL: ${msg}`);
  process.exit(1);
}

const TOOL_JS = {
  'prebuild-install': ['prebuild-install/bin.js', 'prebuild-install/prebuild-install.js'],
  'node-gyp': ['node-gyp/bin/node-gyp.js'],
};

function toolJs(name) {
  for (const rel of TOOL_JS[name] ?? []) {
    for (const base of [join(ROOT, 'node_modules'), join(BS, 'node_modules')]) {
      const p = join(base, rel);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: false });
  if (r.status !== 0) {
    fail(`${cmd} ${args.join(' ')} exited ${r.status}\n${r.stderr || r.stdout || r.error?.message || ''}`);
  }
  return (r.stdout || '').trim();
}

async function electronVersion() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const v = pkg?.devDependencies?.electron;
  if (!v) fail('devDependencies.electron missing in package.json');
  return v;
}

async function electronAbi() {
  try {
    const mod = await import('node-abi');
    const fn = mod.getAbi ?? mod.default?.getAbi;
    if (fn) return String(fn(await electronVersion(), 'electron'));
  } catch { /* ignore */ }
  const exe = join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
  const binPath = IS_WIN ? exe : join(ROOT, 'node_modules', '.bin', 'electron');
  const out = run(binPath, ['--abi'], ROOT);
  if (!/^\d+$/.test(out)) fail(`could not determine Electron ABI (got ${JSON.stringify(out)})`);
  return out;
}

function bindingTarget(modules) {
  return join(BS, 'lib', 'binding', `node-v${modules}-${process.platform}-${process.arch}`);
}

function buildReleaseNode() {
  const dir = join(BS, 'build', 'Release');
  if (!existsSync(dir)) return null;
  const hits = readdirSync(dir).filter((f) => f.endsWith('.node'));
  return hits.length > 0 ? join(dir, hits[0]) : null;
}

function prebuildInstall(args) {
  const js = toolJs('prebuild-install');
  if (js) {
    run(process.execPath, [js, ...args], BS);
    return;
  }
  run('npx', ['--yes', 'prebuild-install', ...args], BS);
}

function nodeGyp(args) {
  const js = toolJs('node-gyp');
  if (js) {
    run(process.execPath, [js, ...args], BS);
    return;
  }
  run(process.execPath, [join(ROOT, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js'), ...args], BS);
}

function ensureElectronBinary(ev, abi) {
  prebuildInstall(['--runtime', 'electron', '--target', ev, '--arch', process.arch]);
  let built = buildReleaseNode();
  if (!built) {
    console.log('ensure-dual-sqlite: electron prebuilt unavailable, compiling from source');
    nodeGyp(['rebuild', '--runtime=electron', `--target=${ev}`, '--dist-url=https://electronjs.org/headers', `--arch=${process.arch}`]);
    built = buildReleaseNode();
  }
  if (!built) fail('no Electron-ABI better-sqlite3 binary after download + source build');
  const dest = bindingTarget(abi);
  mkdirSync(dest, { recursive: true });
  renameSync(built, join(dest, 'better_sqlite3.node'));
  console.log(`ensure-dual-sqlite: staged Electron ABI ${abi} binary`);
}

function ensureNodeBinary() {
  const abi = process.versions.modules;
  try {
    prebuildInstall(['--arch', process.arch]);
  } catch {
    console.log('ensure-dual-sqlite: node prebuilt unavailable, compiling from source');
    nodeGyp(['rebuild', '--release', `--arch=${process.arch}`]);
  }
  const built = buildReleaseNode();
  if (!built) fail('no Node-ABI better-sqlite3 binary after download + source build');
  const dest = bindingTarget(abi);
  mkdirSync(dest, { recursive: true });
  renameSync(built, join(dest, 'better_sqlite3.node'));
  console.log(`ensure-dual-sqlite: staged Node ABI ${abi} binary`);
}

function clearBuildDirs() {
  for (const d of ['Release', 'Debug']) {
    const dir = join(BS, 'build', d);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.node')) rmSync(join(dir, f));
    }
  }
}

// A stale single-ABI binary in build/ would shadow the per-ABI layout.
clearBuildDirs();
const ev = await electronVersion();
ensureElectronBinary(ev, await electronAbi());
ensureNodeBinary();
clearBuildDirs();
console.log('ensure-dual-sqlite: dual-ABI layout ready');
