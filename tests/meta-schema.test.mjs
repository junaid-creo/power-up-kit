// Tests for the meta-schema skill: scan (live test site and local files), check (good and bad
// proposals), snippet escaping, pixel-width estimates and clean errors.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSite } from './helpers/server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(root, 'plugins', 'powerup-seo', 'skills', 'meta-schema', 'scripts', 'meta-schema.mjs');
const FIX = join(root, 'tests', 'fixtures', 'meta-schema');
let site;
let tmp;

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd: tmp });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.stdin.end();
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
const ids = (checks, status) => checks.filter((c) => !status || c.status === status).map((c) => c.id);
const find = (checks, id, status) => checks.filter((c) => c.id === id && (!status || c.status === status));

before(async () => {
  site = await startSite();
  tmp = mkdtempSync(join(tmpdir(), 'powerup-meta-'));
});
after(async () => {
  await site.close();
});

test('scan --sitemap finds the meta and schema problems on the test site', async () => {
  const out = join(tmp, 'scan.json');
  const draft = join(tmp, 'draft.json');
  const r = await run(['scan', `${site.origin}/`, '--sitemap', '--delay', '0', '--out', out, '--draft', draft]);
  assert.equal(r.code, 0, r.stderr);
  const summary = JSON.parse(r.stdout);
  assert.equal(summary.pagesScanned, 5);
  assert.ok(summary.skippedByRobots.some((u) => u.includes('/private/')), 'robots.txt Disallow must be respected');
  assert.equal(summary.brand, 'Crumb & Co', 'brand comes from og:site_name');

  const report = JSON.parse(readFileSync(out, 'utf8'));
  const page = (path) => report.pages.find((p) => p.url === `${site.origin}${path}`);
  const home = page('/');
  assert.equal(home.title, 'Crumb & Co — Fresh Cakes in Dubai Marina');
  assert.ok(home.titlePx > 300 && home.titlePx < 580, `title width ${home.titlePx}`);
  assert.deepEqual(home.schema.types, ['Bakery']);
  assert.ok(find(home.checks, 'schema-required', 'fail').some((c) => /address/.test(c.message)), 'Bakery without address must fail');
  assert.equal(home.og.title, 'Crumb & Co');

  const services = page('/services.html');
  assert.equal(find(services.checks, 'schema-parse', 'fail').length, 1, 'broken JSON-LD must fail');
  assert.ok(ids(services.checks, 'fail').includes('title-duplicate'));
  assert.ok(ids(services.checks, 'warn').includes('description-length'));
  assert.ok(ids(page('/about.html').checks, 'warn').includes('description-missing'));
  assert.ok(ids(page('/about.html').checks, 'fail').includes('title-duplicate'));
  assert.ok(ids(page('/blog/post-1.html').checks, 'warn').includes('robots-noindex'));
  assert.ok(ids(page('/orphan.html').checks, 'warn').includes('canonical-missing'));
  assert.ok(report.site.some((s) => s.id === 'brand-suffix-mixed' && s.status === 'warn'), 'mixed "|" and "—" brand suffixes');

  const d = JSON.parse(readFileSync(draft, 'utf8'));
  assert.equal(d.site.name, 'Crumb & Co');
  assert.equal(d.pages.length, 5);
  assert.ok(d.pages[0].schema[0]['@type'] === 'Bakery', 'draft keeps the existing valid schema');
});

