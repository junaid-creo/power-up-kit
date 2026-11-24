#!/usr/bin/env node
// Power-Up Kit — SEO crawl
//
// Crawls a website politely (respects robots.txt, small concurrency), collects
// on-page SEO data for every page, runs site-wide checks, and scores the site.
// Full data goes to a JSON file; a short summary is printed for Claude to read.
//
// Usage:
//   node seo-crawl.mjs <start-url> [--max 50] [--out report.json] [--csv pages.csv]
//                      [--concurrency 3] [--delay 250] [--no-sitemap]
//
// The crawler identifies itself with a PowerUpKit user agent. Only crawl sites
// you own or have permission to audit.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  USER_AGENT, VERSION, analyzeHtml, checkLink, fetchWithRedirects, isSameSite, isoDate, loadSitemapUrls,
  looksLikePage, mapLimit, normalizeUrl, parseArgs, parseRobots, robotsAllows, robotsBlocksEverything,
  siteKey, slugify, toInt, truncate, fail,
} from './powerup-lib.mjs';

const args = parseArgs(process.argv.slice(2), { booleans: ['no-sitemap'] });
const startInput = args._[0];
if (!startInput || !/^https?:\/\//i.test(startInput)) {
  fail('Usage: node seo-crawl.mjs <https://example.com> [--max 50] [--out file.json] [--csv pages.csv]');
}
const MAX_PAGES = Math.min(toInt(args.max, 50), 2000);
const CONCURRENCY = Math.min(toInt(args.concurrency, 3), 8);
const DELAY = args.delay === undefined ? 250 : Math.max(0, Number(args.delay) || 0);
const started = Date.now();

// ---------------------------------------------------------------------------
// 1. Site-level discovery
// ---------------------------------------------------------------------------
// Follow the start URL's redirects first (e.g. http → https, example.com → www.example.com)
// so the crawl uses the site's real home and doesn't count the homepage twice.
const firstHit = await fetchWithRedirects(normalizeUrl(startInput), { method: 'HEAD', timeoutMs: 15000 });
const startUrl = normalizeUrl(firstHit.status > 0 && /^https?:/.test(firstHit.url) ? firstHit.url : startInput);
const startRedirected = startUrl !== normalizeUrl(startInput);
const origin = new URL(startUrl).origin;

const robotsRes = await fetchWithRedirects(`${origin}/robots.txt`, { timeoutMs: 15000 });
const robotsFound = robotsRes.ok && !/<html/i.test(robotsRes.body || '');
const robots = robotsFound ? parseRobots(robotsRes.body) : { groups: [], sitemaps: [] };

let sitemapInfo = { urls: [], files: [] };
if (!args['no-sitemap']) {
  const candidates = robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  sitemapInfo = await loadSitemapUrls(candidates, { maxFiles: 10, maxUrls: 5000 });
}
const sitemapUrls = [...new Set(sitemapInfo.urls.map(normalizeUrl).filter((u) => isSameSite(u, startUrl)))];
const sitemapSet = new Set(sitemapUrls);

// ---------------------------------------------------------------------------
// 2. Crawl
// ---------------------------------------------------------------------------
const pages = new Map(); // url -> page record
const inlinks = new Map(); // url -> Set(source urls)
const outlinks = new Map(); // url -> Set(target urls)
const analyzedFinal = new Set(); // final URLs already analysed (dedupe redirects)
const queue = [startUrl];
const queued = new Set(queue);
const skippedByRobots = [];
const nonHtml = [];

function enqueue(url) {
  if (queued.has(url) || queued.size >= MAX_PAGES * 4) return;
  queued.add(url);
  queue.push(url);
}
for (const u of sitemapUrls) enqueue(u);

