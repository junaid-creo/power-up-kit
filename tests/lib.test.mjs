import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeHtml, contrastRatio, decodeEntities, normalizeUrl, parseArgs, parseColor, parseRobots, parseSitemap,
  robotsAllows, robotsBlocksEverything, slugify, toHex, wcagRating, deltaE, linkStatus,
} from '../shared/powerup-lib.mjs';

test('parseArgs handles flags, values and booleans', () => {
  const a = parseArgs(['https://x.com', '--max', '20', '--out=r.json', '--summary', '--links', '5'], { booleans: ['summary'] });
  assert.deepEqual(a._, ['https://x.com']);
  assert.equal(a.max, '20');
  assert.equal(a.out, 'r.json');
  assert.equal(a.summary, true);
  assert.equal(a.links, '5');
});

test('decodeEntities', () => {
  assert.equal(decodeEntities('Crumb &amp; Co &#8212; &#x2713; &nbsp;x'), 'Crumb & Co — ✓  x');
});

test('analyzeHtml extracts SEO data', () => {
  const html = `<!doctype html><html lang="en"><head>
    <title> Hello &amp; welcome </title>
    <meta name="description" content="Desc">
    <meta name="robots" content="noindex">
    <link rel="canonical" href="/home">
    <meta property="og:image" content="http://cdn.example.com/a.png">
    <script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":["WebSite","Thing"]}]}</script>
    <script type="application/ld+json">{bad json</script>
    <script>var x = "<h1>not a heading</h1>";</script>
  </head><body>
    <!-- <h1>commented</h1> -->
    <h1>Main <em>title</em></h1><h3>Skip</h3>
    <a href="/about">About us</a> <a href="https://other.com/x" rel="nofollow">Other</a>
    <a href="mailto:a@b.c">mail</a> <a href="#top">top</a>
    <a href="/logo"><img src="/l.png" alt="Logo"></a>
    <img src="/a.jpg"><img src="http://example.com/b.jpg" alt="">
  </body></html>`;
  const a = analyzeHtml(html, 'https://example.com/page');
  assert.equal(a.title, 'Hello & welcome');
  assert.equal(a.lang, 'en');
  assert.equal(a.metaDescription, 'Desc');
  assert.match(a.metaRobots, /noindex/);
  assert.equal(a.canonical, 'https://example.com/home');
  assert.deepEqual(a.h1, ['Main title']);
  assert.equal(a.headings.length, 2);
  assert.equal(a.links.length, 3); // mailto and #top are skipped
  assert.equal(a.links.find((l) => l.href === 'https://example.com/about').internal, true);
  assert.equal(a.links.find((l) => l.href === 'https://other.com/x').nofollow, true);
  assert.equal(a.links.find((l) => l.href === 'https://example.com/logo').text, 'Logo');
  assert.equal(a.images.length, 3);
  assert.equal(a.images.filter((i) => !i.hasAlt).length, 1);
  assert.deepEqual(a.jsonLd[0].types, ['Organization', 'WebSite', 'Thing']);
  assert.equal(a.jsonLd[1].valid, false);
  assert.deepEqual(a.mixedContent, ['http://example.com/b.jpg']);
});

test('robots.txt parsing follows Google rules', () => {
  const r = parseRobots(`User-agent: *\nDisallow: /private/\nAllow: /private/ok.html\nDisallow: /*.pdf$\n\nUser-agent: PowerUpKit\nDisallow: /no-powerup/\nSitemap: https://x.com/sitemap.xml`);
  assert.deepEqual(r.sitemaps, ['https://x.com/sitemap.xml']);
  assert.equal(robotsAllows(r, 'Mozilla', '/private/a.html'), false);
  assert.equal(robotsAllows(r, 'Mozilla', '/private/ok.html'), true);
  assert.equal(robotsAllows(r, 'Mozilla', '/files/a.pdf'), false);
  assert.equal(robotsAllows(r, 'Mozilla', '/files/a.pdf?x=1'), true);
  assert.equal(robotsAllows(r, 'PowerUpKit/0.1.0', '/no-powerup/x'), false);
  assert.equal(robotsAllows(r, 'PowerUpKit/0.1.0', '/private/a.html'), true); // its own group applies
  assert.equal(robotsBlocksEverything(parseRobots('User-agent: *\nDisallow: /')), true);
  assert.equal(robotsBlocksEverything(parseRobots('User-agent: *\nDisallow:')), false);
});

test('sitemap parsing', () => {
  const s = parseSitemap('<sitemapindex><sitemap><loc>https://x.com/a.xml</loc></sitemap></sitemapindex><urlset><url><loc><![CDATA[https://x.com/p?a=1&amp;b=2]]></loc></url></urlset>');
  assert.deepEqual(s.sitemaps, ['https://x.com/a.xml']);
  assert.deepEqual(s.urls, ['https://x.com/p?a=1&b=2']);
});

test('colours and contrast', () => {
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.equal(toHex(parseColor('rgb(194 65 12 / 50%)')), '#c2410c');
  assert.equal(parseColor('rgba(0,0,0,.5)').a, 0.5);
  assert.equal(toHex(parseColor('hsl(0, 100%, 50%)')), '#ff0000');
  assert.equal(parseColor('not-a-colour'), null);
  assert.equal(contrastRatio(parseColor('#000'), parseColor('#fff')), 21);
  assert.equal(wcagRating(4.6), 'AA');
  assert.equal(wcagRating(3.2), 'AA large text only');
  assert.ok(deltaE(parseColor('#c2410c'), parseColor('#c2410d')) < 1);
});

test('linkStatus tells broken links from sites that block bots', () => {
  assert.equal(linkStatus({ url: 'https://example.com/a', status: 200 }), 'ok');
  assert.equal(linkStatus({ url: 'https://example.com/a', status: 301 }), 'ok');
  assert.equal(linkStatus({ url: 'https://www.linkedin.com/in/x', status: 999 }, { external: true }), 'blocked');
  assert.equal(linkStatus({ url: 'https://www.instagram.com/x', status: 429 }, { external: true }), 'blocked');
  assert.equal(linkStatus({ url: 'https://shop.example/private', status: 403 }, { external: true }), 'blocked');
  assert.equal(linkStatus({ url: 'https://example.com/private', status: 403 }), 'broken', 'internal 403 is a real problem');
  assert.equal(linkStatus({ url: 'https://example.com/gone', status: 404 }, { external: true }), 'broken');
  assert.equal(linkStatus({ url: 'https://www.linkedin.com/in/deleted', status: 404 }, { external: true }), 'broken');
  assert.equal(linkStatus({ url: 'https://nope.invalid/', status: 0 }, { external: true }), 'broken');
});

test('normalizeUrl and slugify', () => {
  assert.equal(normalizeUrl('https://x.com?utm_source=a&id=3#top'), 'https://x.com/?id=3');
  assert.equal(slugify('Crumb & Co. Bakery LLC'), 'crumb-co-bakery-llc');
});
