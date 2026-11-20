#!/usr/bin/env node
// Power-Up Kit — Claude Code hooks (Claude Code only; the Claude app ignores hooks).
//
//   session-start  Tells Claude which client is active and where its memory is.
//   pre-tool       Guard rail against reading, printing or overwriting secret files.
//   post-tool      Notes when web files change (by edit tools or the shell), and when the result was checked.
//   stop           Once per batch of web edits: asks Claude to show proof before saying "done".
//
// The secret guard is BEST EFFORT: it blocks every shell command that mentions a secret
// file unless the command is a known-safe action, but a determined command can still build
// a file name it cannot see (e.g. from pieces). For a hard guarantee use Claude Code
// permission deny rules and the sandbox — see docs/hooks.md.
//
// Switches (environment variables):
//   POWERUP_ALLOW_SECRETS=1   turn off secret-file protection
//   POWERUP_PROOF_GATE=off    turn off the proof gate
//
// Hooks must be fast and must never break a session: any unexpected error exits 0.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

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
// Shell helpers (a light tokenizer — not a full shell parser)
// ---------------------------------------------------------------------------
const SEGMENT_SPLIT = /&&|\|\||[;|&\n]/;
const TOKEN_SPLIT = /[\s;&|<>()'"`=,:{}$]+/;

export function splitSegments(command) {
  return String(command || '').split(SEGMENT_SPLIT).map((s) => s.trim()).filter(Boolean);
}

function stripPrefixes(segment) {
  // Drop leading VAR=value assignments and wrappers like sudo/env/nohup/time/command.
  return segment.replace(/^\s*(?:(?:sudo|env|nohup|time|command|builtin|exec)\s+|[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*/, '');
}

/** Split into words the way a shell does: quotes group words, backslash escapes. */
export function shellWords(text) {
  const out = [];
  let cur = '';
  let quote = null;
  let started = false;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < s.length) cur += s[++i];
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; started = true; continue; }
    if (c === '\\' && i + 1 < s.length) { cur += s[++i]; started = true; continue; }
    if (/\s/.test(c)) {
      if (started) { out.push(cur); cur = ''; started = false; }
      continue;
    }
    cur += c;
    started = true;
  }
  if (started) out.push(cur);
  return out;
}

function commandWord(segment) {
  const first = shellWords(stripPrefixes(segment))[0] || '';
  return basename(first.split(/[<>]/)[0]).toLowerCase();
}

function argsOf(segment) {
  return shellWords(stripPrefixes(segment)).slice(1);
}

const SEARCH_COMMANDS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag']);

/** For grep/rg/ag only the searched files matter — the search pattern is just text. */
function searchHit(segment, cwd) {
  const args = argsOf(segment);
  const explicitPattern = args.some((a) => a === '-e' || a === '--regexp' || a.startsWith('--regexp=') || a === '-f' || a === '--file');
  let patternTaken = explicitPattern;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (['-g', '--glob', '--iglob'].includes(a)) {
      const g = args[++i] || '';
      if (isSecretPath(g) || globReachesSecret(g, cwd)) return g;
      continue;
    }
    if (/^--(glob|iglob)=/.test(a)) {
      const g = a.split('=')[1] || '';
      if (isSecretPath(g) || globReachesSecret(g, cwd)) return g;
      continue;
    }
    if (['-e', '--regexp', '-f', '--file', '-A', '-B', '-C', '-m', '--max-count', '-t', '--type', '-T', '--type-not'].includes(a)) {
      i++;
      continue;
    }
    if (a.startsWith('-')) continue;
    if (!patternTaken) {
      patternTaken = true;
      continue;
    }
    if (isSecretPath(a) || globReachesSecret(a, cwd)) return a;
  }
  return null;
}

// ---------------------------------------------------------------------------
// pre-tool: secret-file guard rail
// ---------------------------------------------------------------------------
const SAFE_SUFFIX = /\.(example|sample|template|dist|defaults?)$/i;
const SECRET_NAMES = new Set([
  '.env', '.envrc', '.dev.vars', '.npmrc', '.pypirc', '.pgpass', '.netrc', '.git-credentials',
  'wp-config.php', 'auth.json', '.htpasswd',
]);