async function crawlOne(url) {
  const u = new URL(url);
  if (robotsFound && !robotsAllows(robots, USER_AGENT, u.pathname + u.search)) {
    skippedByRobots.push(url);
    return;
  }
  const r = await fetchWithRedirects(url);
  const record = {
    url,
    finalUrl: r.url,
    status: r.status,
    redirects: r.chain.length,
    redirectChain: r.chain.map((c) => `${c.status} ${c.url}`),
    timeMs: r.timeMs,
    error: r.error || null,
    inSitemap: sitemapSet.has(url),
    depth: null,
  };
  pages.set(url, record);
  if (!r.ok || !r.body) return;
  if (!r.isHtml) {
    nonHtml.push(url);
    return;
  }
  const finalNorm = normalizeUrl(r.url);
  if (analyzedFinal.has(finalNorm)) {
    record.duplicateOf = finalNorm;
    return;
  }
  analyzedFinal.add(finalNorm);
  const a = analyzeHtml(r.body, r.url);
  const xRobots = (r.headers?.['x-robots-tag'] || '').toLowerCase();
  Object.assign(record, {
    title: a.title,
    titleLength: a.title ? a.title.length : 0,
    metaDescription: a.metaDescription,
    metaDescriptionLength: a.metaDescription ? a.metaDescription.length : 0,
    h1: a.h1,
    canonical: a.canonical,
    noindex: /noindex/.test(a.metaRobots || '') || /noindex/.test(xRobots),
    nofollow: /nofollow/.test(a.metaRobots || '') || /nofollow/.test(xRobots),
    lang: a.lang,
    viewport: !!(a.viewport && /width\s*=\s*device-width/.test(a.viewport)),
    wordCount: a.wordCount,
    images: a.images.length,
    imagesMissingAlt: a.images.filter((i) => !i.hasAlt).length,
    internalLinks: a.links.filter((l) => l.internal).length,
    externalLinks: a.links.filter((l) => !l.internal).length,
    ogTitle: !!a.og.title,
    ogImage: !!a.og.image,
    schemaTypes: [...new Set(a.jsonLd.flatMap((j) => j.types))],
    invalidJsonLd: a.jsonLd.filter((j) => !j.valid).length,
    hreflang: a.hreflang.length,
    mixedContent: a.mixedContent.length,
    headingSkips: a.headings.reduce((n, h, i, arr) => n + (i > 0 && h.level > arr[i - 1].level + 1 ? 1 : 0), 0),
  });
  const targets = new Set();
  for (const link of a.links) {
    if (!link.internal || link.nofollow) continue;
    const target = normalizeUrl(link.href);
    if (target === url) continue;
    targets.add(target);
    if (!inlinks.has(target)) inlinks.set(target, new Set());
    inlinks.get(target).add(url);
    if (looksLikePage(target) && !record.nofollow) enqueue(target);
  }
  outlinks.set(url, targets);
}

let index = 0;
while (index < queue.length && pages.size + skippedByRobots.length < MAX_PAGES) {
  const room = MAX_PAGES - pages.size - skippedByRobots.length;
  const batch = queue.slice(index, index + Math.min(CONCURRENCY * 4, room));
  index += batch.length;
  await mapLimit(batch, CONCURRENCY, (u) => crawlOne(u), { delayMs: DELAY });
}
const discoveredNotCrawled = queue.slice(index).length;

// Click depth: shortest path from the homepage through links on crawled pages.
{
  const seen = new Map([[startUrl, 0]]);
  const bfs = [startUrl];
  while (bfs.length) {
    const u = bfs.shift();
    for (const t of outlinks.get(u) || []) {
      if (!seen.has(t)) {
        seen.set(t, seen.get(u) + 1);
        bfs.push(t);
      }
    }
  }
  for (const [u, rec] of pages) rec.depth = seen.has(u) ? seen.get(u) : null;
}

// ---------------------------------------------------------------------------
// 3. Link targets we saw but didn't crawl: check status of up to 60
// ---------------------------------------------------------------------------
const uncrawledTargets = [...inlinks.keys()].filter((u) => !pages.has(u) && looksLikePage(u)).slice(0, 60);
const extraLinkStatus = await mapLimit(uncrawledTargets, CONCURRENCY, (u) => checkLink(u), { delayMs: DELAY });

