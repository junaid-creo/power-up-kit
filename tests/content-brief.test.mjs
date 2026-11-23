// Tests for the content-brief skill: compare-pages.mjs on saved competitor pages,
// on live URLs from the test website (robots.txt respected), and with --site.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSite } from './helpers/server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(root, 'plugins', 'powerup-seo', 'skills', 'content-brief', 'scripts', 'compare-pages.mjs');
const FIX = join(root, 'tests', 'fixtures', 'content-brief');
const KEYWORD = 'wedding cakes dubai';
let site;
let tmp;

function run(args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd: opts.cwd || tmp });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.stdin.end();
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

before(async () => {
  site = await startSite();
  tmp = mkdtempSync(join(tmpdir(), 'powerup-brief-'));
});
after(async () => {
  await site.close();
});

test('compare-pages aggregates saved competitor pages', async () => {
  const out = join(tmp, 'files.json');
  const r = await run([join(FIX, 'comp-a.html'), join(FIX, 'comp-b.html'), join(FIX, 'comp-c.html'), '--keyword', KEYWORD, '--out', out]);
  assert.equal(r.code, 0, r.stderr);
  const summary = JSON.parse(r.stdout);
  const full = JSON.parse(readFileSync(out, 'utf8'));
  const agg = full.aggregates;
  assert.equal(summary.pagesAnalysed, 3);
  assert.equal(summary.pages.length, 3);
  assert.match(summary.pages[0], /^#1 sugarbloom\.example\/wedding-cakes/);

  // Word count: main content only (nav, header and footer ignored), median of three pages.
  const counts = full.pages.map((p) => p.wordCount);
  assert.deepEqual([...counts].sort((a, b) => a - b), [agg.wordCount.min, agg.wordCount.median, agg.wordCount.max]);
  assert.equal(agg.wordCount.median, counts[0], 'page A has the middle word count');
  assert.ok(agg.wordCount.min === counts[1] && agg.wordCount.max === counts[2]);
  assert.ok(agg.wordCount.recommended.min <= agg.wordCount.median && agg.wordCount.recommended.max <= Math.max(agg.wordCount.max, agg.wordCount.recommended.min + 50));
  assert.equal(full.pages[0].contentArea, 'main');
  assert.equal(full.pages[1].contentArea, 'article');

  // Subtopics: shared heading words, keyword words removed, footer headings ignored.
  const sub = Object.fromEntries(agg.subtopics.map((t) => [t.term, t.coveredBy]));
  assert.equal(sub.flavours, '3 of 3');
  assert.equal(sub.delivery, '3 of 3');
  assert.equal(sub.prices, '2 of 3');
  assert.equal(sub.tasting, '2 of 3');
  assert.equal(sub['sugar flowers'], '2 of 3');
  assert.ok(!('sugar' in sub), 'a single word fully covered by a shared phrase is folded into the phrase');
  for (const noise of ['quick', 'links', 'opening', 'wedding', 'cake', 'cakes', 'dubai', 'far']) {
    assert.ok(!(noise in sub), `"${noise}" should not be a subtopic`);
  }
  assert.ok(summary.subtopics.includes('flavours — covered by 3 of 3'));

  // Questions: headings ending in "?" plus FAQPage schema, deduplicated across pages.
  assert.equal(agg.questions.length, 3);
  assert.deepEqual(agg.questions[0], {
    question: 'How far in advance should I order my wedding cake?',
    pages: 2,
    coveredBy: '2 of 3',
    from: ['faq-schema', 'heading'],
  });
  assert.deepEqual(agg.questions.slice(1).map((q) => q.question), ['Can I get a gluten-free wedding cake?', 'Do you deliver outside Dubai?']);

  // Schema types used by 2+ pages.
  assert.deepEqual(agg.schema.shared.map((t) => `${t.type} ${t.coveredBy}`), ['Article 2 of 3', 'Bakery 2 of 3']);
  assert.ok(agg.schema.all.some((t) => t.type === 'FAQPage' && t.pages === 1));

  // Keyword placement: all words, simple plurals, URL from the canonical link.
  const kp = agg.keywordPlacement;
  assert.deepEqual([kp.inTitle, kp.inH1, kp.inUrl, kp.inFirst100Words], [
    { count: 2, of: 3 }, { count: 2, of: 3 }, { count: 1, of: 2 }, { count: 2, of: 3 },
  ]);
  assert.equal(full.pages[1].keyword.inUrl, null, 'a saved page without a canonical URL is unknown, not "no"');
  assert.equal(full.pages[2].url, 'https://cakestudio.example/wedding-cakes-dubai');

  // Dates: meta article:*_time and JSON-LD; nested Review dates are ignored.
  assert.deepEqual([full.pages[0].published, full.pages[0].modified], ['2025-03-10', '2026-06-01']);
  assert.deepEqual([full.pages[1].published, full.pages[1].modified], ['2024-11-02', '2026-09-15']);
  assert.deepEqual([full.pages[2].published, full.pages[2].modified], ['2023-05-20', null]);
  assert.equal(agg.dates.newestModified.date, '2026-09-15');
  assert.equal(agg.dates.oldestPublished.date, '2023-05-20');
  assert.equal(agg.dates.newestPublished.date, '2025-03-10');

  // Per-page details.
  assert.equal(full.pages[0].images, 3, 'logo in the header is not counted');
  assert.equal(full.pages[0].externalLinks, 1);
  assert.ok(full.pages[0].outline.some((h) => h.level === 3 && h.text === 'Pistachio and rose'));
  assert.ok(!full.pages[0].outline.some((h) => h.text === 'Quick links'));
});

test('compare-pages reads page text saved as Markdown', async () => {
  const out = join(tmp, 'text.json');
  const r = await run([join(FIX, 'comp-a.html'), join(FIX, 'comp-d.md'), '--keyword', KEYWORD, '--out', out]);
  assert.equal(r.code, 0, r.stderr);
  const full = JSON.parse(readFileSync(out, 'utf8'));
  const d = full.pages[1];
  assert.equal(d.source, 'text-file');
  assert.equal(d.url, 'https://pagetext.example/wedding-cakes-dubai-guide');
  assert.equal(d.title, 'Wedding Cakes in Dubai: A Simple Guide');
  assert.equal(d.schemaTypes, null, 'schema is unknown for page text');
  assert.deepEqual(d.keyword, { inTitle: true, inH1: true, inUrl: true, inFirst100Words: true });
  assert.equal(d.modified, '2026-08-14');
  assert.ok(d.questions.some((q) => q.text === 'How much does a wedding cake cost?'));
  assert.equal(full.aggregates.schema.pagesChecked, 1);
  assert.ok(full.aggregates.wordCount.excluded.some((e) => e.position === 2), 'very short page text is left out of the length range');
});

test('compare-pages fetches URLs, skips robots-disallowed pages and checks the client site', async () => {
  const out = join(tmp, 'urls.json');
  const r = await run([
    `${site.origin}/`, `${site.origin}/about.html`, `${site.origin}/private/secret.html`,
    '--keyword', 'celebration cakes', '--site', site.origin, '--delay', '0', '--out', out,
  ]);
  assert.equal(r.code, 0, r.stderr);
  const summary = JSON.parse(r.stdout);
  const full = JSON.parse(readFileSync(out, 'utf8'));

  assert.equal(summary.pagesAnalysed, 2);
  assert.equal(summary.skipped.length, 1);
  assert.equal(summary.skipped[0].input, `${site.origin}/private/secret.html`);
  assert.match(summary.skipped[0].reason, /robots\.txt/);
  assert.equal(full.pages[0].title, 'Crumb & Co — Fresh Cakes in Dubai Marina');
  assert.equal(full.pages[0].status, 200);

  const s = full.site;
  assert.equal(s.urlSource, 'sitemap');
  assert.equal(s.pagesFound, 6);
  assert.equal(s.blockedByRobots, 1);
  assert.equal(s.pagesRead, 5);
  assert.deepEqual(s.possibleCannibalization.map((p) => [p.url, p.matchedIn]), [[`${site.origin}/services.html`, ['H1']]]);
  assert.deepEqual(s.internalLinkCandidates[0], { url: `${site.origin}/services.html`, title: 'About us | Crumb & Co', score: 2 });
  assert.ok(s.internalLinkCandidates.some((c) => c.url === `${site.origin}/`));
  assert.ok(!JSON.stringify(s).includes('/private/'), 'robots-disallowed client pages are never read');
  assert.deepEqual(summary.site.clientPagesInResults.map((p) => p.position), [1, 2]);
  assert.ok(full.pages.every((p) => p.isClientPage));
});

test('compare-pages --max-links limits how many client pages are read', async () => {
  const out = join(tmp, 'limit.json');
  const r = await run([join(FIX, 'comp-a.html'), '--keyword', 'celebration cakes', '--site', site.origin, '--max-links', '2', '--delay', '0', '--out', out]);
  assert.equal(r.code, 0, r.stderr);
  const s = JSON.parse(readFileSync(out, 'utf8')).site;
  assert.equal(s.pagesRead, 2);
});

test('compare-pages writes to .powerup/briefs by default', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'powerup-brief-default-'));
  const r = await run([join(FIX, 'comp-b.html'), '--keyword', KEYWORD], { cwd });
  assert.equal(r.code, 0, r.stderr);
  const { fullData } = JSON.parse(r.stdout);
  assert.match(fullData, /research-wedding-cakes-dubai-\d{4}-\d{2}-\d{2}\.json$/);
  assert.ok(existsSync(join(cwd, fullData)));
});

