import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSecretPath, bashTouchesSecret } from '../plugins/powerup-core/hooks/scripts/powerup-hook.mjs';

const HOOK = fileURLToPath(new URL('../plugins/powerup-core/hooks/scripts/powerup-hook.mjs', import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), 'powerup-hook-data-'));

function hook(event, input, env = {}) {
  const r = spawnSync(process.execPath, [HOOK, event], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_DATA: dataDir, CLAUDE_PROJECT_DIR: '', POWERUP_ALLOW_SECRETS: '', POWERUP_PROOF_GATE: '', ...env },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('isSecretPath', () => {
  for (const p of ['.env', 'app/.env.local', '/x/.env.production', 'id_rsa', 'server.pem', 'certs/site.key', 'credentials.json', 'service-account-prod.json', '/home/u/.aws/credentials', 'C:\\proj\\.env']) {
    assert.equal(isSecretPath(p), true, p);
  }
  for (const p of ['.env.example', '.env.sample', 'id_rsa.pub', 'src/env.ts', 'README.md', 'environment.md', 'keyboard.js', '.ssh/known_hosts', 'package.json']) {
    assert.equal(isSecretPath(p), false, p);
  }
});

test('bashTouchesSecret blocks reading, allows copying templates', () => {
  assert.ok(bashTouchesSecret('cat .env'));
  assert.ok(bashTouchesSecret('grep API_KEY .env.local'));
  assert.ok(bashTouchesSecret('source .env && npm start'));
  assert.equal(bashTouchesSecret('cp .env.example .env'), null);
  assert.equal(bashTouchesSecret('ls -la'), null);
  assert.equal(bashTouchesSecret('npm run build'), null);
});

test('pre-tool hook blocks secret files with exit 2', () => {
  const blocked = hook('pre-tool', { tool_name: 'Read', tool_input: { file_path: '/p/.env' } });
  assert.equal(blocked.code, 2);
  assert.match(blocked.stderr, /blocked access to a secrets file/);
  const allowed = hook('pre-tool', { tool_name: 'Read', tool_input: { file_path: '/p/index.html' } });
  assert.equal(allowed.code, 0);
  const off = hook('pre-tool', { tool_name: 'Read', tool_input: { file_path: '/p/.env' } }, { POWERUP_ALLOW_SECRETS: '1' });
  assert.equal(off.code, 0);
});

test('session-start hook loads the active client', () => {
  const project = mkdtempSync(join(tmpdir(), 'powerup-proj-'));
  mkdirSync(join(project, '.powerup/clients/crumb-co'), { recursive: true });
  writeFileSync(join(project, '.powerup/active-client'), 'crumb-co\n');
  writeFileSync(join(project, '.powerup/clients/crumb-co/profile.md'), '# Crumb\n\n**Summary:** Family bakery in Dubai Marina; Webflow site.\n');
  writeFileSync(join(project, '.powerup/agency.md'), '# Demo Studio');
  const r = hook('session-start', { cwd: project, source: 'startup' }, { CLAUDE_PROJECT_DIR: project });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /active client is "crumb-co" — Family bakery in Dubai Marina/);
  assert.match(r.stdout, /\.powerup\/agency\.md/);

  const empty = mkdtempSync(join(tmpdir(), 'powerup-empty-'));
  const none = hook('session-start', { cwd: empty }, { CLAUDE_PROJECT_DIR: empty });
  assert.equal(none.stdout, '', 'no .powerup folder → no output, no context cost');
});

test('proof gate: asks once after web edits, never loops, clears after a check', () => {
  const session = `s-${Date.now()}`;
  // Editing a non-web file doesn't arm the gate.
  hook('post-tool', { session_id: session, tool_name: 'Write', tool_input: { file_path: '/p/notes.txt' } });
  assert.equal(hook('stop', { session_id: session }).code, 0);

  // Editing a web file arms it; the first stop is blocked with a reason.
  hook('post-tool', { session_id: session, tool_name: 'Edit', tool_input: { file_path: '/p/src/Header.tsx' } });
  const first = hook('stop', { session_id: session, stop_hook_active: false });
  assert.equal(first.code, 2);
  assert.match(first.stderr, /Header\.tsx/);
  // The next stop passes (asked once only).
  assert.equal(hook('stop', { session_id: session, stop_hook_active: true }).code, 0);
  assert.equal(hook('stop', { session_id: session }).code, 0);

  // Running a check clears it.
  hook('post-tool', { session_id: session, tool_name: 'Write', tool_input: { file_path: '/p/index.html' } });
  hook('post-tool', { session_id: session, tool_name: 'Bash', tool_input: { command: 'node "/x/scripts/page-check.mjs" http://localhost:3000' } });
  assert.equal(hook('stop', { session_id: session }).code, 0);

  // A browser screenshot also counts as checking.
  hook('post-tool', { session_id: session, tool_name: 'Write', tool_input: { file_path: '/p/style.css' } });
  hook('post-tool', { session_id: session, tool_name: 'mcp__plugin_playwright_playwright__browser_take_screenshot', tool_input: {} });
  assert.equal(hook('stop', { session_id: session }).code, 0);

  // The gate can be switched off.
  hook('post-tool', { session_id: session, tool_name: 'Write', tool_input: { file_path: '/p/index.html' } });
  assert.equal(hook('stop', { session_id: session }, { POWERUP_PROOF_GATE: 'off' }).code, 0);
});

test('hooks never crash on bad input', () => {
  const r = spawnSync(process.execPath, [HOOK, 'pre-tool'], { input: 'not json', encoding: 'utf8' });
  assert.equal(r.status, 0);
});