test('scan reads local HTML files and folders (Claude app fallback)', async () => {
  const out = join(tmp, 'files.json');
  const r = await run(['scan', FIX, '--base-url', 'https://crumb.example/', '--out', out]);
  assert.equal(r.code, 0, r.stderr);
  const report = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(report.pages.length, 2);
  const broken = report.pages.find((p) => p.url === 'https://crumb.example/broken-jsonld.html');
  const failIds = ids(broken.checks, 'fail');
  for (const id of ['schema-parse', 'og-image-url', 'canonical-url', 'schema-date']) assert.ok(failIds.includes(id), `expected ${id}; got ${failIds}`);
  const warnIds = ids(broken.checks, 'warn');
  for (const id of ['title-caps', 'title-stuffing', 'twitter-card']) assert.ok(warnIds.includes(id), `expected ${id}; got ${warnIds}`);
  assert.equal(broken.twitter.card, 'big_picture', 'twitter tags written with property= are read too');
  const home = report.pages.find((p) => p.url === 'https://crumb.example/');
  assert.equal(home.isHome, true);
  assert.equal(home.verdict, 'pass', JSON.stringify(home.checks.filter((c) => c.status !== 'pass')));

  const single = await run(['scan', join(FIX, 'broken-jsonld.html'), '--out', join(tmp, 'single.json')]);
  assert.equal(single.code, 0, single.stderr);
  assert.match(JSON.parse(single.stdout).pages[0].url, /^file:/);
});

