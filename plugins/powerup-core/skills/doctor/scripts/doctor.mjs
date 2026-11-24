#!/usr/bin/env node
// Power-Up Kit — doctor
//
// Checks this computer and project for what the kit needs, and prints JSON with
// a fix for every problem. Read-only: it changes nothing.
//
// Usage: node doctor.mjs [--project <dir>]

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const KIT_VERSION = '0.2.1';
const ONE_COMMAND_INSTALL_MIN = [2, 1, 292];

const argv = process.argv.slice(2);
const projectIdx = argv.indexOf('--project');
const projectDir = resolve(projectIdx !== -1 && argv[projectIdx + 1] ? argv[projectIdx + 1] : process.env.CLAUDE_PROJECT_DIR || process.cwd());

const checks = [];
const add = (id, label, status, detail, fix) => checks.push({ id, label, status, detail, ...(fix ? { fix } : {}) });

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15000, shell: process.platform === 'win32' });
  if (r.error || r.status !== 0) return null;
  return (r.stdout || r.stderr || '').trim();
}

function parseVersion(text) {
  const m = (text || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? m.slice(1, 4).map(Number) : null;
}

function atLeast(v, min) {
  for (let i = 0; i < 3; i++) {
    if (v[i] > min[i]) return true;
    if (v[i] < min[i]) return false;
  }
  return true;
}

// 1. Node.js (always present if this script runs)
const nodeMajor = Number(process.versions.node.split('.')[0]);
add('node', 'Node.js 18+', nodeMajor >= 18 ? 'pass' : 'fail', `Node ${process.versions.node}`,
  nodeMajor >= 18 ? undefined : 'Install the current LTS version from https://nodejs.org');

// 2. npx (Playwright MCP and other local connectors use it)
const npx = run('npx', ['--version']);
add('npx', 'npx', npx ? 'pass' : 'warn', npx ? `npx ${npx}` : 'npx not found',
  npx ? undefined : 'npx comes with Node.js — reinstall Node from https://nodejs.org');

// 3. git (optional, for sharing .powerup memory with a team)
const git = run('git', ['--version']);
add('git', 'git (optional)', git ? 'pass' : 'info', git || 'git not found',
  git ? undefined : 'Only needed to share client memory with your team through a repository.');

// 4. Claude Code CLI (optional on PATH — the desktop app bundles its own)
const claudeOut = run('claude', ['--version']);
const claudeV = parseVersion(claudeOut);
if (!claudeV) {
  add('claude-cli', 'Claude Code in terminal', 'info', '`claude` is not on PATH (fine when you use the desktop app)',
    'For one-command installs from a terminal: https://code.claude.com/docs/en/setup');
} else {
  const ok = atLeast(claudeV, ONE_COMMAND_INSTALL_MIN);
  add('claude-cli', 'Claude Code version', ok ? 'pass' : 'warn', `Claude Code ${claudeV.join('.')}`,
    ok ? undefined : 'Run `claude update`. Version 2.1.292+ supports the one-command install.');
}

// 5. Internet access
async function internet() {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const r = await fetch('https://www.gstatic.com/generate_204', { signal: controller.signal });
    clearTimeout(t);
    return r.status === 204 || r.ok;
  } catch {
    return false;
  }
}
const online = await internet();
add('internet', 'Internet access', online ? 'pass' : 'warn', online ? 'Online' : 'Could not reach the internet from this machine',
  online ? undefined : 'Website checks and audits need internet access. Check VPN, proxy or firewall.');

// 6. PageSpeed key (never print the value)
add('pagespeed-key', 'PageSpeed API key (optional)', process.env.PAGESPEED_API_KEY ? 'pass' : 'info',
  process.env.PAGESPEED_API_KEY ? 'PAGESPEED_API_KEY is set' : 'Not set — speed tests may hit Google\'s small keyless limit',
  process.env.PAGESPEED_API_KEY ? undefined : 'Free key: https://developers.google.com/speed/docs/insights/v5/get-started — then set PAGESPEED_API_KEY');

