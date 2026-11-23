// Tests for the seo-report skill: compare-crawls, search-diff and render-report.
// Fixtures live in tests/fixtures/seo-report (two crawls of a small bakery site and
// Search Console exports for September and October 2026). No network is used.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SCRIPTS = join(root, 'plugins', 'powerup-seo', 'skills', 'seo-report', 'scripts');
const FIX = join(root, 'tests', 'fixtures', 'seo-report');
const script = (name) => join(SCRIPTS, name);
const fix = (name) => join(FIX, name);
let tmp;

function run(file, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file, ...args], { cwd: tmp });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.stdin.end();
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function assertCleanError(r, pattern) {
  assert.equal(r.code, 1, `expected exit 1, got ${r.code}: ${r.stdout}`);
  assert.match(r.stderr, pattern);
  assert.doesNotMatch(r.stderr, /\n\s+at\s/, 'no stack trace');
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'powerup-seo-report-'));
});

// ---------------------------------------------------------------------------
// compare-crawls
// ---------------------------------------------------------------------------
test('compare-crawls finds fixed, new, better and worse issues and page changes', async () => {
  const out = join(tmp, 'crawl-diff.json');
  const r = await run(script('compare-crawls.mjs'), [fix('crawl-2026-09.json'), fix('crawl-2026-10.json'), '--out', out]);
  assert.equal(r.code, 0, r.stderr);
  const summary = JSON.parse(r.stdout);
  const full = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(summary.fullDiff, out);

  assert.deepEqual(full.score, { previous: 61, current: 74, change: 13, label: '▲ 13' });
  assert.deepEqual(full.issues.fixed.map((i) => i.id), ['duplicate-titles', 'missing-meta-description']);
  assert.equal(full.issues.fixed[1].previousCount, 4);
  assert.deepEqual(full.issues.new.map((i) => i.id), ['missing-h1']);
  assert.deepEqual(full.issues.new[0].examples, ['https://crumb.example/order']);
  assert.deepEqual(full.issues.better.map((i) => [i.id, i.previous, i.current]), [['broken-internal-links', 2, 1], ['images-missing-alt', 3, 1]]);
  assert.deepEqual(full.issues.worse.map((i) => [i.id, i.previous, i.current]), [['thin-content', 2, 3]]);
  assert.deepEqual(full.issues.unchanged.map((i) => i.id), ['missing-open-graph']);

  assert.deepEqual(full.pages.added, ['https://crumb.example/blog/birthday-cakes', 'https://crumb.example/order']);
  assert.deepEqual(full.pages.removed, ['https://crumb.example/cupcakes']);
  const gallery = full.pages.statusChanged.find((s) => s.url.endsWith('/gallery'));
  assert.deepEqual(gallery, { url: 'https://crumb.example/gallery', from: 200, to: 404 });
  const oldMenu = full.pages.statusChanged.find((s) => s.url.endsWith('/old-menu'));
  assert.equal(oldMenu.nowRedirectsTo, 'https://crumb.example/cakes');
  assert.deepEqual(full.pages.newRedirects, [{ url: 'https://crumb.example/old-menu', to: 'https://crumb.example/cakes' }]);
  const cakes = full.pages.titleChanged.find((t) => t.url.endsWith('/cakes'));
  assert.deepEqual(cakes, { url: 'https://crumb.example/cakes', from: 'Cakes', to: 'Custom Cakes in Dubai Marina | Crumb & Co' });
  assert.equal(full.pages.descriptionChanged.length, 3);
  assert.equal(full.pages.descriptionChanged.find((d) => d.url.endsWith('/about')).from, null);

  assert.deepEqual(full.counts.sitemapUrls, { previous: 8, current: 9, change: 1, label: '▲ 1' });
  assert.equal(full.counts.indexablePages.change, 0);
  assert.equal(full.counts.brokenLinks.label, '▼ 1 (better)');
  assert.deepEqual(full.warnings, []);
});

test('compare-crawls tolerates reports from older kit versions', async () => {
  const old = join(tmp, 'old-crawl.json');
  writeFileSync(old, JSON.stringify({
    score: 50,
    startUrl: 'https://www.crumb.example/',
    issues: [{ id: 'duplicate-titles', severity: 'high', count: 2 }, { id: 'missing-h1', count: 1 }],
    site: { sitemapUrls: 7 },
  }));
  const r = await run(script('compare-crawls.mjs'), [old, fix('crawl-2026-10.json'), '--out', join(tmp, 'old-diff.json')]);
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.score.change, 24);
  assert.deepEqual(out.issues.fixed.map((i) => i.id), ['duplicate-titles']);
  assert.deepEqual(out.issues.unchanged, 1, 'missing-h1 has the same count');
  assert.equal(out.pages, null);
  assert.deepEqual(out.counts.sitemapUrls, { previous: 7, current: 9, change: 2, label: '▲ 2' });
  assert.equal(out.counts.indexablePages.previous, null);
  assert.ok(out.warnings.some((w) => /no page list/.test(w)));
});