// ---------------------------------------------------------------------------
// 4. Site-wide checks
// ---------------------------------------------------------------------------
async function siteChecks() {
  const out = {};
  const host = new URL(startUrl).hostname;
  const isLocal = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|\d+\.\d+\.\d+\.\d+)$/.test(host) || /\.(local|test|localhost)$/.test(host);
  if (isLocal) {
    out.httpsEnforced = null;
    out.hostVariant = { tested: null, note: 'local or IP address — https and www checks skipped' };
    const probe = await fetchWithRedirects(`${origin}/powerup-404-check-${Date.now().toString(36)}`, { timeoutMs: 12000 });
    out.notFoundStatus = probe.status;
    out.soft404 = probe.status === 200;
    return out;
  }
  // HTTPS enforced?
  if (startUrl.startsWith('https:')) {
    const http = await fetchWithRedirects(`http://${host}/`, { method: 'HEAD', timeoutMs: 12000 });
    out.httpsEnforced = http.status === 0 ? null : http.url.startsWith('https:');
  } else {
    out.httpsEnforced = false;
  }
  // www / non-www consistency
  const altHost = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
  const alt = await fetchWithRedirects(`${new URL(startUrl).protocol}//${altHost}/`, { method: 'HEAD', timeoutMs: 12000 });
  out.hostVariant = {
    tested: altHost,
    status: alt.status,
    redirectsToMainHost: alt.status === 0 ? null : siteKey(alt.url) === siteKey(startUrl) && new URL(alt.url).hostname === host,
    note: alt.status === 0 ? 'variant host does not resolve (fine if never used)' : undefined,
  };
  // Proper 404 page?
  const probe = await fetchWithRedirects(`${origin}/powerup-404-check-${Date.now().toString(36)}`, { timeoutMs: 12000 });
  out.notFoundStatus = probe.status;
  out.soft404 = probe.status === 200;
  return out;
}
const site = await siteChecks();

// ---------------------------------------------------------------------------
// 5. Issues and score
// ---------------------------------------------------------------------------
const htmlPages = [...pages.values()].filter((p) => p.status >= 200 && p.status < 300 && p.title !== undefined);
const indexable = htmlPages.filter((p) => !p.noindex && (!p.canonical || normalizeUrl(p.canonical) === normalizeUrl(p.finalUrl)));
const issues = [];
const WEIGHTS = { critical: 15, high: 8, medium: 4, low: 2 };

function issue(id, severity, title, why, fix, affected, total) {
  if (!affected.length) return;
  const ratio = total ? affected.length / total : 1;
  issues.push({
    id, severity, title, why, fix,
    count: affected.length,
    ofTotal: total || null,
    examples: affected.slice(0, 10),
    deduction: Math.round(WEIGHTS[severity] * (0.5 + 0.5 * Math.min(1, ratio * 4)) * 10) / 10,
  });
}

const N = htmlPages.length;
const homepage = pages.get(startUrl);

// Critical
if (robotsFound && robotsBlocksEverything(robots)) {
  issue('robots-blocks-all', 'critical', 'robots.txt blocks the whole site', 'Search engines are told not to crawl any page.', 'Remove "Disallow: /" for User-agent: * (unless the site must stay hidden).', ['robots.txt'], 1);
}
if (homepage && homepage.noindex) {
  issue('homepage-noindex', 'critical', 'Homepage is set to noindex', 'Google will drop the homepage from results.', 'Remove the noindex meta tag / X-Robots-Tag from the homepage.', [startUrl], 1);
}
const serverErrors = [...pages.values()].filter((p) => p.status >= 500 || p.status === 0);
issue('server-errors', 'critical', 'Pages that fail to load (5xx or no response)', 'Visitors and Google get an error.', 'Fix the server error or remove links to these URLs.', serverErrors.map((p) => ({ url: p.url, status: p.status || p.error })), pages.size);

