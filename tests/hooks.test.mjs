import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSecretPath, bashTouchesSecret, bashWebEdits, bashIsCheck, globReachesSecret } from '../plugins/powerup-core/hooks/scripts/powerup-hook.mjs';

const HOOK = fileURLToPath(new URL('../plugins/powerup-core/hooks/scripts/powerup-hook.mjs', import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), 'powerup-hook-data-'));
const emptyDir = () => mkdtempSync(join(tmpdir(), 'powerup-empty-'));

function hook(event, input, env = {}) {
  const r = spawnSync(process.execPath, [HOOK, event], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_DATA: dataDir, CLAUDE_PROJECT_DIR: '', POWERUP_ALLOW_SECRETS: '', POWERUP_PROOF_GATE: '', ...env },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('isSecretPath', () => {
  for (const p of [
    '.env', 'app/.env.local', '/x/.env.production', 'id_rsa', 'server.pem', 'certs/site.key', 'credentials.json',
    'service-account-prod.json', '/home/u/.aws/credentials', 'C:\\proj\\.env', 'config/secrets',
    // added after the 0.1.0 review
    'wp-config.php', 'site/wp-config.php', '.npmrc', '.envrc', '.dev.vars', '.dev.vars.staging',
    'terraform.tfvars', 'prod.auto.tfvars', '.pgpass', '.git-credentials', 'auth.json',
  ]) {
    assert.equal(isSecretPath(p), true, p);
  }
  for (const p of [
    '.env.example', '.env.sample', 'id_rsa.pub', 'src/env.ts', 'README.md', 'environment.md', 'keyboard.js',
    '.ssh/known_hosts', 'package.json', 'wp-config-sample.php', 'credentials.md', 'docs/secrets.md', 'variables.tf',
    // ordinary words must never count as files
    'secret', 'secrets', 'credentials',
  ]) {
    assert.equal(isSecretPath(p), false, p);
  }
});

test('secret guard blocks every bypass found in the 0.1.0 review', () => {
  const dir = emptyDir();
  for (const cmd of [
    'cat .env',
    'sort .env',
    'cut -c1- .env',
    'cat .e*',
    'cat .en?',
    'cat .*',
    'cat<.env',
    'cat < .env',
    'python3 -c "print(open(\'.env\').read())"',
    "node -e \"console.log(require('fs').readFileSync('.env','utf8'))\"",
    'printf "%s" "$(cat .env)"',
    'echo .env | xargs cat',
    'cp .env /tmp/x',
    'rsync .env backup-host:',
    'git show HEAD:.env',
    'git diff .env',
    'git add .env',
    'tee .env < new-values.txt',
    'echo API_KEY=1 > .env',
    'find . -name .env -exec cat {} \\;',
    'grep -r KEY .envrc',
    'grep "API KEY" .env',
    'rg KEY --hidden -g ".env*"',
    'less .dev.vars',
    'cat wp-config.php',
    'head -5 terraform.tfvars',
    'awk 1 ~/.pgpass',
    'source .env && npm start',
    'sudo cat .npmrc',
  ]) {
    assert.ok(bashTouchesSecret(cmd, dir), `should block: ${cmd}`);
  }
});

test('secret guard still allows everyday commands', () => {
  const dir = emptyDir();
  for (const cmd of [
    'cp .env.example .env',
    'mv .env .env.backup',
    'echo .env >> .gitignore',
    'git check-ignore .env',
    'git status',
    'git commit -m "Stop tracking .env and rotate the secret"',
    'ls -la .env',
    'ls -a .*',
    'rm .env.local',
    'test -f .env && echo yes',
    'find . -name .env',
    'node --env-file=.env server.js',
    'docker compose --env-file .env up -d',
    'cat .env.example',
    'cat wp-config-sample.php',
    'npm run build',
    'cat *.md',
    'grep -r TODO src',
    'echo "the secret sauce is in credentials handling"',
    // searching docs FOR the text ".env" is not reading the file
    'grep -rn ".env" docs',
    'grep -r "remove .env from git" README.md CHANGELOG.md',
    'rg "\\.env" README.md',
    'grep -e .env -r docs',
  ]) {
    assert.equal(bashTouchesSecret(cmd, dir), null, `should allow: ${cmd}`);
  }
});

test('globs are judged against the real folder', () => {
  const dir = emptyDir();
  writeFileSync(join(dir, 'credentials.json'), '{}');
  writeFileSync(join(dir, 'package.json'), '{}');
  assert.ok(bashTouchesSecret('cat *.json', dir), 'cat *.json reaches credentials.json');
  const clean = emptyDir();
  writeFileSync(join(clean, 'package.json'), '{}');
  assert.equal(bashTouchesSecret('cat *.json', clean), null);
  assert.equal(globReachesSecret('.e*', clean), '.env', 'dot-globs are judged against well-known names even if the file is absent');
});

test('pre-tool hook blocks secret files with exit 2', () => {
  const blocked = hook('pre-tool', { tool_name: 'Read', tool_input: { file_path: '/p/.env' } });
  assert.equal(blocked.code, 2);
  assert.match(blocked.stderr, /blocked a command that would read, print or overwrite a secrets file/);
  const allowed = hook('pre-tool', { tool_name: 'Read', tool_input: { file_path: '/p/index.html' } });
  assert.equal(allowed.code, 0);
  const off = hook('pre-tool', { tool_name: 'Read', tool_input: { file_path: '/p/.env' } }, { POWERUP_ALLOW_SECRETS: '1' });
  assert.equal(off.code, 0);
});

test('pre-tool hook checks Grep globs and the Bash working folder', () => {
  const g = hook('pre-tool', { tool_name: 'Grep', tool_input: { pattern: 'KEY', glob: '.env*' } });
  assert.equal(g.code, 2);
  const dir = emptyDir();
  writeFileSync(join(dir, 'secrets.yaml'), 'x: 1');
  const b = hook('pre-tool', { tool_name: 'Bash', cwd: dir, tool_input: { command: 'cat *.yaml' } });
  assert.equal(b.code, 2);
});

test('proof gate notices web files changed through the shell', () => {
  assert.deepEqual(bashWebEdits("sed -i '' 's/Old/New/' index.html"), ['index.html']);
  assert.deepEqual(bashWebEdits('echo "<p>hi</p>" > public/about.html'), ['public/about.html']);
  assert.deepEqual(bashWebEdits('perl -pi -e "s/a/b/" theme/header.php'), ['theme/header.php']);
  assert.deepEqual(bashWebEdits('npx prettier --write src/App.tsx'), ['src/App.tsx']);
  assert.deepEqual(bashWebEdits('cat index.html'), []);
  assert.deepEqual(bashWebEdits("sed -n '1,5p' index.html"), []);
});

test('proof gate only clears on a real check', () => {
  for (const cmd of ['npm i lighthouse', 'echo lighthouse', 'grep -r pa11y docs', 'cat page-check.mjs', 'npm run build']) {
    assert.equal(bashIsCheck(cmd), false, `not a check: ${cmd}`);
  }
  for (const cmd of [
    'npx lighthouse http://localhost:3000 --view',
    'lighthouse https://example.com',
    'npx pa11y http://localhost:5173',
    'npx playwright test',
    'node "/Users/a b/plugins/powerup-core/skills/proof-check/scripts/page-check.mjs" http://localhost:3000 --summary',
    'cd site && node scripts/seo-crawl.mjs https://example.com --max 20',
  ]) {
    assert.equal(bashIsCheck(cmd), true, `is a check: ${cmd}`);
  }
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

  const empty = emptyDir();
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

  // Editing through the shell arms it too; an unrelated "lighthouse" mention doesn't clear it.
  hook('post-tool', { session_id: session, tool_name: 'Bash', tool_input: { command: "sed -i '' 's/a/b/' index.html" } });
  hook('post-tool', { session_id: session, tool_name: 'Bash', tool_input: { command: 'npm i lighthouse' } });
  const viaShell = hook('stop', { session_id: session });
  assert.equal(viaShell.code, 2);
  assert.match(viaShell.stderr, /index\.html/);

  // The gate can be switched off.
  hook('post-tool', { session_id: session, tool_name: 'Write', tool_input: { file_path: '/p/index.html' } });
  assert.equal(hook('stop', { session_id: session }, { POWERUP_PROOF_GATE: 'off' }).code, 0);
});

test('hooks never crash on bad input', () => {
  const r = spawnSync(process.execPath, [HOOK, 'pre-tool'], { input: 'not json', encoding: 'utf8' });
  assert.equal(r.status, 0);
});