export function isSecretPath(p) {
  if (!p || typeof p !== 'string') return false;
  const norm = p.replace(/\\/g, '/');
  const name = basename(norm).toLowerCase();
  if (!name || SAFE_SUFFIX.test(name)) return false;
  if (SECRET_NAMES.has(name)) return true;
  if (/^\.env\.[a-z0-9_.-]+$/.test(name) || /\.env$/.test(name)) return true; // .env.local, prod.env
  if (/^\.dev\.vars\.[a-z0-9_-]+$/.test(name)) return true; // Cloudflare: .dev.vars.staging
  if (/\.tfvars(\.json)?$/.test(name)) return true; // terraform.tfvars, prod.auto.tfvars
  if (/^(id_rsa|id_dsa|id_ecdsa|id_ed25519)$/.test(name)) return true;
  if (/\.(pem|key|p12|pfx|keystore|jks)$/.test(name)) return true;
  // credentials.json / secrets.yaml — but not docs like credentials.md, and a bare "secret" or
  // "credentials" only when it's clearly a path (config/secrets), never as an ordinary word.
  if (/^(credentials|secrets?)\.(json|ya?ml|toml|ini|txt|env|conf|cfg|xml|properties|csv)$/.test(name)) return true;
  if (/^(credentials|secrets?)$/.test(name) && norm.includes('/')) return true;
  if (/^service[-_]?account.*\.json$/.test(name) || /^client_secrets?.*\.json$/.test(name)) return true;
  if (/(^|\/)\.aws\/credentials$/.test(norm)) return true;
  if (/(^|\/)\.ssh\//.test(norm)) return !name.endsWith('.pub') && name !== 'known_hosts' && name !== 'config';
  return false;
}

// Common secret file names, used to judge globs that start with a dot (".e*", ".*").
const KNOWN_DOT_SECRETS = ['.env', '.env.local', '.env.production', '.env.development', '.envrc', '.dev.vars', '.npmrc', '.pypirc', '.pgpass', '.netrc', '.git-credentials', '.htpasswd'];

function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') re += '.*';
    else if (c === '?') re += '.';
    else if (c === '[') {
      const end = glob.indexOf(']', i + 1);
      if (end > i) {
        let cls = glob.slice(i + 1, end);
        if (cls.startsWith('!')) cls = `^${cls.slice(1)}`;
        re += `[${cls.replace(/\\/g, '\\\\')}]`;
        i = end;
      } else re += '\\[';
    } else re += c.replace(/[.+^${}()|\\/]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

/** Could this glob expand to a secret file? Checks well-known dot names and the real folder. */
export function globReachesSecret(token, cwd) {
  const norm = String(token).replace(/\\/g, '/');
  const slash = norm.lastIndexOf('/');
  const dir = slash === -1 ? '.' : norm.slice(0, slash) || '/';
  const pattern = norm.slice(slash + 1);
  if (!/[*?[]/.test(pattern)) return null;
  let re;
  try { re = globToRegex(pattern); } catch { return null; }
  const dotOk = pattern.startsWith('.');
  const matches = (name) => (dotOk || !name.startsWith('.')) && re.test(name) && isSecretPath(name);
  if (dotOk) {
    const known = KNOWN_DOT_SECRETS.find(matches);
    if (known) return known;
  }
  if (cwd && !/[*?[]/.test(dir)) {
    try {
      const hit = readdirSync(resolve(cwd, dir)).find(matches);
      if (hit) return hit;
    } catch { /* folder not readable */ }
  }
  return null;
}

/** Secret files a piece of shell text refers to (by name or by a glob). */
export function secretRefs(text, cwd) {
  // `--env-file .env` hands the file to a program (node, docker, bun, deno) without printing it.
  const cleaned = String(text || '').replace(/--env-file(?:-if-exists)?(?:=|\s+)\S+/g, ' ');
  const refs = [];
  for (const t of cleaned.split(TOKEN_SPLIT)) {
    if (!t) continue;
    if (isSecretPath(t)) refs.push(t);
    else if (/[*?[]/.test(t)) {
      const m = globReachesSecret(t, cwd);
      if (m) refs.push(`${t} → ${m}`);
    }
  }
  return refs;
}

// Commands that can mention a secret file without printing its contents.
const SAFE_COMMANDS = new Set(['ls', 'rm', 'unlink', 'touch', 'chmod', 'chown', 'mkdir', 'test', '[', '[[', 'stat', 'file', 'wc', 'du', 'echo', 'printf', 'realpath', 'dirname', 'basename']);
const COPY_COMMANDS = new Set(['cp', 'mv', 'ln', 'install', 'rsync', 'scp']);
// `git commit` is here so a message that mentions ".env" isn't blocked; `git add .env` stays blocked.
const SAFE_GIT = new Set(['check-ignore', 'ls-files', 'status', 'rm', 'mv', 'restore', 'commit']);

function segmentHit(segment, cwd) {
  const refs = secretRefs(segment, cwd);
  if (!refs.length) return null;
  // Writing into a secret file (> or >>) overwrites or edits it — same rule as the Write tool.
  for (const m of segment.matchAll(/(?:\d|&)?>>?\s*["']?([^\s"'<>|;&]+)/g)) if (isSecretPath(m[1])) return m[1];
  // Reading from a secret file through < redirection.
  for (const m of segment.matchAll(/(^|[^<])<\s*["']?([^\s"'<>|;&(]+)/g)) if (isSecretPath(m[2])) return m[2];
  const word = commandWord(segment);
  if (SAFE_COMMANDS.has(word)) return null;
  if (SEARCH_COMMANDS.has(word)) return searchHit(segment, cwd);
  if (word === 'find') return /\s-(exec|execdir|ok|okdir)\b/.test(segment) ? refs[0] : null;
  if (word === 'git') {
    const sub = argsOf(segment).find((a) => !a.startsWith('-'));
    return SAFE_GIT.has(sub) ? null : refs[0];
  }
  if (COPY_COMMANDS.has(word)) {
    const args = argsOf(segment).filter((a) => !a.startsWith('-'));
    if (args.length < 2) return refs[0];
    const dest = args[args.length - 1];
    const leaksOut = args.slice(0, -1).some((s) => isSecretPath(s) || globReachesSecret(s, cwd));
    // Copying a secret to a non-secret place (or another machine) exposes it; templates into place are fine.
    return leaksOut && !isSecretPath(dest) ? refs[0] : null;
  }
  return refs[0];
}

/** Returns the secret a shell command would expose or overwrite, or null. Best effort. */
export function bashTouchesSecret(command, cwd) {
  if (!command) return null;
  const all = secretRefs(command, cwd);
  if (!all.length) return null;
  // Command or process substitution, or piping names into xargs, can read a file "invisibly".
  if (/\$\(|`|<\(|\bxargs\b/.test(command)) return all[0];
  for (const seg of splitSegments(command)) {
    const hit = segmentHit(seg, cwd);
    if (hit) return hit;
  }
  return null;
}

function preTool(input) {
  if (process.env.POWERUP_ALLOW_SECRETS === '1') return 0;
  const tool = input.tool_name || '';
  const ti = input.tool_input || {};
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let hit = null;
  if (['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const p = ti.file_path || ti.notebook_path;
    hit = isSecretPath(p) ? p : null;
  } else if (tool === 'Grep') {
    if (isSecretPath(ti.path)) hit = ti.path;
    else if (ti.glob && (isSecretPath(ti.glob) || globReachesSecret(ti.glob, ti.path ? resolve(cwd, ti.path) : cwd))) hit = ti.glob;
  } else if (tool === 'Bash') {
    hit = bashTouchesSecret(ti.command, cwd);
  }
  if (!hit) return 0;
  process.stderr.write(
    `Power-Up Kit blocked a command that would read, print or overwrite a secrets file (${hit}). Secrets must not enter the chat. ` +
    'Ask the user to look at or edit this file themselves, or work from the .example version. ' +
    'The user can turn this protection off by setting POWERUP_ALLOW_SECRETS=1.\n',
  );
  return 2;
}

// ---------------------------------------------------------------------------
// post-tool + stop: the proof gate
// ---------------------------------------------------------------------------
const WEB_EXT = 'html?|css|scss|sass|less|jsx|tsx|vue|svelte|astro|liquid|twig|hbs|handlebars|njk|ejs|erb|php|mdx';
const WEB_FILE = new RegExp(`\\.(${WEB_EXT})$`, 'i');
const CHECK_SKILL = /(^|:)(proof-check|seo-audit)$/;
const LOOK_TOOL = /screenshot|snapshot|read_page|get_page_text/i;
const SHELL_EDITS = /\bsed\b[^|;&]*\s(?:-[a-zA-Z]*i|--in-place)|\bperl\s+-[a-zA-Z]*i|\btee\b|\b(?:cp|mv|install|rsync|patch|truncate)\b|\b(?:prettier|eslint|stylelint)\b[^|;&]*--(?:write|fix)/;

/** Web files a shell command changes: redirections into them, or edit commands that name them. */
export function bashWebEdits(command) {
  const files = new Set();
  const cmd = String(command || '');
  for (const m of cmd.matchAll(/(?:\d|&)?>>?\s*["']?([^\s"'<>|;&]+)/g)) if (WEB_FILE.test(m[1])) files.add(m[1]);
  if (SHELL_EDITS.test(cmd)) {
    for (const t of cmd.split(/[\s;&|<>()'"`]+/)) if (WEB_FILE.test(t)) files.add(t);
  }
  return [...files];
}

/** Is this shell command a real check of web output? (A word like "lighthouse" alone is not.) */
export function bashIsCheck(command) {
  const script = '(?:page-check|pagespeed|seo-crawl)\\.mjs';
  const runScript = new RegExp(`^node\\s+(?:"[^"]*${script}"|'[^']*${script}'|\\S*${script})\\s+\\S`);
  return splitSegments(command).some((seg) => {
    const s = stripPrefixes(seg);
    return runScript.test(s)
      || /^(?:npx\s+(?:-y\s+|--yes\s+)?)?(?:lighthouse|pa11y|@axe-core\/cli|axe)\s+["']?(?:https?:\/\/|localhost|127\.0\.0\.1|\.{0,2}\/)\S*/.test(s)
      || /^(?:npx\s+(?:-y\s+)?)?playwright\s+test\b/.test(s)
      || /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test:e2e|e2e|test:a11y)\b/.test(s);
  });
}

function stateFile(sessionId) {
  const base = process.env.CLAUDE_PLUGIN_DATA || join(tmpdir(), 'power-up-kit');
  const dir = join(base, 'proof');
  mkdirSync(dir, { recursive: true });
  const safe = String(sessionId || 'unknown').replace(/[^a-z0-9_-]/gi, '_');
  return join(dir, `${safe}.json`);
}

function arm(file, paths) {
  let state = { files: [] };
  if (existsSync(file)) {
    try { state = JSON.parse(readFileSync(file, 'utf8')); } catch { /* start fresh */ }
  }
  for (const p of paths) if (!state.files.includes(p)) state.files.push(p);
  state.updatedAt = new Date().toISOString();
  writeFileSync(file, JSON.stringify(state));
}

function postTool(input) {
  const tool = input.tool_name || '';
  const ti = input.tool_input || {};
  const file = stateFile(input.session_id);
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const p = ti.file_path || ti.notebook_path || '';
    if (WEB_FILE.test(p)) arm(file, [p]);
    return;
  }
  if (tool === 'Bash') {
    const edited = bashWebEdits(ti.command);
    // A command that both edits and checks (rare) counts as checked: the check ran after the edit.
    if (bashIsCheck(ti.command)) {
      if (existsSync(file)) rmSync(file, { force: true });
    } else if (edited.length) {
      arm(file, edited);
    }
    return;
  }
  const batchLooked = Array.isArray(ti.actions) && ti.actions.some((a) =>
    LOOK_TOOL.test(String(a?.name || '')) || a?.input?.action === 'screenshot');
  const checked =
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
