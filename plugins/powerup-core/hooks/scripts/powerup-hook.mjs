#!/usr/bin/env node
// Power-Up Kit — Claude Code hooks (Claude Code only; the Claude app ignores hooks).
//
//   session-start  Tells Claude which client is active and where its memory is.
//   pre-tool       Blocks reading or editing secret files (.env, private keys…).
//   post-tool      Notes when web files change, and when the result was checked.
//   stop           Once per batch of web edits: asks Claude to show proof before saying "done".
//
// Switches (environment variables):
//   POWERUP_ALLOW_SECRETS=1   turn off secret-file protection
//   POWERUP_PROOF_GATE=off    turn off the proof gate
//
// Hooks must be fast and must never break a session: any unexpected error exits 0.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const event = process.argv[2];

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// session-start: load client memory pointers (kept tiny to save context)
// ---------------------------------------------------------------------------
function sessionStart(input) {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const memoryDir = join(projectDir, '.powerup');
  if (!existsSync(memoryDir)) return;
  const lines = [];
  const activeFile = join(memoryDir, 'active-client');
  if (existsSync(activeFile)) {
    const active = readFileSync(activeFile, 'utf8').trim();
    const dir = join(memoryDir, 'clients', active);
    if (active && /^[a-z0-9][a-z0-9._-]*$/i.test(active) && existsSync(dir)) {
      let summary = '';
      const profile = join(dir, 'profile.md');
      if (existsSync(profile)) {
        const m = readFileSync(profile, 'utf8').match(/\*\*Summary:\*\*\s*(.+)/);
        if (m) summary = m[1].trim().slice(0, 240);
      }
      lines.push(`Power-Up Kit: the active client is "${active}"${summary ? ` — ${summary}` : ''}.`);
      lines.push(`Before brand, design, copy, SEO, proposal or report work for this client, read .powerup/clients/${active}/ (profile.md, brand.md, voice.md, seo.md, decisions.md). When the user states a decision or preference about the client, save it with the client-note skill.`);
    } else if (active) {
      lines.push(`Power-Up Kit: .powerup/active-client names "${active}", but that client folder doesn't exist. Offer the client-switch skill.`);
    }
  }
  if (existsSync(join(memoryDir, 'agency.md'))) {
    lines.push('Agency details (name, services, prices, terms) are in .powerup/agency.md — use them for proposals and reports.');
  }
  if (lines.length) process.stdout.write(`${lines.join('\n')}\n`);
}

// ---------------------------------------------------------------------------
// pre-tool: protect secret files
// ---------------------------------------------------------------------------
const SAFE_SUFFIX = /\.(example|sample|template|dist|defaults?)$/i;

