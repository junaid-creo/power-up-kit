#!/usr/bin/env node
// Measure how much text each kit script prints (what Claude reads) and how big
// the files it writes are (what Claude might read later). Runs every script on
// the test fixtures, so numbers are comparable before and after a change.
//
//   node scripts/measure-output.mjs            # table
//   node scripts/measure-output.mjs --json     # machine-readable
//
// Tokens are estimated at 4 characters per token.

import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSite } from '../tests/helpers/server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const P = (p) => join(root, 'plugins', p);
const FX = (p) => join(root, 'tests', 'fixtures', p);

function run(script, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env: { ...process.env, PAGESPEED_API_KEY: '' } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function dirBytes(dir) {
  let total = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    total += name.isDirectory() ? dirBytes(p) : statSync(p).size;
  }
  return total;
}

const site = await startSite();
const o = site.origin;
const cases = [
  ['seo-crawl', P('powerup-seo/skills/seo-audit/scripts/seo-crawl.mjs'), [`${o}/`, '--max', '20', '--delay', '0']],
  ['page-check', P('powerup-core/skills/proof-check/scripts/page-check.mjs'), [`${o}/`]],
  ['page-check --summary', P('powerup-core/skills/proof-check/scripts/page-check.mjs'), [`${o}/`, '--summary']],
  ['meta-schema scan', P('powerup-seo/skills/meta-schema/scripts/meta-schema.mjs'), ['scan', `${o}/`, '--sitemap', '--delay', '0']],
  ['launch-check pre', P('powerup-agency/skills/launch/scripts/launch-check.mjs'), [`${o}/`, '--phase', 'pre', '--delay', '0']],
  ['compare-pages', P('powerup-seo/skills/content-brief/scripts/compare-pages.mjs'), [FX('content-brief/comp-a.html'), FX('content-brief/comp-b.html'), FX('content-brief/comp-c.html'), '--keyword', 'wedding cakes dubai']],
  ['redirect-map match', P('powerup-seo/skills/redirect-map/scripts/redirect-map.mjs'), ['match', '--old', FX('redirect-map/old-sitemap.xml'), '--new', FX('redirect-map/new-urls.txt'), '--out', 'map.csv']],
  ['extract-brand', P('powerup-design/skills/brand-sheet/scripts/extract-brand.mjs'), [`${o}/`]],
  ['compare-crawls', P('powerup-seo/skills/seo-report/scripts/compare-crawls.mjs'), [FX('seo-report/crawl-2026-09.json'), FX('seo-report/crawl-2026-10.json')]],
  ['search-diff', P('powerup-seo/skills/seo-report/scripts/search-diff.mjs'), ['--current', FX('seo-report/gsc-queries-2026-10.csv'), '--previous', FX('seo-report/gsc-queries-2026-09.csv')]],
];

const rows = [];
for (const [name, script, args] of cases) {
  const cwd = mkdtempSync(join(tmpdir(), 'powerup-measure-'));
  const r = await run(script, args, cwd);
  rows.push({ name, exit: r.code, stdoutChars: r.stdout.length, stdoutTokens: Math.round(r.stdout.length / 4), filesBytes: dirBytes(cwd) });
  rmSync(cwd, { recursive: true, force: true });
}
await site.close();

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(rows)}\n`);
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('script', 24)}${pad('exit', 6)}${pad('stdout ~tokens', 16)}files written (bytes)`);
  for (const r of rows) console.log(`${pad(r.name, 24)}${pad(r.exit, 6)}${pad(r.stdoutTokens, 16)}${r.filesBytes}`);
  console.log(`${pad('TOTAL', 30)}${pad(rows.reduce((a, r) => a + r.stdoutTokens, 0), 16)}`);
}
