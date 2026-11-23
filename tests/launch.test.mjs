// Tests for the launch skill's launch-check.mjs.
// Two tiny local websites: a "staging" site full of classic launch mistakes, and a
// "ready" site that should pass (apart from one wrong row in the redirect map).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(root, 'plugins', 'powerup-agency', 'skills', 'launch', 'scripts', 'launch-check.mjs');
const FIXTURES = join(root, 'tests', 'fixtures', 'launch');
let staging;
let ready;
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

function serve(handler) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => handler(req, res, `http://${req.headers.host}`));
    server.listen(0, '127.0.0.1', () => {
      resolve({ origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

const html = (res, body, headers = {}) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers });
  res.end(body);
};

// --- Staging site: everything that goes wrong at launch ----------------------
function stagingSite(req, res) {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/robots.txt') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('User-agent: *\nDisallow: /\n');
  }
  if (path === '/sitemap.xml') {
    res.writeHead(200, { 'content-type': 'application/xml' });
    return res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>https://acme.webflow.io/</loc></url>\n<url><loc>https://acme.webflow.io/about</loc></url>\n</urlset>\n');
  }
  if (path === '/') {
    return html(res, `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Home | My Site</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="https://acme.webflow.io/">
<meta property="og:url" content="https://acme.webflow.io/">
</head><body>
<nav><a href="/">Home</a> <a href="/about">About</a> <a href="https://acme.webflow.io/contact">Contact</a></nav>
<h1>Acme Bakery</h1>
<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Fresh cakes every morning.</p>
<img src="https://acme.webflow.io/images/hero.jpg" alt="Cakes">
</body></html>`);
  }
  if (path === '/about') {
    return html(res, `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>About Acme Bakery</title>
<link rel="canonical" href="https://acme.webflow.io/about">
</head><body><a href="/">Home</a><h1>About us</h1><p>A family bakery since 1998.</p></body></html>`, { 'x-robots-tag': 'noindex' });
  }
  // Unknown paths answer 200: a soft 404.
  return html(res, '<!doctype html><html lang="en"><head><title>Page</title></head><body><h1>Page</h1></body></html>');
}