test('compare-crawls fails cleanly on bad input', async () => {
  assertCleanError(await run(script('compare-crawls.mjs'), [fix('crawl-2026-09.json')]), /Usage/);
  assertCleanError(await run(script('compare-crawls.mjs'), [join(tmp, 'nope.json'), fix('crawl-2026-10.json')]), /not found/);
  const broken = join(tmp, 'broken.json');
  writeFileSync(broken, '{ "score": 61,');
  assertCleanError(await run(script('compare-crawls.mjs'), [broken, fix('crawl-2026-10.json')]), /not valid JSON/);
  const other = join(tmp, 'other.json');
  writeFileSync(other, JSON.stringify({ hello: 'world' }));
  assertCleanError(await run(script('compare-crawls.mjs'), [other, fix('crawl-2026-10.json')]), /does not look like a seo-crawl report/);
});

// ---------------------------------------------------------------------------
// search-diff
// ---------------------------------------------------------------------------
test('search-diff reads Search Console CSVs and computes honest totals', async () => {
  const out = join(tmp, 'queries.json');
  const r = await run(script('search-diff.mjs'), ['--current', fix('gsc-queries-2026-10.csv'), '--previous', fix('gsc-queries-2026-09.csv'), '--out', out]);
  assert.equal(r.code, 0, r.stderr);
  const s = JSON.parse(r.stdout);
  assert.equal(s.by, 'query');
  const t = s.totals;
  // "1,234" and "20,000" are read as numbers; the BOM does not break the first header.
  assert.equal(t.clicks.previous, 1978);
  assert.equal(t.clicks.current, 2142);
  assert.equal(t.clicks.changePct, 8.3);
  assert.equal(t.clicks.label, '▲ 8.3%');
  assert.equal(t.impressions.previous, 37400);
  assert.equal(t.impressions.current, 36320);
  assert.equal(t.impressions.label, '▼ 2.9%');
  // CTR is clicks ÷ impressions of the totals.
  assert.equal(t.ctr.previous, 5.29);
  assert.equal(t.ctr.current, 5.9);
  assert.equal(t.ctr.label, '▲ 0.61 pts');
  // Position is weighted by impressions (a plain average of the rows would be 9.93).
  assert.equal(t.position.previous, 6.7);
  assert.equal(t.position.current, 6.11);
  assert.equal(t.position.label, '▲ 0.6 (better)');
  assert.ok(s.notes.some((n) => /impression-weighted/.test(n)));
  assert.ok(s.notes.some((n) => /2–3 days behind/.test(n)));
  assert.ok(s.notes.some((n) => /anonymised/.test(n)));
  assert.ok(existsSync(out));
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).items.all.length, 7);
});

test('search-diff lists gainers, losers, new, lost and striking-distance queries', async () => {
  const r = await run(script('search-diff.mjs'), ['--current', fix('gsc-queries-2026-10.csv'), '--previous', fix('gsc-queries-2026-09.csv'), '--by', 'query', '--top', '10', '--out', join(tmp, 'q2.json')]);
  assert.equal(r.code, 0, r.stderr);
  const { items } = JSON.parse(r.stdout);
  assert.deepEqual(items.gainers.map((g) => [g.query, g.clicksChange]), [['cakes dubai marina', 266], ['wedding cake price', 26], ['crumb and co', 10], ['eggless cake dubai', 2]]);
  assert.deepEqual(items.losers.map((g) => [g.query, g.clicksChange]), [['birthday cakes dubai', -50]]);
  assert.deepEqual(items.new.map((g) => g.query), ['custom cakes, dubai'], 'comma inside quotes stays in the query');
  assert.deepEqual(items.lost.map((g) => [g.query, g.clicksPrev]), [['cupcakes dubai', 120]]);
  assert.deepEqual(items.strikingDistance.map((g) => g.query), ['birthday cakes dubai', 'wedding cake price', 'eggless cake dubai', 'custom cakes, dubai']);
  const wedding = items.gainers.find((g) => g.query === 'wedding cake price');
  assert.equal(wedding.positionChange, -3.8);
  assert.deepEqual(items.counts, { current: 6, previous: 6, new: 1, lost: 1, gainers: 4, losers: 1 });

  const strict = await run(script('search-diff.mjs'), ['--current', fix('gsc-queries-2026-10.csv'), '--previous', fix('gsc-queries-2026-09.csv'), '--min-impressions', '2000', '--out', join(tmp, 'q3.json')]);
  assert.deepEqual(JSON.parse(strict.stdout).items.strikingDistance.map((g) => g.query), ['birthday cakes dubai', 'wedding cake price']);
});