test('check passes a good proposal and writes paste-ready snippets', async () => {
  const out = join(tmp, 'good.json');
  const snippets = join(tmp, 'good-snippets.html');
  const scan = join(tmp, 'before.json');
  writeFileSync(scan, JSON.stringify({ pages: [{ url: 'https://crumb.example/', title: 'Home', description: null, schema: { types: [] } }] }));
  const r = await run(['check', join(FIX, 'proposal-good.json'), '--out', out, '--snippets', snippets, '--compare', scan]);
  assert.equal(r.code, 0, r.stdout);
  const summary = JSON.parse(r.stdout);
  assert.equal(summary.summary.fail, 0, JSON.stringify(summary.pages.map((p) => p.problems)));
  assert.notEqual(summary.verdict, 'fail');
  const report = JSON.parse(readFileSync(out, 'utf8'));
  const home = report.pages[0];
  assert.match(home.snippet, /^<title>Celebration Cakes in Dubai Marina \| Crumb &amp; Co<\/title>/);
  assert.match(home.snippet, /<link rel="canonical" href="https:\/\/crumb\.example\/">/);
  assert.match(home.snippet, /<meta property="og:site_name" content="Crumb &amp; Co">/);
  assert.match(home.snippet, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(home.snippet, /<script type="application\/ld\+json">\n\{[\s\S]*"@graph"[\s\S]*\}\n<\/script>/);
  assert.deepEqual(home.schemaTypes, ['Bakery', 'WebSite']);
  assert.equal(report.changes[0].title.before, 'Home', '--compare gives the old → new values');
  const html = readFileSync(snippets, 'utf8');
  assert.match(html, /&lt;title&gt;Celebration Cakes in Dubai Marina/);
  assert.match(html, /class="serp-title"/);
  assert.ok(existsSync(snippets));
});

test('check catches the planted failures in a bad proposal', async () => {
  const out = join(tmp, 'bad.json');
  const r = await run(['check', join(FIX, 'proposal-bad.json'), '--out', out]);
  assert.equal(r.code, 1, 'any failure gives exit code 1');
  const report = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(report.verdict, 'fail');
  const [home, cakes, blog, workshops] = report.pages;

  assert.ok(find(home.checks, 'schema-required', 'fail').some((c) => /Bakery is missing "address"/.test(c.message)));
  assert.equal(find(home.checks, 'og-image-url', 'fail').length, 1, 'relative og:image');
  assert.equal(find(home.checks, 'schema-self-serving', 'warn').length, 1, 'self-serving AggregateRating');
  assert.ok(ids(home.checks, 'fail').includes('title-duplicate'));
  assert.ok(ids(cakes.checks, 'fail').includes('title-duplicate'));
  assert.ok(report.siteChecks.some((s) => s.id === 'title-duplicate' && s.evidence.length === 2));

  assert.ok(ids(cakes.checks, 'fail').includes('description-placeholder'), 'TODO is a placeholder');
  assert.ok(find(cakes.checks, 'schema-required', 'fail').some((c) => /offers, review, aggregateRating/.test(c.message)), 'Product without offers');

  assert.ok(ids(blog.checks, 'fail').includes('description-placeholder'), 'lorem ipsum is a placeholder');
  const date = find(blog.checks, 'schema-date', 'fail')[0];
  assert.equal(date.evidence.path, '@graph[0].datePublished', 'problems inside @graph are found');
  assert.equal(find(blog.checks, 'schema-url', 'fail')[0].evidence.path, '@graph[1].itemListElement[1].item');
  assert.ok(find(blog.checks, 'schema-required', 'fail').some((c) => c.evidence.path === '@graph[2]' && /address/.test(c.message)));

  assert.ok(ids(workshops.checks, 'fail').includes('title-placeholder'), '[Your …] is a placeholder');
  assert.ok(ids(workshops.checks, 'fail').includes('schema-number'), 'price "AED 250"');
  assert.ok(ids(workshops.checks, 'fail').includes('schema-currency'), 'priceCurrency "Dirham"');
  assert.ok(ids(workshops.checks, 'fail').includes('schema-parse'), 'schema given as a broken JSON string');
});

test('snippets escape quotes in attributes and </script> in JSON-LD', async () => {
  const proposal = join(tmp, 'escape.json');
  writeFileSync(proposal, JSON.stringify({
    site: { name: 'Tom\'s "Best" Bakes', url: 'https://bakes.example/' },
    pages: [{
      url: 'https://bakes.example/',
      title: 'Cakes & "Bakes" <Dubai> | Tom\'s "Best" Bakes',
      description: 'It\'s "fresh" every day: cakes, bread & pastries baked by hand in Dubai Marina. Order today for pickup.',
      og: { image: 'https://bakes.example/og.jpg?w=1200&h=630' },
      schema: [{ '@context': 'https://schema.org', '@type': 'Organization', name: 'Tom\'s Bakes', url: 'https://bakes.example/', logo: 'https://bakes.example/logo.png', description: '</script><script>alert(1)</script>' }],
    }],
  }));
  const out = join(tmp, 'escape-out.json');
  const r = await run(['check', proposal, '--out', out, '--snippets', join(tmp, 'escape.html')]);
  assert.equal(r.code, 0, r.stdout);
  const snippet = JSON.parse(readFileSync(out, 'utf8')).pages[0].snippet;
  assert.match(snippet, /<title>Cakes &amp; "Bakes" &lt;Dubai&gt; \| Tom's "Best" Bakes<\/title>/);
  assert.match(snippet, /content="It&#39;s &quot;fresh&quot; every day/);
  assert.match(snippet, /og\.jpg\?w=1200&amp;h=630/);
  assert.match(snippet, /<\\\/script><script>alert\(1\)<\\\/script>/);
  assert.equal(snippet.match(/<\/script>/g).length, 1, 'only the real closing tag may appear');
  const json = snippet.match(/<script type="application\/ld\+json">\n([\s\S]*)\n<\/script>/)[1];
  assert.equal(JSON.parse(json).description, '</script><script>alert(1)</script>', 'escaped JSON-LD is still valid JSON');
  const viewer = readFileSync(join(tmp, 'escape.html'), 'utf8');
  assert.ok(!viewer.includes('<script>alert(1)'), 'the snippets page shows code, never runs it');
});

test('schema rules: retired FAQ is info only, LocalBusiness subtypes, unknown types', async () => {
  const ctx = 'https://schema.org';
  const proposal = join(tmp, 'rules.json');
  writeFileSync(proposal, JSON.stringify({
    site: { name: 'Crumb & Co', url: 'https://crumb.example/' },
    pages: [{
      url: 'https://crumb.example/faq/',
      title: 'Cake Ordering Questions and Answers | Crumb & Co',
      description: 'How far ahead to order, delivery areas in Dubai Marina, allergies and payment: quick answers to the questions customers ask us most often.',
      og: { image: 'https://crumb.example/og.jpg' },
      schema: [
        { '@context': ctx, '@type': 'FAQPage', mainEntity: [
          { '@type': 'Question', name: 'Do you deliver?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, in Dubai Marina and JLT.' } },
          { '@type': 'Question', name: 'Can I pay by card?' },
        ] },
        { '@context': ctx, '@type': 'VeganBakery', name: 'Crumb & Co Vegan' },
        { '@context': ctx, '@type': 'Organization', name: 'Crumb & Co', url: 'https://crumb.example/', logo: 'https://crumb.example/logo.png', telephone: '+971 4 555 0123', address: { '@type': 'PostalAddress', streetAddress: 'Marina Walk', addressLocality: 'Dubai', addressCountry: 'AE' } },
        { '@context': ctx, '@type': 'Organisation', name: 'Typo Ltd' },
        { '@type': 'WebSite', name: 'Crumb & Co', url: 'https://crumb.example/' },
      ],
    }],
  }));
  const out = join(tmp, 'rules-out.json');
  await run(['check', proposal, '--out', out]);
  const checks = JSON.parse(readFileSync(out, 'utf8')).pages[0].checks;
  const retired = find(checks, 'schema-retired');
  assert.equal(retired.length, 1);
  assert.equal(retired[0].status, 'info');
  assert.match(retired[0].message, /no longer shows FAQ rich results \(since 7 May 2026\)/);
  assert.ok(find(checks, 'schema-required', 'fail').some((c) => c.evidence.path === 'mainEntity[1]' && /acceptedAnswer/.test(c.message)), 'Question without an answer');
  assert.ok(find(checks, 'schema-required', 'fail').some((c) => /VeganBakery is missing "address"/.test(c.message)), 'a type ending in Bakery is a LocalBusiness');
  assert.equal(find(checks, 'schema-local-business', 'info').length, 1, 'Organization with address + telephone is checked as a LocalBusiness');
  assert.ok(find(checks, 'schema-unknown-type', 'info').some((c) => /Organisation/.test(c.message)));
  assert.ok(find(checks, 'schema-context', 'fail').some((c) => c.evidence.block === 5), 'missing @context fails');
});

test('width estimates are sane', async () => {
  const r = await run(['width', 'WWWW', 'iiii', '日本語のタイトル', 'Crème brûlée', 'Creme brulee']);
  assert.equal(r.code, 0, r.stderr);
  const [w, i, ja, accented, plain] = JSON.parse(r.stdout).results;
  assert.ok(w.px > i.px * 3, `WWWW ${w.px} px vs iiii ${i.px} px`);
  assert.equal(w.px, 76, '4 × 944/1000 × 20px');
  assert.equal(ja.chars, 8);
  assert.equal(ja.displayChars, 16, 'wide characters count double');
  assert.equal(ja.px, 160, 'CJK characters are one em wide');
  assert.equal(accented.px, plain.px, 'accents do not change the width');
  const small = await run(['width', 'WWWW', '--font-size', '14']);
  assert.equal(JSON.parse(small.stdout).results[0].px, 53);
});

test('bad input gives a clean error, not a stack trace', async () => {
  const badJson = join(tmp, 'broken.json');
  writeFileSync(badJson, '{ "pages": [ ');
  const cases = [
    [['check', badJson], /not valid JSON/],
    [['check', join(tmp, 'missing.json')], /not found/],
    [['check', join(FIX, 'broken-jsonld.html')], /not valid JSON/],
    [['scan', join(tmp, 'nope.html')], /Not a URL, file or folder/],
    [['scan', 'notes.txt', '--sitemap'], /needs a website address/],
    [['frobnicate'], /Unknown command/],
    [[], /Usage/],
  ];
  writeFileSync(join(tmp, 'empty.json'), '{}');
  cases.push([['check', join(tmp, 'empty.json')], /"pages" list/]);
  for (const [args, re] of cases) {
    const r = await run(args);
    assert.equal(r.code, 2, `${args.join(' ')} → exit ${r.code}`);
    assert.match(r.stderr, re, args.join(' '));
    assert.doesNotMatch(r.stderr, /\n\s+at /, 'no stack trace');
    assert.equal(r.stdout, '');
  }
});