// --- Ready site: what a good launch looks like --------------------------------
const PAGES = {
  '/': ['Acme Bakery — Fresh cakes in Dubai Marina', '<h1>Fresh cakes in Dubai Marina</h1><p>Birthday and wedding cakes, baked every morning.</p>'],
  '/about': ['About Acme Bakery — family bakers since 1998', '<h1>About us</h1><p>A family bakery since 1998.</p>'],
  '/services': ['Cakes and catering — Acme Bakery', '<h1>Cakes and catering</h1><p>Wedding cakes, birthday cakes, office catering.</p>'],
  '/blog': ['Baking blog — Acme Bakery', '<h1>Blog</h1><p>Recipes and news from the bakery.</p>'],
  '/privacy': ['Privacy policy — Acme Bakery', '<h1>Privacy policy</h1><p>How we handle your data.</p>'],
  '/contact': ['Contact Acme Bakery — order a cake', `<h1>Contact</h1>
<form id="contact-form" name="contact-form" data-name="Contact Form" method="post" action="/thanks">
<input type="text" name="name"><input type="email" name="email" placeholder="you@example.com"><textarea name="message"></textarea>
<div class="cf-turnstile" data-sitekey="test-site-key"></div><input type="submit" value="Send"></form>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`],
};
function readyPage(origin, path) {
  const [title, body] = PAGES[path];
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="Family bakery in Dubai Marina: birthday cakes, wedding cakes and fresh bread, baked every morning. Order online for pick-up.">
<link rel="canonical" href="${origin}${path}">
<meta property="og:url" content="${origin}${path}">
<meta property="og:image" content="${origin}/og.png">
<link rel="icon" href="/favicon.ico">
<script id="Cookiebot" src="https://consent.cookiebot.com/uc.js" data-cbid="test-id"></script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST12345"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-TEST12345');</script>
</head><body>
<nav><a href="/">Home</a> <a href="/about">About</a> <a href="/services">Services</a> <a href="/blog">Blog</a> <a href="/contact">Contact</a></nav>
${body}
<footer><a href="/privacy">Privacy policy</a> <a href="/admin/">Staff login</a></footer>
</body></html>`;
}
function readySite(req, res, origin) {
  const path = new URL(req.url, 'http://x').pathname;
  const security = { 'x-content-type-options': 'nosniff', 'x-frame-options': 'SAMEORIGIN' };
  const redirects = { '/old-about': [301, '/about'], '/old-services': [308, '/services'], '/old-blog': [301, '/'] };
  if (redirects[path]) {
    res.writeHead(redirects[path][0], { location: redirects[path][1] });
    return res.end();
  }
  if (path === '/robots.txt') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end(`User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${origin}/sitemap.xml\n`);
  }
  if (path === '/sitemap.xml') {
    res.writeHead(200, { 'content-type': 'application/xml' });
    const urls = Object.keys(PAGES).map((p) => `<url><loc>${origin}${p}</loc></url>`).join('\n');
    return res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  }
  if (path === '/favicon.ico' || path === '/og.png') {
    res.writeHead(200, { 'content-type': path.endsWith('.png') ? 'image/png' : 'image/x-icon' });
    return res.end('img');
  }
  if (PAGES[path]) return html(res, readyPage(origin, path), security);
  res.writeHead(404, { 'content-type': 'text/html', ...security });
  return res.end('<!doctype html><title>Not found</title><h1>Not found</h1>');
}

before(async () => {
  staging = await serve(stagingSite);
  ready = await serve(readySite);
  tmp = mkdtempSync(join(tmpdir(), 'powerup-launch-'));
});
after(async () => {
  await staging.close();
  await ready.close();
});

const ids = (list) => list.map((c) => (typeof c === 'string' ? c : c.id));

test('staging site after launch (post) is a no-go with the classic launch fails', async () => {
  const out = join(tmp, 'staging-post.json');
  const r = await run([`${staging.origin}/`, '--phase', 'post', '--delay', '0', '--out', out]);
  assert.equal(r.code, 0, r.stderr);
  const s = JSON.parse(r.stdout);
  assert.equal(s.verdict, 'no-go');
  const fails = ids(s.fails);
  for (const id of ['robots-txt', 'noindex', 'staging-leftovers', 'canonical', 'sitemap', 'not-found', 'placeholder-content']) {
    assert.ok(fails.includes(id), `expected fail ${id}; got ${fails.join(', ')}`);
  }
  assert.ok(ids(s.warns).includes('analytics'), 'no analytics should warn');
  assert.ok(ids(s.warns).includes('legal-pages'), 'no privacy link should warn');

  const report = JSON.parse(readFileSync(out, 'utf8'));
  const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
  // https and www/non-www can't be tested on a local address.
  assert.equal(byId.https.status, 'info');
  assert.match(byId.https.evidence, /not tested/i);
  assert.equal(byId.host.status, 'info');
  // noindex from the meta tag (home) and from the X-Robots-Tag header (/about).
  const noindexPages = byId.noindex.pages.map((p) => `${p.url} ${p.detail}`).join('\n');
  assert.match(noindexPages, /\/ meta robots/);
  assert.match(noindexPages, /\/about X-Robots-Tag/);
  // Staging host found in canonical, og:url, links, assets and the sitemap.
  const contexts = byId['staging-leftovers'].pages.map((p) => p.detail.split(': ')[0]);
  for (const c of ['canonical', 'og:url', 'link', 'asset', 'sitemap']) assert.ok(contexts.includes(c), `staging ref in ${c}`);
  assert.deepEqual(byId['staging-leftovers'].hosts, ['acme.webflow.io']);
  assert.match(byId['placeholder-content'].evidence, /lorem ipsum/);
  assert.match(byId['placeholder-content'].evidence, /default page title/);
  assert.match(byId['not-found'].evidence, /soft 404/);
  assert.equal(byId['broken-links'].status, 'info', 'broken links cannot be trusted on a soft-404 site');
  assert.match(report.meta.robotsNote, /blocks the whole site/);
});

test('staging site before launch (pre): robots and noindex become warnings', async () => {
  const out = join(tmp, 'staging-pre.json');
  const r = await run([`${staging.origin}/`, '--phase', 'pre', '--delay', '0', '--out', out]);
  assert.equal(r.code, 0, r.stderr);
  const s = JSON.parse(r.stdout);
  const warns = ids(s.warns);
  for (const id of ['robots-txt', 'noindex', 'staging-leftovers', 'canonical']) assert.ok(warns.includes(id), `expected warn ${id}; got ${warns.join(', ')}`);
  assert.ok(!ids(s.fails).includes('robots-txt'));
  assert.ok(!ids(s.fails).includes('noindex'));
  // Placeholder text and soft 404s are blockers in any phase.
  assert.ok(ids(s.fails).includes('placeholder-content'));
  assert.equal(s.verdict, 'no-go');
  const robots = s.warns.find((w) => w.id === 'robots-txt');
  assert.match(robots.fix, /Remove "Disallow: \/" at launch/);
});

test('ready site after launch: go-with-warnings, wrong redirect row reported', async () => {
  const r = await run([`${ready.origin}/`, '--phase', 'post', '--delay', '0', '--redirects', join(FIXTURES, 'redirects.csv')]);
  assert.equal(r.code, 0, r.stderr);
  const s = JSON.parse(r.stdout);
  assert.ok(['go', 'go-with-warnings'].includes(s.verdict), `verdict ${s.verdict}; fails: ${JSON.stringify(s.fails, null, 1)}`);
  assert.equal(s.counts.fail, 0);
  for (const id of ['reachable', 'robots-txt', 'noindex', 'staging-leftovers', 'canonical', 'sitemap', 'broken-links', 'not-found', 'placeholder-content', 'analytics', 'favicon', 'og-image', 'home-basics']) {
    assert.ok(s.pass.includes(id), `expected pass ${id}; pass: ${s.pass.join(', ')}`);
  }
  const redirects = s.warns.find((w) => w.id === 'redirects');
  assert.ok(redirects, 'the wrong redirect row should warn');
  assert.match(redirects.evidence, /2 of 3 redirects/);
  assert.equal(redirects.pages.length, 1);
  assert.match(redirects.pages[0], /old-blog — wrong-target/);

  const info = Object.fromEntries(s.info.map((c) => [c.id, c.evidence]));
  assert.match(info.https, /not tested/i);
  assert.match(info.host, /not tested/i);
  assert.match(info.consent, /Cookiebot/);
  assert.match(info['legal-pages'], /privacy policy/);
  assert.match(info.forms, /Cloudflare Turnstile/);

  // Default report path under .powerup/reports/ in the working folder.
  assert.match(s.fullReport, /launch-127-0-0-1-\d{4}-\d{2}-\d{2}\.json$/);
  const report = JSON.parse(readFileSync(join(tmp, s.fullReport), 'utf8'));
  assert.ok(report.meta.skippedByRobots.some((u) => u.endsWith('/admin/')), 'robots.txt Disallow must be respected');
  const blog = report.redirects.find((x) => x.old === '/old-blog');
  assert.deepEqual(blog.problems, ['wrong-target']);
  assert.ok(report.redirects.filter((x) => !x.problems.length).length === 2);
  const analytics = report.checks.find((c) => c.id === 'analytics');
  assert.match(analytics.evidence, /Google Analytics 4 found \(G-TEST12345\)/);
  // The form's placeholder="you@example.com" attribute is not placeholder content.
  assert.ok(!report.pages.some((p) => (p.placeholders || []).length));
});

test('redirect map without a header, with full URLs and a bad row', async () => {
  const csv = join(tmp, 'map.csv');
  writeFileSync(csv, `${ready.origin}/old-about;${ready.origin}/about\n/old-services;/services\nnot a row\n`);
  const r = await run([`${ready.origin}/`, '--phase', 'post', '--delay', '0', '--max', '1', '--redirects', csv, '--out', join(tmp, 'map.json')]);
  assert.equal(r.code, 0, r.stderr);
  const report = JSON.parse(readFileSync(join(tmp, 'map.json'), 'utf8'));
  assert.equal(report.redirects.length, 2);
  assert.ok(report.redirects.every((x) => !x.problems.length));
  const check = report.checks.find((c) => c.id === 'redirects');
  assert.equal(check.status, 'warn');
  assert.match(check.evidence, /1 row could not be read \(lines 3\)/);
});

test('clean errors on bad input', async () => {
  let r = await run([]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Usage: node launch-check\.mjs/);

  r = await run([join(FIXTURES, 'redirects.csv')]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Local files are not supported/);

  const page = join(tmp, 'index.html');
  writeFileSync(page, '<!doctype html><title>x</title>');
  r = await run([page]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /needs real HTTP/);

  r = await run(['example.com']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Not a URL/);

  r = await run([`${ready.origin}/`, '--phase', 'later']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--phase must be/);

  r = await run([`${ready.origin}/`, '--redirects', join(tmp, 'missing.csv')]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Redirect map not found/);

  r = await run(['http://127.0.0.1:9/']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Could not reach/);
  assert.ok(!/at .*\.mjs:\d+/.test(r.stderr), 'no stack trace');
});
