// Tests for the redirect-map skill: matching tiers, the never-homepage rule, priority
// sorting, map checks, every export format, and live verification against a tiny
// local server (no real internet).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(root, 'plugins', 'powerup-seo', 'skills', 'redirect-map', 'scripts', 'redirect-map.mjs');
const FIX = join(root, 'tests', 'fixtures', 'redirect-map');
let tmp;
let server;
let origin;
const requested = [];

function run(args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd: opts.cwd || tmp, env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.stdin.end();
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function runJson(args, opts) {
  const r = await run(args, opts);
  assert.equal(r.code, 0, r.stderr);
  return JSON.parse(r.stdout);
}

/** Minimal CSV reader for checking the files the script writes. */
function readCsv(file) {
  const text = readFileSync(file, 'utf8');
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

function lines(file) {
  return readFileSync(file, 'utf8').split('\n');
}

const html = (title, h1 = title) => `<!doctype html><html><head><title>${title}</title></head><body><h1>${h1}</h1><p>Text</p></body></html>`;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'powerup-redirects-'));
  const pages = {
    '/old/our-story-so-far': html('The Crumb story: family bakers since 1998 | Crumb &amp; Co', 'Our story'),
    '/old/red-velvet': html('Red velvet | Crumb &amp; Co'),
    '/private/hidden-page': html('Hidden'),
    '/t/about-crumb': html('The Crumb story: family bakers since 1998 | Crumb &amp; Co', 'About us'),
    '/t/red-velvet': html('Red velvet cake | Crumb &amp; Co'),
    '/t/contact': html('Contact us | Crumb &amp; Co'),
    '/new-a': html('A'), '/new-b': html('B'), '/new-c': html('C'), '/new-d': html('D'),
    '/new-f/': html('F'), '/kept': html('Kept'), '/wrong': html('Wrong'), '/old-h': html('Still here'),
  };
  const redirects = {
    '/old-a': [301, '/new-a'], '/old-b': [302, '/new-b'], '/old-c': [301, '/mid-c'], '/mid-c': [301, '/new-c'],
    '/old-d': [301, '/d1'], '/d1': [301, '/d2'], '/d2': [301, '/new-d'], '/old-e': [301, '/wrong'],
    '/old-f': [308, '/new-f/'], '/old-g': [301, '/new-g'],
  };
  server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    requested.push(url.pathname);
    const here = `http://${req.headers.host}`;
    if (url.pathname === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end(`User-agent: *\nDisallow: /private/\nSitemap: ${here}/sitemap.xml\n`);
    }
    if (url.pathname === '/sitemap.xml') {
      res.writeHead(200, { 'content-type': 'application/xml' });
      const locs = ['/old/our-story-so-far', '/old/red-velvet', '/private/hidden-page'].map((p) => `<url><loc>${here}${p}</loc></url>`).join('');
      return res.end(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs}</urlset>`);
    }
    if (redirects[url.pathname]) {
      const [code, to] = redirects[url.pathname];
      res.writeHead(code, { location: to });
      return res.end();
    }
    if (url.pathname === '/gone') { res.writeHead(410, { 'content-type': 'text/html' }); return res.end('Gone'); }
    if (pages[url.pathname]) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(req.method === 'HEAD' ? undefined : pages[url.pathname]);
    }
    res.writeHead(404, { 'content-type': 'text/html' });
    return res.end('Not found');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
});

// ---------------------------------------------------------------------------
// match
// ---------------------------------------------------------------------------

test('match: every tier, never the homepage for unmatched pages, review rows sorted by priority', async () => {
  const out = join(tmp, 'map.csv');
  const s = await runJson(['match', '--old', join(FIX, 'old-sitemap.xml'), '--new', join(FIX, 'new-urls.txt'),
    '--priority', join(FIX, 'priority-ahrefs.csv'), '--out', out]);
  const rows = readCsv(out);
  const by = Object.fromEntries(rows.map((r) => [r.old, r]));
  assert.deepEqual(Object.keys(rows[0]), ['old', 'new', 'status', 'type', 'confidence', 'priority', 'note']);

  // same-path (after normalising .html, trailing slash, host)
  assert.equal(by['/contact.html'].type, 'same-path');
  assert.equal(by['/contact.html'].new, '/contact');
  assert.match(by['/contact.html'].note, /redirect needed/);
  assert.match(by['/'].note, /no redirect needed/);
  assert.equal(by['/services/'].new, '/services');
  assert.match(by['/services/'].note, /no redirect needed/);
  assert.equal(by['/home'].new, '/', 'old homepage address goes to the new homepage');

  // slug
  assert.equal(by['/cakes/chocolate-fudge-cake.html'].type, 'slug');
  assert.equal(by['/cakes/chocolate-fudge-cake.html'].new, '/shop/chocolate-fudge-cake');
  assert.equal(by['/cakes/chocolate-fudge-cake.html'].confidence, 'high');
  assert.equal(by['/news/summer-menu'].new, '/blog/summer-menu');

  // similar (word overlap with plural stemming; numbers and stopwords dropped)
  assert.equal(by['/cakes/red-velvet-cakes'].type, 'similar');
  assert.equal(by['/cakes/red-velvet-cakes'].new, '/shop/red-velvet-cake');
  assert.equal(by['/cakes/red-velvet-cakes'].confidence, 'medium');
  assert.match(by['/cakes/red-velvet-cakes'].note, /0\.75/);
  assert.equal(by['/blog/2019/10-tips-for-wedding-cakes'].new, '/blog/wedding-cake-tips');
  assert.equal(by['/about-us.html'].new, '/about');

  // review: no guess, parent section suggested, never the homepage
  assert.equal(by['/careers/pastry-chef-vacancy'].type, 'review');
  assert.equal(by['/careers/pastry-chef-vacancy'].new, '');
  assert.match(by['/careers/pastry-chef-vacancy'].note, /410/);
  assert.match(by['/blog/our-bakery-news'].note, /Suggested: \/blog\//);
  for (const r of rows) {
    if (r.type === 'review') assert.equal(r.new, '', `review row ${r.old} must not get a target`);
    if (r.new === '/') assert.ok(['/', '/home'].includes(r.old), `${r.old} must not be sent to the homepage`);
  }

  // priority: added as a column, review rows first and most valuable first
  assert.deepEqual(rows.slice(0, 4).map((r) => r.old), ['/old-promo', '/careers/pastry-chef-vacancy', '/blog/our-bakery-news', '/menu.php?id=7']);
  assert.equal(by['/old-promo'].priority, '25');
  assert.equal(s.priority.column, 'Referring domains');
  assert.equal(s.old.addedFromPriorityFile, 1, 'pages with links that are missing from the sitemap are added');

  // tracking params stripped, assets left out
  assert.ok(by['/menu.php?id=7'], 'utm_source is removed from old URLs');
  assert.ok(!rows.some((r) => r.old.includes('logo.png')));
  assert.equal(s.old.skippedAssets, 1);
  assert.equal(s.counts.review, 4);
  assert.equal(s.review[0].old, '/old-promo');
  assert.equal(s.domainChange, null);
});

test('match: reads a Search Console CSV with BOM and quoted fields', async () => {
  const out = join(tmp, 'gsc-map.csv');
  const s = await runJson(['match', '--old', join(FIX, 'gsc-pages.csv'), '--new', join(FIX, 'new-urls.txt'),
    '--priority', join(FIX, 'gsc-pages.csv'), '--out', out]);
  assert.equal(s.old.source.column, 'Top pages');
  assert.equal(s.old.source.columnFound, true);
  assert.equal(s.old.urls, 3);
  assert.equal(s.priority.column, 'Clicks');
  const by = Object.fromEntries(readCsv(out).map((r) => [r.old, r]));
  assert.equal(by['/cakes/chocolate-fudge-cake.html'].priority, '120');
  assert.equal(by['/cakes/chocolate-fudge-cake.html'].new, '/shop/chocolate-fudge-cake');
});

test('match: domain change writes full URLs on both sides', async () => {
  const out = join(tmp, 'domain-move.csv');
  const s = await runJson(['match', '--old', join(FIX, 'old-sitemap.xml'), '--new', join(FIX, 'new-urls.txt'),
    '--new-domain', 'crumbandco.example', '--out', out]);
  assert.deepEqual(s.domainChange, { from: 'www.crumb.example', to: 'crumbandco.example' });
  const by = Object.fromEntries(readCsv(out).map((r) => [r.old, r]));
  assert.equal(by['https://www.crumb.example/contact.html'].new, 'https://crumbandco.example/contact');
  assert.match(by['https://www.crumb.example/'].note, /domain-level redirect/);
});

test('match --fetch-titles: finds a match by page title, respects robots.txt', async () => {
  const newList = join(tmp, 'title-new.txt');
  writeFileSync(newList, ['/t/about-crumb', '/t/red-velvet', '/t/contact'].map((p) => `${origin}${p}`).join('\n'));
  const out = join(tmp, 'title-map.csv');
  const s = await runJson(['match', '--old', `${origin}/`, '--new', newList, '--fetch-titles', '--out', out]);
  assert.equal(s.old.source.type, 'site', 'sitemap found through robots.txt');
  const by = Object.fromEntries(readCsv(out).map((r) => [r.old, r]));
  assert.equal(by['/old/red-velvet'].type, 'slug');
  assert.equal(by['/old/our-story-so-far'].type, 'title');
  assert.equal(by['/old/our-story-so-far'].new, '/t/about-crumb');
  assert.equal(by['/private/hidden-page'].type, 'review');
  assert.equal(s.titles.blockedByRobots, 1);
  assert.ok(!requested.includes('/private/hidden-page'), 'robots.txt Disallow must be respected');
});

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------

test('check: finds chains (with flattened target), loops, duplicates and other problems', async () => {
  const map = join(tmp, 'problem-map.csv');
  copyFileSync(join(FIX, 'problem-map.csv'), map);
  const s = await runJson(['check', map, '--new', join(FIX, 'problem-new-urls.txt')]);
  const f = Object.fromEntries(s.findings.map((x) => [x.id, x]));
  assert.equal(s.clean, false);

  assert.equal(f.chain.status, 'fail');
  const flat = Object.fromEntries(f.chain.flattened.map((c) => [c.old, c]));
  assert.equal(flat['/a'].finalTarget, '/c');
  assert.equal(flat['/x1'].finalTarget, '/x4');
  assert.equal(flat['/x1'].hops, 3);
  assert.equal(f.loop.count, 1);
  assert.match(f.loop.examples[0], /\/loop1 → \/loop2 → \/loop1/);
  assert.match(f['chain-to-gone'].examples[0], /\/to-gone/);
  assert.match(f['duplicate-source'].examples[0], /\/dup/);
  assert.match(f['duplicate-row'].examples[0], /\/copy/);
  assert.match(f['self-redirect'].examples[0], /\/same → \/same/);
  assert.equal(f.unchanged.status, 'info', 'same-path rows are not self-redirects');
  assert.match(f['empty-target'].examples[0], /\/empty/);
  assert.equal(f['homepage-redirects'].status, 'fail');
  assert.equal(f['homepage-redirects'].count, 3);
  assert.match(f['query-in-source'].examples[0], /product\.php\?id=7/);
  assert.match(f['case-only'].examples[0], /About-Us/);
  assert.match(f['trailing-slash-only'].examples[0], /\/team\//);
  assert.match(f['external-target'].examples[0], /partner\.example/);
  assert.match(f['temporary-redirect'].examples[0], /\/temp/);
  assert.match(f['invalid-status'].examples[0], /bad-status/);
  assert.match(f['gone-with-target'].examples[0], /gone-target/);
  assert.equal(f['target-missing'].count, 1);
  assert.match(f['target-missing'].examples[0], /does-not-exist/);
  assert.match(f['target-form-differs'].examples[0], /\/contact\//);
  assert.match(f['pattern-suggestion'].examples[0], /\/news\/\* → \/journal\/\* covers 3 rows \(1 other row/);
  assert.equal(s.findings[0].status, 'fail', 'failures are listed first');
  assert.ok(JSON.parse(readFileSync(s.fullReport, 'utf8')).findings.length >= 15);
});

test('check --fix flattens chains and removes duplicate rows', async () => {
  const map = join(tmp, 'problem-map-fix.csv');
  copyFileSync(join(FIX, 'problem-map.csv'), map);
  const fixed = join(tmp, 'fixed.csv');
  const s = await runJson(['check', map, '--fix', '--out', fixed]);
  assert.deepEqual(s.fixed, { file: fixed, chainsFlattened: 3, duplicateRowsRemoved: 1 });
  const by = new Map(readCsv(fixed).map((r) => [r.old, r]));
  assert.equal(by.get('/a').new, '/c');
  assert.equal(by.get('/x1').new, '/x4');
  assert.match(by.get('/a').note, /Chain flattened \(was \/b\)/);
  assert.ok(!s.findings.some((x) => x.id === 'chain'));
  assert.ok(s.findings.some((x) => x.id === 'loop'), 'loops are not auto-fixed');
});

test('check: a domain move is not flagged as external or unchanged', async () => {
  const s = await runJson(['check', join(FIX, 'domain-map.csv'), '--report', join(tmp, 'domain-map-check.json')]);
  assert.equal(s.clean, true);
  assert.equal(s.stats.redirects, 2);
  assert.ok(!s.findings.some((x) => x.id === 'external-target'));
});

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

async function exportMap(format, extra = []) {
  const out = join(tmp, `export-${format}.out`);
  const s = await runJson(['export', join(FIX, 'export-map.csv'), '--format', format, '--out', out, ...extra]);
  return { s, out };
}

test('export netlify', async () => {
  const { s, out } = await exportMap('netlify');
  const l = lines(out);
  const rule = (a, b, c) => l.some((x) => new RegExp(`^${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+${c}$`).test(x));
  assert.ok(rule('/about-us.html', '/about', '301'));
  assert.ok(rule('/our%20menu', '/menu', '301'), 'spaces are percent-encoded');
  assert.ok(rule('/offers/summer,sale', '/offers/summer-sale', '301'));
  assert.ok(rule('/temp-offer', '/offers', '302'));
  assert.ok(rule('/blog/caf%C3%A9-news', '/blog/cafe-news', '301'));
  assert.ok(l.some((x) => x.startsWith('# 410 /old-gone')));
  assert.ok(l.some((x) => x.startsWith('# Query-string URL') && x.includes('/product.php?id=7')));
  assert.ok(!l.some((x) => /^\/services\s/.test(x)), 'unchanged rows are skipped');
  assert.ok(!l.some((x) => x.includes('still-deciding')), 'rows without a target are skipped');
  assert.equal(s.rules, 6);
  assert.equal(s.unchangedSkipped, 1);
  assert.match(s.whereToUse, /_redirects/);
});

test('export vercel and next (escaping, query matching, permanent)', async () => {
  const v = await exportMap('vercel');
  const json = JSON.parse(readFileSync(v.out, 'utf8'));
  const bySource = Object.fromEntries(json.redirects.map((r) => [r.source, r]));
  assert.deepEqual(bySource['/about-us.html'], { source: '/about-us.html', destination: '/about', permanent: true });
  assert.ok(bySource['/english\\(default\\)/menu'], 'path-to-regexp characters are escaped');
  assert.deepEqual(bySource['/product.php'].has, [{ type: 'query', key: 'id', value: '7' }]);
  assert.equal(bySource['/temp-offer'].permanent, false);
  assert.equal(json.redirects.length, 7);
  assert.ok(v.s.skipped.examples.some((x) => x.old === '/old-gone'), '410 cannot be a Vercel redirect');

  const n = await exportMap('next');
  const out = join(tmp, 'next.config.cjs');
  copyFileSync(n.out, out);
  const mod = await import(pathToFileURL(out).href);
  const list = await mod.default.redirects();
  assert.deepEqual(list, json.redirects, 'next.config.js redirects() returns the same rules');
});

test('export apache', async () => {
  const { s, out } = await exportMap('apache');
  const l = lines(out);
  for (const expected of [
    'RewriteRule ^about-us\\.html$ /about [R=301,L]',
    'RewriteRule ^our\\smenu/?$ /menu [R=301,L]',
    'RewriteRule ^offers/summer,sale/?$ /offers/summer-sale [R=301,L]',
    'RewriteRule ^english\\(default\\)/menu/?$ /en/menu [R=301,L]',
    'RewriteRule ^old-gone/?$ - [G,L]',
    'RewriteCond %{QUERY_STRING} ^id=7$',
    'RewriteRule ^product\\.php$ /shop/lemon-cake [QSD,R=301,L]',
    'RewriteRule ^temp-offer/?$ /offers [R=302,L]',
  ]) assert.ok(l.includes(expected), `missing: ${expected}`);
  assert.equal(l[l.indexOf('RewriteCond %{QUERY_STRING} ^id=7$') + 1], 'RewriteRule ^product\\.php$ /shop/lemon-cake [QSD,R=301,L]');
  assert.ok(l.includes('<IfModule mod_rewrite.c>') && l.includes('</IfModule>'));
  assert.equal(s.gone, 1);
});

test('export nginx', async () => {
  const { out } = await exportMap('nginx');
  const l = lines(out);
  for (const expected of [
    'location = /about-us.html { return 301 /about; }',
    'location = "/our menu" { return 301 /menu; }',
    'location = /old-gone { return 410; }',
    'location = /temp-offer { return 302 /offers; }',
    'if ($request_uri = "/product.php?id=7") { return 301 /shop/lemon-cake; }',
  ]) assert.ok(l.includes(expected), `missing: ${expected}`);
});

test('export cloudflare (no header, host in source, quoted commas)', async () => {
  const bad = await run(['export', join(FIX, 'export-map.csv'), '--format', 'cloudflare', '--out', join(tmp, 'cf-bad.csv')]);
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /--old-domain/);
  const { s, out } = await exportMap('cloudflare', ['--old-domain', 'www.crumb.example']);
  const l = lines(out).filter(Boolean);
  assert.equal(l[0], 'www.crumb.example/about-us.html,https://www.crumb.example/about,301,TRUE,FALSE,FALSE,FALSE');
  assert.ok(l.includes('"www.crumb.example/offers/summer,sale",https://www.crumb.example/offers/summer-sale,301,TRUE,FALSE,FALSE,FALSE'));
  assert.ok(l.includes('www.crumb.example/temp-offer,https://www.crumb.example/offers,302,TRUE,FALSE,FALSE,FALSE'));
  assert.ok(!l.some((x) => x.includes('product.php') || x.includes('old-gone')));
  assert.equal(s.rules, 6);
});

test('export shopify, wordpress, webflow, framer and csv', async () => {
  const shop = lines((await exportMap('shopify')).out);
  assert.equal(shop[0], 'Redirect from,Redirect to');
  assert.ok(shop.includes('/about-us.html,/about'));
  assert.ok(shop.includes('"/offers/summer,sale",/offers/summer-sale'));
  assert.ok(!shop.some((x) => x.includes('old-gone')));

  const wp = lines((await exportMap('wordpress')).out);
  assert.equal(wp[0], '/about-us.html,/about,0,301', 'Redirection CSV has no header row');
  assert.ok(wp.includes('"/offers/summer,sale",/offers/summer-sale,0,301'));
  assert.ok(wp.includes('/product.php?id=7,/shop/lemon-cake,0,301'));
  assert.ok(wp.includes('/temp-offer,/offers,0,302'));

  const wf = await exportMap('webflow');
  const wfl = lines(wf.out);
  assert.equal(wfl[0], 'source,target');
  assert.ok(wfl.includes('/about-us.html,/about'));
  assert.ok(!wfl.some((x) => x.includes('english(')), 'Webflow pattern characters are left for a manual rule');
  assert.match(wf.s.whereToUse, /Publishing → 301 redirects/);

  const fr = await exportMap('framer');
  assert.equal(lines(fr.out)[0], 'Old path,New path');
  assert.match(fr.s.whereToUse, /Redirects/);

  const csv = lines((await exportMap('csv')).out);
  assert.equal(csv[0], 'old,new,status');
  assert.ok(csv.includes('/old-gone,,410'));
  assert.ok(csv.includes('"/offers/summer,sale",/offers/summer-sale,301'));
});

test('export: a domain move uses host-scoped rules and gives a host-level rule', async () => {
  const out = join(tmp, 'domain-netlify');
  const s = await runJson(['export', join(FIX, 'domain-map.csv'), '--format', 'netlify', '--out', out]);
  const l = lines(out);
  assert.ok(l.some((x) => /^https:\/\/old\.example\/about-us\s+https:\/\/new\.example\/about\s+301!$/.test(x)));
  assert.ok(l.some((x) => /^https:\/\/old\.example\/contact\s+https:\/\/new\.example\/contact\s+301!$/.test(x)), 'same-path rows are needed on a domain move');
  assert.match(s.hostRule, /^https:\/\/old\.example\/\* https:\/\/new\.example\/:splat 301!/);
  const shop = await runJson(['export', join(FIX, 'domain-map.csv'), '--format', 'shopify', '--out', join(tmp, 'domain-shop.csv')]);
  assert.equal(shop.rules, 1);
  assert.ok(shop.skipped.examples.some((x) => /domain-level redirect/.test(x.reason)));
});

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

test('verify checks the live redirects', async () => {
  const out = join(tmp, 'verify.json');
  const s = await runJson(['verify', join(FIX, 'verify-map.csv'), '--base', origin, '--delay', '0', '--out', out]);
  const report = JSON.parse(readFileSync(out, 'utf8'));
  const by = Object.fromEntries(report.results.map((r) => [new URL(r.old).pathname, r]));
  assert.equal(by['/old-a'].status, 'pass');
  assert.equal(by['/old-b'].status, 'warn');
  assert.match(by['/old-b'].problems.join(' '), /temporary/);
  assert.equal(by['/old-c'].status, 'warn');
  assert.match(by['/old-c'].problems.join(' '), /chain/);
  assert.equal(by['/old-d'].status, 'fail');
  assert.equal(by['/old-d'].hops, 3);
  assert.equal(by['/old-e'].status, 'fail');
  assert.match(by['/old-e'].problems.join(' '), /expected/);
  assert.equal(by['/gone'].status, 'pass');
  assert.equal(by['/gone-404'].status, 'pass');
  assert.equal(by['/old-f'].status, 'pass', '308 to the target with a trailing slash is fine');
  assert.equal(by['/old-g'].status, 'fail');
  assert.match(by['/old-g'].problems.join(' '), /404/);
  assert.equal(by['/old-h'].status, 'fail');
  assert.match(by['/old-h'].problems.join(' '), /no redirect/);
  assert.equal(by['/kept'].status, 'pass');
  assert.deepEqual({ pass: s.pass, warn: s.warn, fail: s.fail }, { pass: 5, warn: 2, fail: 4 });
  assert.equal(s.verdict, 'fail');
  assert.equal(s.problems[0].status, 'fail', 'failures first');
});

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

test('clean errors on bad input', async () => {
  const cases = [
    [[], /Usage/],
    [['dance'], /Unknown command/],
    [['match', '--old', join(FIX, 'old-sitemap.xml')], /Missing --new/],
    [['match', '--old', join(tmp, 'nope.xml'), '--new', join(FIX, 'new-urls.txt')], /file not found/],
    [['match', '--old', join(FIX, '..', 'psi-sample.json'), '--new', join(FIX, 'new-urls.txt')], /unsupported file type/],
    [['check', join(FIX, 'new-urls.txt')], /"old" and "new" columns/],
    [['export', join(FIX, 'export-map.csv'), '--format', 'squarespace'], /Unknown format/],
    [['verify', join(FIX, 'verify-map.csv')], /--base/],
  ];
  for (const [argv, re] of cases) {
    const r = await run(argv);
    assert.equal(r.code, 1, `${argv.join(' ')} should fail`);
    assert.match(r.stderr, re);
    assert.doesNotMatch(r.stderr, /\n\s+at /, 'no stack traces');
  }
});