test('search-diff reads connector JSON rows and warns about period length and data delay', async () => {
  const r = await run(script('search-diff.mjs'), [
    '--current', fix('gsc-queries-2026-10.json'), '--previous', fix('gsc-queries-2026-09.csv'),
    '--previous-range', '2026-09-01..2026-09-30', '--today', '2026-11-02', '--out', join(tmp, 'json.json'),
  ]);
  assert.equal(r.code, 0, r.stderr);
  const s = JSON.parse(r.stdout);
  assert.equal(s.totals.clicks.current, 2142, 'same data as the CSV gives the same totals');
  assert.equal(s.totals.position.current, 6.11);
  assert.deepEqual(s.current.range, { start: '2026-10-01', end: '2026-10-31', days: 31 });
  assert.deepEqual(s.perDay.current, { days: 31, clicks: 69.1, impressions: 1171.6 });
  assert.deepEqual(s.perDay.previous, { days: 30, clicks: 65.9, impressions: 1246.7 });
  assert.ok(s.warnings.some((w) => /31 days and the previous one 30 days/.test(w)));
  assert.ok(s.warnings.some((w) => /2–3 days behind/.test(w)));
  assert.deepEqual(s.items.new.map((g) => g.query), ['custom cakes, dubai']);
});

test('search-diff handles daily files, flat JSON, compare-mode exports and year over year', async () => {
  const cur = join(tmp, 'Dates-oct.csv');
  const prev = join(tmp, 'Dates-sep.csv');
  writeFileSync(cur, '﻿Date,Clicks,Impressions,CTR,Position\n2026-10-01,10,100,10%,5\n2026-10-02,20,300,6.67%,9\n2026-10-03,~,0,0%,0\n');
  writeFileSync(prev, 'Date;Clicks;Impressions;CTR;Position\n2026-09-01;5;100;5%;10\n2026-09-02;5;100;5%;12\n');
  const r = await run(script('search-diff.mjs'), ['--current', cur, '--previous', prev, '--today', '2026-11-20', '--out', join(tmp, 'dates.json')]);
  assert.equal(r.code, 0, r.stderr);
  const s = JSON.parse(r.stdout);
  assert.equal(s.by, 'date');
  assert.equal(s.items, undefined);
  assert.equal(s.totals.clicks.current, 30);
  assert.equal(s.totals.position.current, 8, '(100×5 + 300×9) ÷ 400');
  assert.equal(s.totals.position.previous, 11);
  assert.ok(s.warnings.some((w) => /3 days and the previous one 2 days/.test(w)));

  const flat = join(tmp, 'flat.json');
  writeFileSync(flat, JSON.stringify([{ Query: 'cakes dubai marina', Clicks: '1,500', Impressions: 22000, Position: 3.8 }]));
  const lastYear = await run(script('search-diff.mjs'), ['--current', fix('gsc-queries-2026-10.csv'), '--previous', fix('gsc-queries-2026-09.csv'), '--last-year', flat, '--out', join(tmp, 'yoy.json')]);
  assert.equal(lastYear.code, 0, lastYear.stderr);
  const yoy = JSON.parse(lastYear.stdout).yearOverYear.totals;
  assert.equal(yoy.clicks.lastYear, 1500);
  assert.equal(yoy.clicks.label, '▲ 42.8%');

  const compare = join(tmp, 'compare.csv');
  writeFileSync(compare, 'Top queries,Last 28 days Clicks,Previous 28 days Clicks,Last 28 days Impressions,Previous 28 days Impressions,Last 28 days Position,Previous 28 days Position\ncakes,"1,100",1000,"10,000","9,000",4,5\nbread,50,0,500,0,12,0\n');
  const c = await run(script('search-diff.mjs'), ['--current', compare, '--out', join(tmp, 'compare.json')]);
  assert.equal(c.code, 0, c.stderr);
  const cs = JSON.parse(c.stdout);
  assert.equal(cs.totals.clicks.current, 1150);
  assert.equal(cs.totals.clicks.previous, 1000);
  assert.deepEqual(cs.items.new.map((i) => i.query), ['bread']);
  assert.ok(cs.warnings.some((w) => /compare-mode export/.test(w)));
});

