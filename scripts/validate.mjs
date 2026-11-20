#!/usr/bin/env node
// Validate the whole repository before a release. Run from anywhere:
//   node scripts/validate.mjs
//
// Checks the marketplace, every plugin and every skill against the rules that make
// them install in Claude Code AND upload to the Claude app, checks scripts compile,
// shared files are in sync, and no secrets are committed. If the `claude` CLI is
// available (or CLAUDE_BIN is set), it also runs `claude plugin validate --strict`.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
const rel = (p) => relative(root, p) || '.';

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/i;
// The Claude app (claude.ai uploads) rejects any other frontmatter key.
const ALLOWED_SKILL_KEYS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    err(rel(path), `invalid JSON — ${e.message}`);
    return null;
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['.git', 'node_modules', 'dist', 'results'].includes(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function frontmatter(text) {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return null;
  const end = text.indexOf('\n---', 4);
  if (end === -1) return null;
  const block = text.slice(4, end).split(/\r?\n/);
  const data = {};
  let lastKey = null;
  for (const line of block) {
    if (!line.trim()) continue;
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m && !line.startsWith(' ')) {
      lastKey = m[1];
      data[lastKey] = m[2].replace(/^["']|["']$/g, '');
    } else if (lastKey) {
      data[lastKey] = `${data[lastKey]}\n${line}`;
    }
  }
  return { data, body: text.slice(end + 4) };
}

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------
const marketPath = join(root, '.claude-plugin', 'marketplace.json');
const market = readJson(marketPath);
const pluginNames = new Set();
if (market) {
  if (!market.name || !NAME_RE.test(market.name)) err('marketplace.json', 'name must be lowercase letters, digits and dashes');
  if (!market.owner?.name) err('marketplace.json', 'owner.name is required');
  if (!Array.isArray(market.plugins) || !market.plugins.length) err('marketplace.json', 'plugins list is empty');
  for (const entry of market.plugins || []) {
    const where = `marketplace.json → ${entry.name}`;
    if (!entry.name || !NAME_RE.test(entry.name)) err(where, 'invalid plugin name');
    if (pluginNames.has(entry.name)) err(where, 'duplicate plugin name');
    pluginNames.add(entry.name);
    if (typeof entry.source !== 'string' || !entry.source.startsWith('./')) {
      err(where, 'source must be a relative path starting with ./');
      continue;
    }
    const dir = join(root, entry.source);
    if (!existsSync(dir)) err(where, `source folder ${entry.source} does not exist`);
    if (entry.version) warn(where, 'version is set in the marketplace entry — keep it only in plugin.json');
  }
}

// ---------------------------------------------------------------------------
// Plugins and skills
// ---------------------------------------------------------------------------
const pluginsDir = join(root, 'plugins');
const skillNames = new Map();
for (const plugin of readdirSync(pluginsDir)) {
  const dir = join(pluginsDir, plugin);
  if (!statSync(dir).isDirectory()) continue;
  const where = `plugins/${plugin}`;
  const manifestPath = join(dir, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifestPath)) {
    err(where, 'missing .claude-plugin/plugin.json');
    continue;
  }
  const manifest = readJson(manifestPath);
  if (!manifest) continue;
  if (manifest.name !== plugin) err(where, `plugin.json name "${manifest.name}" must match folder "${plugin}"`);
  if (!pluginNames.has(plugin)) err(where, 'not listed in marketplace.json');
  if (!SEMVER_RE.test(manifest.version || '')) err(where, 'plugin.json version must be semver (e.g. 0.1.0)');
  if (!manifest.description) err(where, 'plugin.json needs a description');
  for (const dep of manifest.dependencies || []) {
    const depName = typeof dep === 'string' ? dep.split('@')[0] : dep.name;
    if (!pluginNames.has(depName)) err(where, `dependency "${depName}" is not in this marketplace`);
  }
  if (existsSync(join(dir, 'bin'))) err(where, 'top-level bin/ folder stops the plugin installing in the Claude app — move scripts into skills');
  if (existsSync(join(dir, 'CLAUDE.md'))) err(where, 'CLAUDE.md at the plugin root is never loaded — write it as a skill');
  if (!existsSync(join(dir, 'README.md'))) err(where, 'README.md missing');
  if (!existsSync(join(dir, '.claude-plugin', 'icon.png'))) warn(where, 'no .claude-plugin/icon.png');

  const hooksPath = join(dir, 'hooks', 'hooks.json');
  if (existsSync(hooksPath)) {
    const hooks = readJson(hooksPath);
    const text = JSON.stringify(hooks || {});
    for (const m of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)/g)) {
      if (!existsSync(join(dir, m[1]))) err(`${where}/hooks/hooks.json`, `references missing file ${m[1]}`);
    }
  }

  const skillsDir = join(dir, 'skills');
  if (!existsSync(skillsDir)) continue;
  for (const skill of readdirSync(skillsDir)) {
    const sdir = join(skillsDir, skill);
    if (!statSync(sdir).isDirectory()) continue;
    const swhere = `${where}/skills/${skill}`;
    const file = join(sdir, 'SKILL.md');
    if (!existsSync(file)) {
      err(swhere, 'missing SKILL.md');
      continue;
    }
    const text = readFileSync(file, 'utf8');
    const fm = frontmatter(text);
    if (!fm) {
      err(swhere, 'SKILL.md must start with --- frontmatter');
      continue;
    }
    for (const key of Object.keys(fm.data)) {
      if (!ALLOWED_SKILL_KEYS.has(key)) err(swhere, `frontmatter key "${key}" is not allowed by the Claude app upload (allowed: ${[...ALLOWED_SKILL_KEYS].join(', ')})`);
    }
    const { name, description = '', compatibility = '' } = fm.data;
    if (name !== skill) err(swhere, `frontmatter name "${name}" must equal the folder name`);
    if (!NAME_RE.test(name || '') || (name || '').length > 64) err(swhere, 'name must be lowercase-with-dashes, max 64 characters');
    if (skillNames.has(name)) err(swhere, `skill name "${name}" is also used in ${skillNames.get(name)} — ZIP uploads would clash`);
    skillNames.set(name, swhere);
    if (!description) err(swhere, 'description is required');
    if (description.length > 1024) err(swhere, `description is ${description.length} characters (max 1024)`);
    if (/[<>]/.test(description)) err(swhere, 'description must not contain < or >');
    if (compatibility.length > 500) err(swhere, 'compatibility is over 500 characters');
    const lines = text.split('\n').length;
    if (lines > 500) warn(swhere, `SKILL.md is ${lines} lines — move detail into reference files`);
    for (const m of fm.body.matchAll(/\]\(((?!https?:|#)[^)\s]+)\)/g)) {
      if (!existsSync(join(sdir, m[1]))) err(swhere, `links to missing file ${m[1]}`);
    }
    for (const m of fm.body.matchAll(/\$\{CLAUDE_SKILL_DIR\}\/([\w./-]+)/g)) {
      if (!existsSync(join(sdir, m[1]))) err(swhere, `refers to missing file ${m[1]}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Scripts, shared files, JSON, secrets
// ---------------------------------------------------------------------------
const files = walk(root);
for (const f of files.filter((p) => p.endsWith('.mjs'))) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) err(rel(f), `syntax error\n${r.stderr}`);
}
for (const f of files.filter((p) => p.endsWith('.json'))) readJson(f);

const sync = spawnSync(process.execPath, [join(root, 'scripts', 'sync-shared.mjs'), '--check'], { encoding: 'utf8' });
if (sync.status !== 0) err('shared/', `copies out of date — run node scripts/sync-shared.mjs\n${sync.stderr}`);

const SECRET_RES = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, 'Anthropic API key'],
  [/\bsk-[A-Za-z0-9]{32,}\b/, 'API key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS key'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'GitHub token'],
  [/\bxox[abposr]-\d+-[A-Za-z0-9-]+/, 'Slack token'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
  [/AIza[0-9A-Za-z_-]{35}/, 'Google API key'],
];
for (const f of files) {
  if (/\.(png|jpe?g|gif|webp|zip|ico)$/i.test(f) || f.includes(`${join('tests', 'fixtures')}`)) continue;
  if (f === fileURLToPath(import.meta.url)) continue;
  const text = readFileSync(f, 'utf8');
  for (const [re, label] of SECRET_RES) if (re.test(text)) err(rel(f), `looks like it contains a ${label}`);
}

// ---------------------------------------------------------------------------
// Official validator (optional)
// ---------------------------------------------------------------------------
const claudeBin = process.env.CLAUDE_BIN || 'claude';
const probe = spawnSync(claudeBin, ['--version'], { encoding: 'utf8' });
if (probe.status === 0) {
  const targets = ['.', ...readdirSync(pluginsDir).map((p) => `plugins/${p}`)];
  for (const t of targets) {
    const r = spawnSync(claudeBin, ['plugin', 'validate', t, '--strict'], { cwd: root, encoding: 'utf8' });
    if (r.status !== 0) err(`claude plugin validate ${t}`, (r.stdout + r.stderr).trim().split('\n').slice(-15).join('\n'));
    else console.log(`✔ claude plugin validate ${t} --strict`);
  }
} else {
  warn('claude CLI', 'not found — skipped `claude plugin validate` (set CLAUDE_BIN to its path to include it)');
}

// ---------------------------------------------------------------------------
for (const w of warnings) console.log(`⚠ ${w}`);
for (const e of errors) console.error(`✘ ${e}`);
console.log(`\n${errors.length} error(s), ${warnings.length} warning(s) — ${skillNames.size} skills in ${pluginNames.size} plugins`);
process.exit(errors.length ? 1 : 0);
