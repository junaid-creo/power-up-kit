// End-to-end tests: run each skill script against the test website and check it
// finds the problems we planted in tests/fixtures/site.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSite } from './helpers/server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const S = (p) => join(root, 'plugins', p);
let site;
let tmp;

function run(script, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: opts.cwd || tmp, env: { ...process.env, ...opts.env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    if (opts.input !== undefined) child.stdin.end(opts.input);
    else child.stdin.end();
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

before(async () => {
  site = await startSite();
  tmp = mkdtempSync(join(tmpdir(), 'powerup-test-'));
});
after(async () => {
  await site.close();
});

test('page-check finds broken links and missing alt text', async () => {
  const r = await run(S('powerup-core/skills/proof-check/scripts/page-check.mjs'), [`${site.origin}/`]);
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  const byId = Object.fromEntries(out.checks.map((c) => [c.id, c]));
  assert.equal(byId['http-status'].status, 'pass');
  assert.equal(byId.title.status, 'pass');
  assert.equal(byId['broken-links'].status, 'fail');
  assert.ok(byId['broken-links'].evidence.some((e) => e.includes('/old-page')));
  assert.equal(byId['img-alt'].status, 'warn');
  assert.equal(byId.viewport.status, 'pass');
  assert.equal(byId['structured-data'].status, 'pass');
  assert.equal(out.verdict, 'fail');
});

test('page-check works on a local HTML file', async () => {
  const r = await run(S('powerup-core/skills/proof-check/scripts/page-check.mjs'), [join(root, 'tests/fixtures/site/services.html'), '--summary']);
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  const ids = out.checks.map((c) => c.id);
  assert.ok(ids.includes('structured-data'), 'invalid JSON-LD should fail');
  assert.ok(ids.includes('heading-order'), 'h2 → h4 skip should warn');
  assert.ok(ids.includes('meta-description'), 'short description should warn');
});

test('seo-crawl finds the planted site problems and respects robots.txt', async () => {
  const out = join(tmp, 'crawl.json');
  const csv = join(tmp, 'pages.csv');
  const r = await run(S('powerup-seo/skills/seo-audit/scripts/seo-crawl.mjs'), [`${site.origin}/`, '--max', '20', '--delay', '0', '--out', out, '--csv', csv]);
  assert.equal(r.code, 0, r.stderr);
  const summary = JSON.parse(r.stdout);
  const report = JSON.parse(readFileSync(out, 'utf8'));
  const ids = new Set(report.issues.map((i) => i.id));
  for (const expected of ['broken-internal-links', 'duplicate-titles', 'noindex-in-sitemap', 'invalid-structured-data', 'redirect-chains', 'thin-content', 'orphan-pages', 'multiple-h1', 'heading-skips', 'images-missing-alt']) {
    assert.ok(ids.has(expected), `expected issue ${expected}; got ${[...ids].join(', ')}`);
  }
  assert.ok(!ids.has('soft-404'), 'the test server returns real 404s');
  assert.ok(!ids.has('no-sitemap'));
  assert.ok(report.skippedByRobots.some((u) => u.includes('/private/')), 'robots.txt Disallow must be respected');
  assert.ok(!report.pages.some((p) => p.url.includes('/private/')));
  assert.ok(summary.score > 0 && summary.score < 100, `score ${summary.score}`);
  const broken = report.brokenLinks.find((b) => b.url.endsWith('/old-page'));
  assert.ok(broken && broken.foundOn.length, 'broken link should list the page it was found on');
  assert.ok(readFileSync(csv, 'utf8').startsWith('url,status,title'));
  const home = report.pages.find((p) => p.url === `${site.origin}/`);
  assert.equal(home.depth, 0);
});

test('pagespeed turns a PageSpeed Insights response into a compact summary', async () => {
  const { createServer } = await import('node:http');
  const sample = readFileSync(join(root, 'tests/fixtures/psi-sample.json'), 'utf8');
  let query = '';
  const psi = createServer((req, res) => {
    query = req.url;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(sample);
  });
  await new Promise((r) => psi.listen(0, '127.0.0.1', r));
  const endpoint = `http://127.0.0.1:${psi.address().port}/runPagespeed`;
  const r = await run(S('powerup-seo/skills/seo-audit/scripts/pagespeed.mjs'), ['https://crumb.example/', '--strategy', 'mobile'], { env: { POWERUP_PSI_ENDPOINT: endpoint, PAGESPEED_API_KEY: 'test-key' } });
  await new Promise((res) => psi.close(res));
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(r.stdout).results[0];
  assert.match(query, /strategy=mobile/);
  assert.match(query, /category=BEST_PRACTICES/);
  assert.match(query, /key=test-key/);
  assert.deepEqual(out.scores, { performance: 62, accessibility: 91, bestPractices: 100, seo: 83 });
  assert.equal(out.lab.lcpMs, 4201);
  assert.equal(out.lab.cls, 0.08);
  assert.deepEqual(out.field.lcpMs, { p75: 3100, rating: 'AVERAGE' });
  assert.deepEqual(out.field.cls, { p75: 0.12, rating: 'AVERAGE' });
  assert.equal(out.opportunities.length, 2, 'audits that already pass are not opportunities');
  assert.equal(out.opportunities[0].id, 'uses-optimized-images', 'biggest saving first');
});

test('pagespeed refuses local URLs Google cannot reach', async () => {
  const r = await run(S('powerup-core/skills/proof-check/scripts/pagespeed.mjs'), ['http://localhost:3000/']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /cannot reach local URLs/);
});

test('extract-brand finds the brand colours and fonts', async () => {
  const r = await run(S('powerup-design/skills/brand-sheet/scripts/extract-brand.mjs'), [`${site.origin}/`]);
  assert.equal(r.code, 0, r.stderr);
  const b = JSON.parse(r.stdout);
  assert.equal(b.suggested.primary, '#c2410c');
  assert.equal(b.suggested.background, '#fffaf0');
  assert.equal(b.suggested.text, '#1f2937');
  assert.equal(b.suggested.bodyFont, 'Inter');
  assert.equal(b.suggested.headingFont, 'Playfair Display');
  assert.ok(b.fontSources.googleFonts.includes('Playfair Display'));
  assert.ok(b.fontSources.fontFace.includes('Crumb Script'));
  assert.ok(!b.fonts.some((f) => f.family === 'Crumb Script'), '@font-face alone is not "used"');
  assert.ok(b.fonts.some((f) => f.family === 'Lora'), 'font shorthand is read');
  assert.ok(b.logoCandidates[0].url.endsWith('/logo.svg'));
  assert.ok(b.contrast.length >= 2);
  assert.ok(b.copy.callsToAction.includes('Order a cake'));
  const orange = b.palette.find((p) => p.hex === '#c2410c');
  assert.ok(orange.similarShades.includes('#c2410d'), 'near-identical shades should merge');
});

test('render-sheet makes an HTML brand sheet with contrast checks', async () => {
  const json = join(tmp, 'brand.json');
  writeFileSync(json, JSON.stringify({
    name: 'Crumb & Co',
    colors: [
      { role: 'Primary', hex: '#c2410c', use: 'Buttons', confirmed: false },
      { role: 'Background', hex: '#fffaf0', use: 'Page' },
      { role: 'Text', hex: '#1f2937', use: 'Body text', confirmed: true },
      { role: 'Accent', hex: '#fde68a', use: 'Highlights' },
    ],
    fonts: { headings: 'Playfair Display', body: 'Inter' },
    voice: { words: ['warm'], do: ['Say "we"'], dont: ['Jargon'] },
  }));
  const out = join(tmp, 'sheet.html');
  const r = await run(S('powerup-design/skills/brand-sheet/scripts/render-sheet.mjs'), [json, '--out', out]);
  assert.equal(r.code, 0, r.stderr);
  const res = JSON.parse(r.stdout);
  assert.ok(res.failingPairs.some((p) => p.startsWith('Accent')), 'pale accent text on cream must fail contrast');
  const html = readFileSync(out, 'utf8');
  assert.match(html, /Crumb &amp; Co/);
  assert.match(html, /#C2410C/);
  assert.match(html, /Not confirmed/);
});

test('check-proposal passes a correct proposal and catches a bad one', async () => {
  const good = await run(S('powerup-agency/skills/proposal/scripts/check-proposal.mjs'), [join(root, 'tests/fixtures/proposals/good.md'), '--today', '2026-11-20']);
  assert.equal(good.code, 0, good.stdout);
  const g = JSON.parse(good.stdout);
  assert.equal(g.mustFix.length, 0);
  assert.equal(g.toFill.length, 2);

  const bad = await run(S('powerup-agency/skills/proposal/scripts/check-proposal.mjs'), [join(root, 'tests/fixtures/proposals/bad.md'), '--today', '2026-11-20']);
  assert.equal(bad.code, 1);
  const b = JSON.parse(bad.stdout);
  const problems = b.mustFix.map((m) => m.problem).join('\n');
  assert.match(problems, /Template text left in/);
  assert.match(problems, /lines add up to 14,500/);
  assert.match(problems, /in the past/);
  assert.ok(b.warnings.some((w) => /currency/.test(w.problem)));
});

test('render-proposal makes branded HTML and highlights placeholders', async () => {
  const md = join(tmp, 'p.md');
  writeFileSync(md, readFileSync(join(root, 'tests/fixtures/proposals/good.md'), 'utf8'));
  const r = await run(S('powerup-agency/skills/proposal/scripts/render-proposal.mjs'), [md, '--agency', 'Demo Studio', '--primary', '#0f766e']);
  assert.equal(r.code, 0, r.stderr);
  const html = readFileSync(join(tmp, 'p.html'), 'utf8');
  assert.match(html, /--brand: #0f766e/);
  assert.match(html, /<table>/);
  assert.match(html, /<mark>\[PRICE\]<\/mark>/);
  assert.match(html, /class="total"/);
});

test('doctor reports project memory and finds secrets in it', async () => {
  const project = join(tmp, 'project');
  mkdirSync(join(project, '.powerup/clients/crumb'), { recursive: true });
  writeFileSync(join(project, '.powerup/active-client'), 'crumb\n');
  writeFileSync(join(project, '.powerup/clients/crumb/profile.md'), '**Summary:** Bakery\nWebflow login password: hunter2222\n');
  writeFileSync(join(project, '.powerup/clients/crumb/decisions.md'), '- 2026-11-20 — card 4111 1111 1111 1111 for the domain\n');
  const r = await run(S('powerup-core/skills/doctor/scripts/doctor.mjs'), ['--project', project]);
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  const byId = Object.fromEntries(out.checks.map((c) => [c.id, c]));
  assert.equal(byId.node.status, 'pass');
  assert.equal(byId['active-client'].status, 'pass');
  assert.equal(byId['client-files'].status, 'warn');
  assert.equal(byId['memory-secrets'].status, 'fail');
  assert.match(byId['memory-secrets'].fix, /password/);
  assert.match(byId['memory-secrets'].fix, /card number/);
  assert.ok(existsSync(project));
});
