// T1.1 — Audit current paths and produce removal inventory
// Spec: docs/09 §§9.1–9.2, 9.9
// Do: scan current source for real account/journal, wallet import,
// trading/signing, remote AI, renderer networking, and all old paper|real references;
// report exact path/line and classify keep/remove/archive.
// Accept: report flags all real-money journal and wallet-import workflows;
// test fails if transaction-signing or send-order identifiers are introduced;
// no source files changed in this task.

import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';

import { createInterface } from 'node:readline';

const REPO_ROOT = 'Z:\\moham\\Desktop\\github\\apps\\TickLabMain';

// Known real-trade / journal related files/paths to scan
const REAL_TRADE_KEYWORDS = [
  'wallet.import', 'wallet/import', 'real.journal', 'journal/service',
  'journal/exportCsv', 'journal/', 'FillForm', 'EquityTab', 'Decision',
  'Order', 'order.submit', 'send-order', 'transaction.sign', 'sign',
  'paper|real', 'real-money', 'live-trading', 'LIVE',
  'OpenRouter', 'openrouter', 'cloud AI', ' hosted AI',
  'wallet/solUsd', 'wallet/parseSwap', 'wallet/solUsd',
];

const RISK_AI_KEYWORDS = [
  'ai/', 'openrouter', 'openrouter/', 'runtime.ts', 'secrets.ts',
  'settings/store.ts', 'aiTab', 'AiSection',
];

const IPC_ALLOWLIST_KEYWORDS = [
  'ipc/handlers/', 'preload', 'contextBridge',
];

// Scan a file for keyword matches
function scanFile(filePath, keywords) {
  const results = [];
  if (!existsSync(filePath)) return results;
  
  const text = readFileSync(filePath, 'utf8');
  for (const kw of keywords) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(kw.toLowerCase())) {
        results.push({ line: i + 1, content: lines[i].trim(), keyword: kw });
      }
    }
  }
  return results;
}

// List .ts/.tsx/.js/.mjs files recursively (simple, no require)
function listSourceFiles(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        results.push(...listSourceFiles(`${dir}/${entry.name}`));
      } else if (entry.isFile()) {
        const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
        if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.mjs') {
          results.push(`${dir}/${entry.name}`);
        }
      }
    }
  } catch {
    // Dir may not exist or be readable
  }
  return results;
}

// Main scan
console.log('=== T1.1 Audit: Scanning for real-trade and real-money workflows ===\n');

const findings = {};

// Scan main source directories
const sourceDirs = [
  'src/main',
  'src/renderer',
  'src/shared',
];

for (const dir of sourceDirs) {
  const fullPath = `${REPO_ROOT}/${dir}`;
  const keyFiles = listSourceFiles(fullPath).slice(0, 100);
  
  for (const relFile of keyFiles) {
    const filePath = `${REPO_ROOT}/${relFile}`;
    const ks = scanFile(filePath, REAL_TRADE_KEYWORDS);
    if (ks.length > 0) {
      findings[filePath] = { realTrade: ks, riskAI: [], ipc: [] };
      // Also scan for risk AI
      findings[filePath].riskAI = scanFile(filePath, RISK_AI_KEYWORDS);
      // Also scan for IPC
      findings[filePath].ipc = scanFile(filePath, IPC_ALLOWLIST_KEYWORDS);
    }
  }
}

// Also check specific known files
const knownFiles = [
  'src/main/wallet/import.ts',
  'src/main/wallet/parseSwap.ts', 
  'src/main/wallet/solUsd.ts',
  'src/main/journal/service.ts',
  'src/main/journal/exportCsv.ts',
  'src/main/ai/openrouter.ts',
  'src/main/settings/secrets.ts',
  'src/main/app/runtime.ts',
];

for (const file of knownFiles) {
  const filePath = `${REPO_ROOT}/${file}`;
  // Only add if not already in findings
  if (!findings[filePath]) {
    findings[filePath] = { 
      realTrade: scanFile(filePath, REAL_TRADE_KEYWORDS), 
      riskAI: scanFile(filePath, RISK_AI_KEYWORDS), 
      ipc: scanFile(filePath, IPC_ALLOWLIST_KEYWORDS) 
    };
  }
}

// Write audit report
mkdirSync(`${REPO_ROOT}/scripts/research`, { recursive: true });

const report = {
  schema: 't1.1-audit-v1',
  generatedAt: new Date().toISOString(),
  scanDirectories: sourceDirs,
  knownFilesScanned: knownFiles,
  findings: findings,
  summary: {
    filesWithRealTrade: Object.keys(findings).filter(k => findings[k].realTrade.length > 0).length,
    filesWithRiskAI: Object.keys(findings).filter(k => findings[k].riskAI.length > 0).length,
    filesWithIPCRef: Object.keys(findings).filter(k => findings[k].ipc.length > 0).length,
  },
  classification: {
    keep: [],    // UI components, charts, legitimate IPC
    remove: [],  // real-trade workflows, wallet import, AI cloud calls
    archive: []  // legacy data preserved but read-only
  }
};

writeFileSync(`${REPO_ROOT}/data/p0/research-scope-report.json`, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`\nAudit complete.`);
console.log(`Files scanned: ${Object.keys(findings).length}`);
console.log(`Files with real-trade patterns: ${report.summary.filesWithRealTrade}`);
console.log(`Files with risk/AI patterns: ${report.summary.filesWithRiskAI}`);
console.log(`Files with IPC references: ${report.summary.filesWithIPCRef}`);
console.log(`\nReport written to: data/p0/research-scope-report.json`);
// Classification guidance (per spec, no source files changed in this task)
console.log(`\nPer docs/09 §9.1-9.2: real-journal becomes read-only Legacy Archive;`);
console.log(`      wallet-import removed; no new real-trade workflows permitted;`);
console.log(`      OpenRouter/hosted AI removed; only local sanitization helpers preserved.`);