test('compare-pages gives clean errors for bad input', async () => {
  const noArgs = await run([]);
  assert.equal(noArgs.code, 1);
  assert.match(noArgs.stderr, /Usage: node compare-pages\.mjs/);

  const missing = await run(['no-such-page.html', '--keyword', KEYWORD]);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /Not a URL or an existing file: no-such-page\.html/);

  const siteNoKeyword = await run([join(FIX, 'comp-a.html'), '--site', 'https://client.example']);
  assert.equal(siteNoKeyword.code, 1);
  assert.match(siteNoKeyword.stderr, /--site needs --keyword/);

  const emptyKeyword = await run([join(FIX, 'comp-a.html'), '--keyword']);
  assert.equal(emptyKeyword.code, 1);
  assert.match(emptyKeyword.stderr, /--keyword needs a value/);

  // A closed port: nothing can be fetched, so the error explains the saved-file fallback.
  const port = await new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
  const offline = await run([`http://127.0.0.1:${port}/page`, '--delay', '0']);
  assert.equal(offline.code, 1);
  assert.match(offline.stderr, /No page could be analysed/);
  assert.match(offline.stderr, /save each one as \.html or \.md/);

  for (const res of [noArgs, missing, siteNoKeyword, emptyKeyword, offline]) {
    assert.ok(!/\n\s+at .+:\d+:\d+/.test(res.stderr), `no stack trace expected:\n${res.stderr}`);
    assert.equal(res.stdout, '');
  }
});