export function isSecretPath(p) {
  if (!p || typeof p !== 'string') return false;
  const norm = p.replace(/\\/g, '/');
  const name = basename(norm).toLowerCase();
  if (SAFE_SUFFIX.test(name)) return false;
  if (name === '.env' || /^\.env\.[a-z0-9_.-]+$/.test(name) || /\.env$/.test(name)) return true;
  if (/^(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\.pub)?$/.test(name)) return !name.endsWith('.pub');
  if (/\.(pem|key|p12|pfx|keystore|jks)$/.test(name)) return true;
  if (/^(credentials|secrets?)(\.[a-z]+)?$/.test(name)) return true;
  if (/(^|\/)\.aws\/credentials$/.test(norm) || /(^|\/)\.ssh\//.test(norm)) return !name.endsWith('.pub') && name !== 'known_hosts' && name !== 'config';
  if (/^service[-_]?account.*\.json$/.test(name) || /^client_secrets?.*\.json$/.test(name)) return true;
  if (name === '.netrc') return true;
  return false;
}

const READ_VERBS = /(^|[\s;&|(])(cat|less|more|head|tail|bat|grep|rg|ag|awk|sed|strings|xxd|od|base64|nl|tac|type|get-content|gc|source|\.)\s/i;

export function bashTouchesSecret(command) {
  if (!command) return null;
  const tokens = command.split(/[\s;&|<>()'"`]+/).filter(Boolean);
  const secret = tokens.find((t) => isSecretPath(t));
  if (!secret) return null;
  // Copying a template into place (cp .env.example .env) or deleting is allowed; reading/printing is not.
  if (READ_VERBS.test(command) || /\becho\b.*>>?\s*\S*\.env/.test(command)) return secret;
  return null;
}

function preTool(input) {
  if (process.env.POWERUP_ALLOW_SECRETS === '1') return 0;
  const tool = input.tool_name || '';
  const ti = input.tool_input || {};
  let hit = null;
  if (['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    hit = isSecretPath(ti.file_path || ti.notebook_path) ? (ti.file_path || ti.notebook_path) : null;
  } else if (tool === 'Grep') {
    hit = isSecretPath(ti.path) ? ti.path : null;
  } else if (tool === 'Bash') {
    hit = bashTouchesSecret(ti.command);
  }
  if (!hit) return 0;
  process.stderr.write(
    `Power-Up Kit blocked access to a secrets file (${hit}). Secrets must not enter the chat. ` +
    'Ask the user to edit this file themselves, or work from the .example version. ' +
    'The user can turn this protection off by setting POWERUP_ALLOW_SECRETS=1.\n',
  );
  return 2;
}

// ---------------------------------------------------------------------------
// post-tool + stop: the proof gate
// ---------------------------------------------------------------------------
const WEB_FILE = /\.(html?|css|scss|sass|less|jsx|tsx|vue|svelte|astro|liquid|twig|hbs|handlebars|njk|ejs|erb|php|mdx)$/i;
const CHECK_COMMAND = /(page-check|pagespeed|seo-crawl)\.mjs|playwright\s+test|lighthouse|pa11y|axe\s/i;
const CHECK_SKILL = /(^|:)(proof-check|seo-audit)$/;
const LOOK_TOOL = /screenshot|snapshot|read_page|get_page_text/i;

function stateFile(sessionId) {
  const base = process.env.CLAUDE_PLUGIN_DATA || join(tmpdir(), 'power-up-kit');
  const dir = join(base, 'proof');
  mkdirSync(dir, { recursive: true });
  const safe = String(sessionId || 'unknown').replace(/[^a-z0-9_-]/gi, '_');
  return join(dir, `${safe}.json`);
}

function postTool(input) {
  const tool = input.tool_name || '';
  const ti = input.tool_input || {};
  const file = stateFile(input.session_id);
  const isEdit = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool);
  if (isEdit) {
    const p = ti.file_path || ti.notebook_path || '';
    if (!WEB_FILE.test(p)) return;
    let state = { files: [] };
    if (existsSync(file)) {
      try { state = JSON.parse(readFileSync(file, 'utf8')); } catch { /* start fresh */ }
    }
    if (!state.files.includes(p)) state.files.push(p);
    state.updatedAt = new Date().toISOString();
    writeFileSync(file, JSON.stringify(state));
    return;
  }
  const batchLooked = Array.isArray(ti.actions) && ti.actions.some((a) =>
    LOOK_TOOL.test(String(a?.name || '')) || a?.input?.action === 'screenshot');
  const checked =
    (tool === 'Bash' && CHECK_COMMAND.test(ti.command || '')) ||
    (tool === 'Skill' && CHECK_SKILL.test(String(ti.skill || ti.name || ''))) ||
    (tool.startsWith('mcp__') && (LOOK_TOOL.test(tool) || ti.action === 'screenshot' || batchLooked));
  if (checked && existsSync(file)) rmSync(file, { force: true });
}

function stop(input) {
  if ((process.env.POWERUP_PROOF_GATE || '').toLowerCase() === 'off') return 0;
  if (input.stop_hook_active) return 0;
  const file = stateFile(input.session_id);
  if (!existsSync(file)) return 0;
  let files = [];
  try { files = JSON.parse(readFileSync(file, 'utf8')).files || []; } catch { /* ignore */ }
  rmSync(file, { force: true }); // ask once per batch of edits, never loop
  if (!files.length) return 0;
  const list = files.slice(0, 5).map((f) => basename(f)).join(', ') + (files.length > 5 ? ` and ${files.length - 5} more` : '');
  process.stderr.write(
    `Power-Up Kit proof gate: web files changed in this session (${list}) but the result wasn't checked. ` +
    'Before saying it works, check it: use the proof-check skill, or open the page in a browser tool and take a screenshot. ' +
    'If it cannot be checked here (no URL, no server, no browser), tell the user that plainly instead of claiming it works. ' +
    '(The user can turn this off with POWERUP_PROOF_GATE=off.)\n',
  );
  return 2;
}

// ---------------------------------------------------------------------------

function main() {
  const input = readStdin();
  switch (event) {
    case 'session-start':
      sessionStart(input);
      return 0;
    case 'pre-tool':
      return preTool(input);
    case 'post-tool':
      postTool(input);
      return 0;
    case 'stop':
      return stop(input);
    default:
      return 0;
  }
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  let code = 0;
  try {
    code = main();
  } catch (err) {
    process.stderr.write(`power-up-kit hook (${event}) error: ${err.message}\n`);
    code = 0;
  }
  process.exit(code);
}