const brokenCrawled = [...pages.values()].filter((p) => p.status >= 400 && p.status < 500);
const brokenExtra = extraLinkStatus.filter((r) => r && (r.status >= 400 || r.status === 0));
const brokenLinks = [
  ...brokenCrawled.map((p) => ({ url: p.url, status: p.status, foundOn: [...(inlinks.get(p.url) || [])].slice(0, 5) })),
  ...brokenExtra.map((r) => ({ url: r.url, status: r.status || r.error, foundOn: [...(inlinks.get(r.url) || [])].slice(0, 5) })),
].filter((b) => b.foundOn.length);
issue('broken-internal-links', 'critical', 'Broken internal links', 'Links lead to error pages — bad for visitors and wasted crawl budget.', 'Update each link to a working page, or add a 301 redirect from the old URL.', brokenLinks, brokenLinks.length);
if (site.httpsEnforced === false) {
  issue('https-not-enforced', 'critical', 'HTTPS is not enforced', 'The http:// version does not redirect to https://.', 'Add a site-wide 301 redirect from http to https.', [`http://${new URL(startUrl).hostname}/`], 1);
}

// High
issue('missing-title', 'high', 'Pages without a title', 'The title is the clickable headline in Google.', 'Write a unique title (50–60 characters) with the main keyword first.', htmlPages.filter((p) => !p.title).map((p) => p.url), N);
const titleGroups = groupBy(indexable.filter((p) => p.title), (p) => p.title.trim().toLowerCase());
const dupTitles = [...titleGroups.values()].filter((g) => g.length > 1);
issue('duplicate-titles', 'high', 'Duplicate titles', 'Google can\'t tell the pages apart, so they compete with each other.', 'Give every page its own title.', dupTitles.map((g) => ({ title: g[0].title, urls: g.map((p) => p.url).slice(0, 5) })), N);
issue('missing-h1', 'high', 'Pages without an H1 heading', 'The H1 tells visitors and Google what the page is about.', 'Add one H1 per page that matches the page topic.', htmlPages.filter((p) => !p.h1?.length).map((p) => p.url), N);
issue('noindex-in-sitemap', 'high', 'Sitemap lists pages that are noindex', 'Mixed signals: "please index" and "don\'t index".', 'Remove noindex pages from the sitemap, or remove noindex if they should rank.', htmlPages.filter((p) => p.inSitemap && p.noindex).map((p) => p.url), N);
issue('canonical-elsewhere', 'high', 'Pages whose canonical points to another URL', 'These pages ask Google to rank a different URL instead.', 'Check each one: correct for duplicates, wrong for unique pages.', htmlPages.filter((p) => p.canonical && normalizeUrl(p.canonical) !== normalizeUrl(p.finalUrl)).map((p) => ({ url: p.url, canonical: p.canonical })), N);
issue('missing-viewport', 'high', 'Pages without a mobile viewport', 'The page renders zoomed-out on phones; Google indexes mobile first.', 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.', htmlPages.filter((p) => !p.viewport).map((p) => p.url), N);
issue('invalid-structured-data', 'high', 'Broken structured data (JSON-LD)', 'Invalid JSON means no rich results.', 'Fix the JSON syntax; test in Google\'s Rich Results Test.', htmlPages.filter((p) => p.invalidJsonLd).map((p) => p.url), N);
issue('mixed-content', 'high', 'Insecure (http) resources on https pages', 'Browsers block or warn about them.', 'Load every image, script and stylesheet over https.', htmlPages.filter((p) => p.mixedContent).map((p) => p.url), N);

// Medium
issue('missing-meta-description', 'medium', 'Pages without a meta description', 'Google writes its own snippet, often a poor one.', 'Write a 120–155 character description that sells the click.', indexable.filter((p) => !p.metaDescription).map((p) => p.url), N);
const descGroups = groupBy(indexable.filter((p) => p.metaDescription), (p) => p.metaDescription.trim().toLowerCase());
issue('duplicate-meta-descriptions', 'medium', 'Duplicate meta descriptions', 'Same snippet for different pages.', 'Write a unique description for each page.', [...descGroups.values()].filter((g) => g.length > 1).map((g) => ({ description: truncate(g[0].metaDescription, 80), urls: g.map((p) => p.url).slice(0, 5) })), N);
issue('thin-content', 'medium', 'Thin pages (under 200 words)', 'Little content rarely ranks, unless the page has another job (contact, gallery).', 'Expand pages that should rank; noindex or merge the rest.', indexable.filter((p) => p.wordCount < 200).map((p) => ({ url: p.url, words: p.wordCount })), N);
issue('redirect-chains', 'medium', 'Redirect chains (2+ hops)', 'Each hop slows the page and loses a little link value.', 'Point links and redirects straight at the final URL.', [...pages.values()].filter((p) => p.redirects > 1).map((p) => ({ url: p.url, chain: p.redirectChain })), pages.size);
issue('images-missing-alt', 'medium', 'Images without alt text', 'Hurts accessibility and image search.', 'Describe each meaningful image; use alt="" for decorative ones.', htmlPages.filter((p) => p.imagesMissingAlt).map((p) => ({ url: p.url, images: p.imagesMissingAlt })), N);
issue('slow-response', 'medium', 'Slow server responses (over 1.5 s)', 'Slow pages lose visitors and rankings.', 'Check hosting, caching and page weight; confirm with PageSpeed.', htmlPages.filter((p) => p.timeMs > 1500).map((p) => ({ url: p.url, ms: p.timeMs })), N);
if (!sitemapUrls.length && !args['no-sitemap']) {
  issue('no-sitemap', 'medium', 'No XML sitemap found', 'A sitemap helps Google find every page.', 'Publish /sitemap.xml and list it in robots.txt and Search Console.', [`${origin}/sitemap.xml`], 1);
}
if (site.soft404) {
  issue('soft-404', 'medium', 'Missing pages return 200 instead of 404', 'Google may index "page not found" pages.', 'Make unknown URLs return HTTP 404 (with a helpful 404 page).', [`${origin}/<random>`], 1);
}
const orphanCandidates = sitemapUrls.filter((u) => pages.has(u) && !(inlinks.get(u)?.size) && u !== startUrl);
issue('orphan-pages', 'medium', 'Pages in the sitemap that no crawled page links to', 'Pages without internal links get little authority and are hard to find.', 'Link to them from related pages or the menu.', orphanCandidates, N);
issue('deep-pages', 'medium', 'Pages more than 3 clicks from the homepage', 'Deep pages are crawled less and get less authority.', 'Add links from the homepage, hubs or the menu.', htmlPages.filter((p) => p.depth > 3).map((p) => ({ url: p.url, depth: p.depth })), N);

// Low
issue('title-length', 'low', 'Titles too long (>60) or too short (<15)', 'Long titles get cut off; short ones waste space.', 'Aim for 50–60 characters.', htmlPages.filter((p) => p.title && (p.titleLength > 60 || p.titleLength < 15)).map((p) => ({ url: p.url, length: p.titleLength })), N);
issue('description-length', 'low', 'Meta descriptions too long (>160) or too short (<70)', 'Long ones get cut off; short ones undersell the page.', 'Aim for 120–155 characters.', indexable.filter((p) => p.metaDescription && (p.metaDescriptionLength > 160 || p.metaDescriptionLength < 70)).map((p) => ({ url: p.url, length: p.metaDescriptionLength })), N);
issue('multiple-h1', 'low', 'Pages with more than one H1', 'Not an error, but one clear H1 is easier for everyone.', 'Keep one H1; turn the others into H2.', htmlPages.filter((p) => p.h1?.length > 1).map((p) => ({ url: p.url, h1: p.h1.length })), N);
issue('missing-open-graph', 'low', 'Pages without social sharing tags', 'Shared links show no image or a random one.', 'Add og:title, og:description and og:image.', htmlPages.filter((p) => !p.ogTitle || !p.ogImage).map((p) => p.url), N);
issue('missing-lang', 'low', 'Pages without a language set', 'Screen readers and search engines may guess the wrong language.', 'Add lang="…" to the <html> tag.', htmlPages.filter((p) => !p.lang).map((p) => p.url), N);
issue('heading-skips', 'low', 'Skipped heading levels', 'Confuses screen-reader users.', 'Use headings in order: H1 → H2 → H3.', htmlPages.filter((p) => p.headingSkips).map((p) => p.url), N);
issue('no-structured-data', 'low', 'Pages without structured data', 'Structured data can earn rich results (stars, FAQs, business info).', 'Add Organization/LocalBusiness on the homepage and the right type on key pages.', htmlPages.filter((p) => !p.schemaTypes?.length).map((p) => p.url), N);

const deductions = issues.reduce((s, i) => s + i.deduction, 0);
const score = N ? Math.max(0, Math.round(100 - deductions)) : 0;
const order = { critical: 0, high: 1, medium: 2, low: 3 };
issues.sort((a, b) => order[a.severity] - order[b.severity] || b.deduction - a.deduction);

// ---------------------------------------------------------------------------
// 6. Output
// ---------------------------------------------------------------------------
const report = {
  meta: {
    tool: 'power-up-kit/seo-crawl',
    version: VERSION,
    inputUrl: startInput,
    startUrl,
    startRedirected,
    crawledAt: new Date().toISOString(),
    durationSeconds: Math.round((Date.now() - started) / 1000),
    maxPages: MAX_PAGES,
    pagesCrawled: pages.size,
    htmlPages: N,
    indexablePages: indexable.length,
    discoveredNotCrawled,
    skippedByRobots: skippedByRobots.length,
    userAgent: USER_AGENT,
    scoring: 'Starts at 100. Each issue type removes points by severity (critical 15, high 8, medium 4, low 2), scaled by how many pages it affects (half the weight for one page, full weight at 25%+ of pages).',
  },
  score,
  site: {
    robotsTxt: { found: robotsFound, status: robotsRes.status, blocksEverything: robotsFound ? robotsBlocksEverything(robots) : false, sitemapsListed: robots.sitemaps },
    sitemap: { urlCount: sitemapUrls.length, files: sitemapInfo.files },
    ...site,
  },
  issues,
  brokenLinks,
  pages: [...pages.values()],
  nonHtml,
  skippedByRobots,
};

const outPath = args.out || `.powerup/reports/seo-crawl-${slugify(siteKey(startUrl))}-${isoDate()}.json`;
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

if (args.csv) {
  const cols = ['url', 'status', 'title', 'titleLength', 'metaDescriptionLength', 'h1', 'wordCount', 'canonical', 'noindex', 'imagesMissingAlt', 'internalLinks', 'depth', 'inSitemap', 'timeMs', 'schemaTypes'];
  const esc = (v) => {
    const s = Array.isArray(v) ? v.join(' | ') : v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [cols.join(','), ...report.pages.map((p) => cols.map((c) => esc(p[c])).join(','))];
  mkdirSync(dirname(args.csv), { recursive: true });
  writeFileSync(args.csv, `${rows.join('\n')}\n`);
}

// The summary carries everything the audit report needs (title, counts and up
// to 5 example URLs per issue), so Claude rarely has to open the full report.
// Compact JSON: same data, about a third fewer tokens than pretty-printed.
process.stdout.write(`${JSON.stringify({
  score,
  startUrl,
  pagesCrawled: pages.size,
  htmlPages: N,
  discoveredNotCrawled,
  skippedByRobots: skippedByRobots.length,
  site: {
    robotsTxt: report.site.robotsTxt.found,
    sitemapUrls: sitemapUrls.length,
    httpsEnforced: site.httpsEnforced,
    soft404: site.soft404,
  },
  issues: issues.map((i) => ({ id: i.id, severity: i.severity, title: i.title, count: i.count, ofTotal: i.ofTotal, deduction: i.deduction, examples: i.examples.slice(0, 5) })),
  fullReport: outPath,
  ...(args.csv ? { csv: args.csv } : {}),
})}\n`);

function groupBy(list, keyFn) {
  const m = new Map();
  for (const item of list) {
    const k = keyFn(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}