// 7. Project memory (.powerup)
const memoryDir = join(projectDir, '.powerup');
const clientsDir = join(memoryDir, 'clients');
let clients = [];
if (existsSync(clientsDir)) {
  clients = readdirSync(clientsDir).filter((d) => {
    try { return statSync(join(clientsDir, d)).isDirectory(); } catch { return false; }
  });
}
if (!existsSync(memoryDir)) {
  add('memory', 'Client memory (.powerup/)', 'info', `No .powerup/ folder in ${projectDir}`, 'Say "set up a new client" (client-new skill) to start.');
} else {
  add('memory', 'Client memory (.powerup/)', 'pass', `${clients.length} client(s): ${clients.join(', ') || 'none yet'}`);
  const activeFile = join(memoryDir, 'active-client');
  if (existsSync(activeFile)) {
    const active = readFileSync(activeFile, 'utf8').trim();
    const valid = active && clients.includes(active);
    add('active-client', 'Active client', valid ? 'pass' : 'warn', active ? `active-client = ${active}` : 'active-client is empty',
      valid ? undefined : 'Say "switch client" (client-switch skill) to pick a valid client.');
    if (valid) {
      const missing = ['profile.md', 'brand.md', 'voice.md', 'seo.md', 'decisions.md'].filter((f) => !existsSync(join(clientsDir, active, f)));
      if (missing.length) add('client-files', 'Client files complete', 'warn', `Missing: ${missing.join(', ')}`, 'Run client-new again for this client to fill the gaps.');
    }
  }
  add('agency', 'Agency profile', existsSync(join(memoryDir, 'agency.md')) ? 'pass' : 'info',
    existsSync(join(memoryDir, 'agency.md')) ? '.powerup/agency.md found' : 'No agency profile yet',
    existsSync(join(memoryDir, 'agency.md')) ? undefined : 'Say "set up my agency profile" so proposals use your name, logo and prices.');

  // Secret scan: memory must never hold credentials.
  const SECRET_PATTERNS = [
    [/\bsk-[A-Za-z0-9_-]{20,}/, 'API key (sk-…)'],
    [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
    [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub token'],
    [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, 'Slack token'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
    [/\b(password|passwd|pwd)\s*[:=]\s*\S{4,}/i, 'password'],
  ];
  const luhn = (digits) => {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let d = Number(digits[digits.length - 1 - i]);
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    return sum % 10 === 0;
  };
  const hasCardNumber = (text) => [...text.matchAll(/\b\d(?:[ -]?\d){12,18}\b/g)]
    .some((m) => luhn(m[0].replace(/\D/g, '')));
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p);
      else if (st.size < 1_000_000 && /\.(md|txt|json|ya?ml|csv)$/i.test(name)) {
        const text = readFileSync(p, 'utf8');
        const rel = p.slice(projectDir.length + 1);
        for (const [re, label] of SECRET_PATTERNS) if (re.test(text)) hits.push(`${rel}: ${label}`);
        if (hasCardNumber(text)) hits.push(`${rel}: possible card number`);
      }
    }
  };
  try { walk(memoryDir); } catch { /* ignore */ }
  add('memory-secrets', 'No secrets in memory', hits.length ? 'fail' : 'pass', hits.length ? `${hits.length} possible secret(s) found` : 'None found',
    hits.length ? `Remove them and write only where the secret is kept. Found: ${hits.slice(0, 5).join('; ')}` : undefined);
}

const summary = {
  pass: checks.filter((c) => c.status === 'pass').length,
  warn: checks.filter((c) => c.status === 'warn').length,
  fail: checks.filter((c) => c.status === 'fail').length,
  info: checks.filter((c) => c.status === 'info').length,
};
process.stdout.write(`${JSON.stringify({
  tool: 'power-up-kit/doctor',
  version: KIT_VERSION,
  checkedAt: new Date().toISOString(),
  platform: `${process.platform} ${process.arch}`,
  projectDir,
  summary,
  checks,
})}\n`);