test('search-diff fails cleanly on bad input', async () => {
  const q = fix('gsc-queries-2026-10.csv');
  assertCleanError(await run(script('search-diff.mjs'), ['--previous', q]), /Usage/);
  assertCleanError(await run(script('search-diff.mjs'), ['--current', q]), /--previous is required/);
  assertCleanError(await run(script('search-diff.mjs'), ['--current', q, '--previous', join(tmp, 'missing.csv')]), /previous file was not found/);
  const noClicks = join(tmp, 'no-clicks.csv');
  writeFileSync(noClicks, 'Query,Visits\ncakes,10\n');
  assertCleanError(await run(script('search-diff.mjs'), ['--current', noClicks, '--previous', q]), /needs "Clicks" and "Impressions"/);
  const badNumber = join(tmp, 'bad-number.csv');
  writeFileSync(badNumber, 'Query,Clicks,Impressions\ncakes,lots,10\n');
  assertCleanError(await run(script('search-diff.mjs'), ['--current', badNumber, '--previous', q]), /line 2: "lots" is not a number/);
  assertCleanError(await run(script('search-diff.mjs'), ['--current', q, '--previous', fix('gsc-queries-2026-09.csv'), '--by', 'page']), /no page/);
  const dates = join(tmp, 'Dates-only.csv');
  writeFileSync(dates, 'Date,Clicks,Impressions\n2026-10-01,1,10\n');
  assertCleanError(await run(script('search-diff.mjs'), ['--current', q, '--previous', dates]), /Compare like with like/);
  assertCleanError(await run(script('search-diff.mjs'), ['--current', q, '--previous', q, '--current-range', 'October']), /--current-range must look like/);
  const badJson = join(tmp, 'bad.json');
  writeFileSync(badJson, '{"rows": 3}');
  assertCleanError(await run(script('search-diff.mjs'), ['--current', badJson, '--previous', q]), /has no rows/);
});

// ---------------------------------------------------------------------------
// render-report
// ---------------------------------------------------------------------------
test('render-report makes branded, escaped HTML with coloured changes', async () => {
  const md = join(tmp, 'seo-report-crumb-2026-10.md');
  writeFileSync(md, [
    '# SEO report — Crumb & Co <script>alert(1)</script>',
    '',
    '**Period:** October 2026 · **Prepared by:** Demo Studio',
    '',
    '| Metric | October | September | Change |',
    '|---|---|---|---|',
    '| Clicks | 2,142 | 1,978 | ▲ 12% |',
    '| Impressions | 36,320 | 37,400 | ▼ 5% |',
    '| Average position | 6.1 | 8.2 | ▲ 2.1 (better) |',
    '| Broken links | 3 | 1 | ▲ 2 (worse) |',
    '| Referring domains | Not connected | Not connected | – |',
    '',
    '- Health score 61 → 74 (▲ 13). See [the site](https://crumb.example/?a=1&b=2) or [this](javascript:alert(1)).',
    '',
    '> Search Console data is usually 2–3 days behind.',
    '',
    'Contact: {{Agency contact}}',
  ].join('\n'));
  const r = await run(script('render-report.mjs'), [md, '--agency', 'Demo Studio', '--primary', '#0f766e', '--font', 'Inter']);
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  const html = readFileSync(join(tmp, 'seo-report-crumb-2026-10.html'), 'utf8');
  assert.match(html, /Demo Studio/);
  assert.match(html, /--brand: #0f766e/);
  assert.match(html, /fonts\.googleapis\.com\/css2\?family=Inter/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /<a href="https:\/\/crumb\.example\/\?a=1&amp;b=2">the site<\/a>/);
  assert.match(html, /<span class="delta good">▲ 12%<\/span>/);
  assert.match(html, /<span class="delta bad">▼ 5%<\/span>/);
  assert.match(html, /<span class="delta good">▲ 2\.1 \(better\)<\/span>/);
  assert.match(html, /<span class="delta bad">▲ 2 \(worse\)<\/span>/);
  assert.match(html, /<span class="delta good">▲ 13<\/span>/);
  assert.match(html, /<span class="na">Not connected<\/span>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /@media print/);
  assert.match(html, /<mark>\{\{Agency contact\}\}<\/mark>/);
  assert.deepEqual(out.deltas, { good: 3, bad: 2, noChange: 0 });
  assert.deepEqual(out.leftoverPlaceholders, [{ line: 17, text: '{{Agency contact}}' }]);
});

test('render-report renders the template and fails cleanly on bad input', async () => {
  const out = join(tmp, 'template.html');
  const r = await run(script('render-report.mjs'), [join(SCRIPTS, '..', 'templates', 'report.md'), '--out', out, '--primary', 'red; }']);
  assert.equal(r.code, 0, r.stderr);
  const s = JSON.parse(r.stdout);
  assert.ok(s.leftoverPlaceholders.length > 10, 'the template is all placeholders');
  assert.match(readFileSync(out, 'utf8'), /--brand: #1f4fd1/, 'an invalid colour falls back to the default');

  assertCleanError(await run(script('render-report.mjs'), []), /Usage/);
  assertCleanError(await run(script('render-report.mjs'), [join(tmp, 'missing.md')]), /not found/);
});
