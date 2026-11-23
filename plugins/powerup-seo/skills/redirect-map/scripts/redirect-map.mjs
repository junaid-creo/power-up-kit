#!/usr/bin/env node
// Power-Up Kit — redirect map
//
// Protects rankings during a redesign, platform move, domain change or URL
// restructure: matches old URLs to new URLs, checks the map, exports it in the
// hosting platform's format, and verifies the live redirects after launch.
// Prints a short JSON summary; full data goes to files under .powerup/redirects/.
//
// Usage:
//   node redirect-map.mjs match  --old <source> --new <source> [--out map.csv]
//                                [--priority export.csv] [--fetch-titles] [--threshold 0.5]
//                                [--old-domain host] [--new-domain host] [--old-base url] [--new-base url]
//   node redirect-map.mjs check  <map.csv> [--new <source>] [--fix] [--out fixed.csv] [--report file.json]
//   node redirect-map.mjs export <map.csv> --format <format> [--out file] [--old-domain host] [--new-domain host] [--force]
//   node redirect-map.mjs verify <map.csv> --base <https://site.com> [--concurrency 3] [--delay 150] [--max 1000] [--out file.json]
//
// Sources: a sitemap URL, a site URL (sitemaps found via robots.txt, fallback /sitemap.xml),
// a local .xml / .xml.gz sitemap, a .txt list (one URL or path per line), or a .csv export
// (Search Console, Ahrefs, Semrush, Screaming Frog, Google Analytics).
// Formats: netlify, vercel, next, apache, nginx, cloudflare, shopify, wordpress, webflow, framer, csv.
//
// Network use is polite (PowerUpKit user agent, robots.txt respected when fetching page
// titles, small concurrency). Only check sites you own or have permission to check.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  USER_AGENT, VERSION, analyzeHtml, fail, fetchWithRedirects, isoDate, loadSitemapUrls, mapLimit,
  parseArgs, parseRobots, parseSitemap, printJson, robotsAllows, siteKey, slugify, toInt,
} from './powerup-lib.mjs';

const FORMATS = ['netlify', 'vercel', 'next', 'apache', 'nginx', 'cloudflare', 'shopify', 'wordpress', 'webflow', 'framer', 'csv'];
const USAGE = `Usage:
  node redirect-map.mjs match  --old <source> --new <source> [--out map.csv] [--priority export.csv] [--fetch-titles]
  node redirect-map.mjs check  <map.csv> [--new <source>] [--fix]
  node redirect-map.mjs export <map.csv> --format <${FORMATS.join('|')}> [--out file]
  node redirect-map.mjs verify <map.csv> --base <https://site.com> [--concurrency 3]
Sources: sitemap URL, site URL, .xml sitemap, .txt list or .csv export.`;
const MAP_COLUMNS = ['old', 'new', 'status', 'type', 'confidence', 'priority', 'note'];
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const TRACKING = /^(utm_[a-z]+|gclid|fbclid|msclkid|mc_cid|mc_eid|_ga|_gl)$/i;
const ASSET_EXT = /\.(css|js|mjs|map|json|woff2?|ttf|otf|eot|ico|svg|png|jpe?g|gif|webp|avif|bmp|tiff?)$/i;
const STOPWORDS = new Set(('a an and the of for to in on at by with from or is are be was our your my we us you it its this that '
  + 'how what why when where who which will can do does not no www html htm php asp aspx jsp index default page').split(' '));
const GENERIC_SLUGS = new Set(['index', 'home', 'default', 'page', 'main', 'en', 'all', 'list', 'view', 'item', 'detail', 'details']);
const HOME_ALIASES = new Set(['/', '/home', '/homepage', '/home-page']);
const DOMAIN_LIKE = /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}(\/|$)/i;
const FILE_LABEL = /\.(html?|php|aspx?|jsp|cfm|pdf|txt|xml)$/i;
const TYPE_ORDER = { review: 0, similar: 1, title: 2, slug: 3, 'same-path': 4 };

const args = parseArgs(process.argv.slice(2), { booleans: ['fetch-titles', 'fix', 'force'] });
const command = args._[0];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function round(n, d = 2) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function ensureDir(file) {
  const dir = dirname(file);
  if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
}

function stripHost(h) {
  return String(h || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
}

function flag(name) {
  const v = args[name];
  if (v === true) fail(`--${name} needs a value.\n${USAGE}`);
  return v;
}

/** Percent-encode characters that are not allowed in a URL, keep existing %XX escapes. */
function encodeUrlish(s) {
  return String(s).replace(/%(?![0-9A-Fa-f]{2})|[^A-Za-z0-9\-._~!$&'()*+,;=:@\/%?#[\]]/gu, (c) => encodeURIComponent(c));
}

function regexEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Text files and CSV
// ---------------------------------------------------------------------------

function decodeText(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const b = Buffer.from(buf.subarray(2, 2 + Math.floor((buf.length - 2) / 2) * 2));
    b.swap16();
    return b.toString('utf16le');
  }
  const s = buf.toString('utf8');
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function detectDelimiter(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const c of text) {
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (c === '\n' || c === '\r')) break;
    else if (!inQuotes && c in counts) counts[c]++;
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? best : ',';
}

function parseCsv(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"' && field === '') inQuotes = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

function readTable(file) {
  // Google Analytics exports start with "# …" comment lines; Ahrefs uses "#" as a column name.
  const lines = decodeText(readFileSync(file)).split(/\r?\n/);
  while (lines.length && /^#(?!["',;\t])/.test(lines[0])) lines.shift();
  const rows = parseCsv(lines.join('\n'));
  if (!rows.length) fail(`${file} is empty.`);
  return { header: rows[0].map((h) => h.trim()), rows: rows.slice(1) };
}

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvLine(cells) {
  return cells.map(csvCell).join(',');
}

const normHeader = (h) => String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
const URL_COLUMNS = ['url', 'address', 'page', 'top pages', 'landing page', 'landing pages', 'landing page + query string', 'page url', 'pages'];
const VALUE_COLUMNS = ['clicks', 'referring domains', 'ref. domains', 'ref domains', 'dofollow referring domains', 'referring domains (dofollow)',
  'traffic', 'organic traffic', 'sessions', 'total users', 'users', 'views', 'impressions', 'backlinks'];

function pickColumn(header, names) {
  const norm = header.map(normHeader);
  for (const n of names) {
    const i = norm.indexOf(n);
    if (i !== -1) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// URL entries and normalisation
// ---------------------------------------------------------------------------

function cleanPath(pathname) {
  let p = safeDecode(pathname || '/').toLowerCase().replace(/\/{2,}/g, '/');
  p = p.replace(/\/(index|default)\.(html?|php|aspx?|jsp)$/, '/');
  p = p.replace(/\.(html?|php|aspx?|jsp|cfm)$/, '');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

function sortedQuery(search) {
  const sp = new URLSearchParams(search);
  return [...sp.entries()].filter(([k]) => !TRACKING.test(k)).sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]))
    .map(([k, v]) => `${k}=${v}`).join('&');
}

function stem(w) {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

function wordTokens(text) {
  const out = new Set();
  for (const w of String(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (w.length < 2 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    out.add(stem(w));
  }
  return out;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Parse one URL or path into an entry used for matching. Returns null for junk. */
function toEntry(raw, { loose = false } = {}) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let u;
  try {
    if (/^https?:\/\//i.test(s)) u = new URL(s);
    else if (s.startsWith('/')) u = new URL(s, 'http://relative.invalid');
    else if (DOMAIN_LIKE.test(s) && !FILE_LABEL.test(s.split('/')[0])) u = new URL(`https://${s}`);
    else if (loose && /^[\p{L}\p{N}._~%-]/u.test(s) && !/\s/.test(s)) u = new URL(`/${s}`, 'http://relative.invalid');
    else return null;
  } catch {
    return null;
  }
  const absolute = u.hostname !== 'relative.invalid';
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  const pathname = u.pathname || '/';
  const search = u.search;
  const clean = cleanPath(pathname);
  const q = search ? sortedQuery(search) : '';
  const segs = clean.split('/').filter(Boolean);
  const last = segs.length ? segs[segs.length - 1] : '';
  return {
    raw: s,
    absolute,
    host: absolute ? u.hostname.toLowerCase() : '',
    origin: absolute ? u.origin : '',
    path: pathname + search,
    pathname,
    search,
    clean,
    key: clean + (q ? `?${q}` : ''),
    tokens: wordTokens(clean),
    slug: last && !GENERIC_SLUGS.has(last) && !/^\d+$/.test(last) && last.length >= 3 ? last : null,
    firstFolder: segs.length > 1 ? segs[0] : '',
  };
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
}

// ---------------------------------------------------------------------------
// Loading URL sources
// ---------------------------------------------------------------------------

function networkFail(label, url, error) {
  fail(`Could not reach ${url} (${error}). If you are in the Claude app or offline: download the sitemap, or export the URL list `
    + `(Search Console, Ahrefs, Semrush, Screaming Frog), save it as a file and pass the file to --${label}.`);
}

async function loadRemote(url, label) {
  let u;
  try { u = new URL(url); } catch { fail(`--${label}: not a valid URL: ${url}`); }
  const isSitemap = /sitemap|\.xml(\.gz)?$/i.test(u.pathname);
  let starts = [url];
  if (!isSitemap) {
    const robotsRes = await fetchWithRedirects(`${u.origin}/robots.txt`, { timeoutMs: 15000 });
    if (robotsRes.status === 0) networkFail(label, url, robotsRes.error);
    const robots = robotsRes.ok && !/<html/i.test(robotsRes.body || '') ? parseRobots(robotsRes.body) : { sitemaps: [] };
    starts = robots.sitemaps.length ? robots.sitemaps : [`${u.origin}/sitemap.xml`, `${u.origin}/sitemap_index.xml`];
  }
  const r = await loadSitemapUrls(starts, { maxFiles: 50, maxUrls: 50000 });
  if (!r.urls.length) {
    if (r.files.length && r.files.every((f) => f.status === 0)) networkFail(label, url, r.files[0].error);
    fail(`--${label}: no URLs found in the sitemap(s) of ${url} (tried ${starts.join(', ')}). `
      + 'Give a sitemap file, a .txt list or a Search Console / crawl CSV instead.');
  }
  const urls = isSitemap ? r.urls : r.urls.filter((x) => siteKey(x) === siteKey(u.href));
  return { urls, info: { type: isSitemap ? 'sitemap-url' : 'site', input: url, sitemaps: r.files.map((f) => ({ url: f.url, status: f.status, urls: f.urls })) } };
}

async function loadSource(src, label) {
  if (!src || src === true) fail(`Missing --${label} <source>.\n${USAGE}`);
  if (/^https?:\/\//i.test(src)) return loadRemote(src, label);
  if (!existsSync(src)) fail(`--${label}: file not found: ${src}`);
  const lower = src.toLowerCase();
  const ext = extname(lower);
  const buf = readFileSync(src);
  if (ext === '.xml' || ext === '.gz') {
    let xml;
    try { xml = ext === '.gz' ? gunzipSync(buf).toString('utf8') : decodeText(buf); } catch { fail(`--${label}: could not unzip ${src}`); }
    const parsed = parseSitemap(xml);
    let urls = parsed.urls;
    const info = { type: 'sitemap-file', input: src };
    if (!urls.length && parsed.sitemaps.length) {
      const r = await loadSitemapUrls(parsed.sitemaps, { maxFiles: 50, maxUrls: 50000 });
      urls = r.urls;
      info.childSitemaps = r.files.map((f) => ({ url: f.url, status: f.status, urls: f.urls }));
      if (!urls.length) {
        fail(`--${label}: ${src} is a sitemap index and its child sitemaps could not be loaded `
          + `(${parsed.sitemaps.slice(0, 3).join(', ')}${parsed.sitemaps.length > 3 ? ', …' : ''}). Download them and pass one file, or list the URLs in a .txt file.`);
      }
    }
    if (!urls.length) fail(`--${label}: no <loc> URLs found in ${src}. Is it a sitemap?`);
    return { urls, info };
  }
  if (ext === '.txt' || ext === '.list') {
    const urls = decodeText(buf).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    if (!urls.length) fail(`--${label}: ${src} has no URLs.`);
    return { urls, info: { type: 'text-file', input: src }, loose: true };
  }
  if (ext === '.csv' || ext === '.tsv') {
    const { header, rows } = readTable(src);
    let col = pickColumn(header, URL_COLUMNS);
    const columnFound = col !== -1;
    if (col === -1) {
      // No known column name: use the first column whose values look like URLs or paths.
      const looks = (v) => /^(https?:\/\/|\/)/i.test(String(v || '').trim());
      col = Math.max(0, header.findIndex((_, i) => rows.length && rows.filter((r) => looks(r[i])).length >= rows.length * 0.5));
    }
    const urls = rows.map((r) => (r[col] || '').trim()).filter(Boolean);
    if (!urls.length) fail(`--${label}: no URLs in column "${header[col]}" of ${src}.`);
    return { urls, info: { type: 'csv-file', input: src, column: header[col] || `column ${col + 1}`, columnFound } };
  }
  fail(`--${label}: unsupported file type "${ext || 'none'}" (${src}). Use a sitemap (.xml), a .txt list (one URL per line) or a .csv export.`);
  return null;
}

/** Turn raw URL strings into unique entries; drops junk lines and static assets. */
function buildEntries(urls, loose = false) {
  const seen = new Map();
  let ignored = 0;
  let assets = 0;
  for (const raw of urls) {
    const e = toEntry(raw, { loose });
    if (!e) { ignored++; continue; }
    if (ASSET_EXT.test(e.pathname)) { assets++; continue; }
    if (!seen.has(e.key)) seen.set(e.key, e);
  }
  return { entries: [...seen.values()], ignored, assets };
}

// ---------------------------------------------------------------------------
// Priority file (Search Console clicks, Ahrefs referring domains, …)
// ---------------------------------------------------------------------------

function loadPriority(file) {
  if (!existsSync(file)) fail(`--priority: file not found: ${file}`);
  const { header, rows } = readTable(file);
  let urlCol = pickColumn(header, URL_COLUMNS);
  if (urlCol === -1) urlCol = 0;
  let valCol = pickColumn(header, VALUE_COLUMNS);
  if (valCol === -1) {
    const norm = header.map(normHeader);
    valCol = norm.findIndex((h, i) => i !== urlCol && /(clicks|referring|ref\. ?domains|traffic|sessions|backlinks)/.test(h));
  }
  const num = (v) => {
    const n = Number(String(v ?? '').replace(/[\s,%]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  if (valCol === -1) {
    valCol = header.findIndex((_, i) => i !== urlCol && rows.length && rows.filter((r) => num(r[i]) !== null && String(r[i]).trim() !== '').length >= rows.length * 0.8);
  }
  if (valCol === -1) {
    fail(`--priority: could not find a clicks / referring domains / traffic column in ${file}. Columns: ${header.join(', ')}`);
  }
  const values = new Map();
  const entries = [];
  for (const r of rows) {
    const e = toEntry(r[urlCol]);
    const n = num(r[valCol]);
    if (!e || n === null) continue;
    values.set(e.key, (values.get(e.key) || 0) + n);
    entries.push(e);
  }
  return { values, entries, column: header[valCol], urlColumn: header[urlCol] };
}

// ---------------------------------------------------------------------------
// Page titles (--fetch-titles)
// ---------------------------------------------------------------------------

async function fetchTitles(targets, { concurrency = 2, delayMs = 300 } = {}) {
  const robotsByOrigin = new Map();
  const results = new Map();
  const stats = { fetched: 0, blockedByRobots: 0, failed: 0 };
  const getRobots = (origin) => {
    if (!robotsByOrigin.has(origin)) {
      robotsByOrigin.set(origin, fetchWithRedirects(`${origin}/robots.txt`, { timeoutMs: 15000 }).then((r) => (
        r.ok && !/<html/i.test(r.body || '') ? parseRobots(r.body) : null)));
    }
    return robotsByOrigin.get(origin);
  };
  await mapLimit(targets, concurrency, async (url) => {
    const u = new URL(url);
    const robots = await getRobots(u.origin);
    if (robots && !robotsAllows(robots, USER_AGENT, u.pathname + u.search)) {
      stats.blockedByRobots++;
      return;
    }
    const r = await fetchWithRedirects(url, { timeoutMs: 15000, maxBytes: 1_000_000 });
    if (!r.ok || !r.isHtml || !r.body) { stats.failed++; return; }
    const a = analyzeHtml(r.body, r.url);
    stats.fetched++;
    results.set(url, { title: a.title || '', h1: a.h1[0] || '' });
  }, { delayMs });
  return { results, stats };
}

function titleTokenMap(titleMap) {
  // Words that appear in more than half of a site's titles (brand name, "home", …) say nothing about the page.
  const tokenSets = new Map();
  for (const [url, t] of titleMap) tokenSets.set(url, wordTokens(`${t.title} ${t.h1}`));
  if (tokenSets.size >= 4) {
    const df = new Map();
    for (const set of tokenSets.values()) for (const tok of set) df.set(tok, (df.get(tok) || 0) + 1);
    for (const set of tokenSets.values()) for (const tok of [...set]) if (df.get(tok) > tokenSets.size / 2) set.delete(tok);
  }
  return tokenSets;
}

// ---------------------------------------------------------------------------
// match
// ---------------------------------------------------------------------------

async function cmdMatch() {
  const threshold = args.threshold === undefined ? 0.5 : Number(args.threshold);
  if (!(threshold > 0 && threshold <= 1)) fail('--threshold must be a number between 0 and 1 (default 0.5).');
  const oldSrc = await loadSource(flag('old'), 'old');
  const newSrc = await loadSource(flag('new'), 'new');
  const oldBuilt = buildEntries(oldSrc.urls, oldSrc.loose);
  const newBuilt = buildEntries(newSrc.urls, newSrc.loose);
  let oldEntries = oldBuilt.entries;
  const newEntries = newBuilt.entries;
  if (!newEntries.length) fail('--new: no usable URLs or paths found.');

  const oldHost = stripHost(flag('old-domain')) || mostCommon(oldEntries.filter((e) => e.absolute).map((e) => e.host));
  const newListHost = mostCommon(newEntries.filter((e) => e.absolute).map((e) => e.host));
  const newDomain = stripHost(flag('new-domain'));

  // Priority values; pages with clicks or links that are missing from the old list are added to it.
  let priority = null;
  if (args.priority) {
    priority = loadPriority(flag('priority'));
    const have = new Set(oldEntries.map((e) => e.key));
    let added = 0;
    for (const e of priority.entries) {
      if (have.has(e.key) || ASSET_EXT.test(e.pathname)) continue;
      if (e.absolute && oldHost && siteKey(`https://${e.host}/`) !== siteKey(`https://${oldHost}/`)) continue;
      have.add(e.key);
      oldEntries.push(e);
      added++;
    }
    priority.added = added;
  }
  if (!oldEntries.length) fail('--old: no usable URLs or paths found.');

  const domainChange = newDomain && oldHost && newDomain !== oldHost ? { from: oldHost, to: newDomain } : null;
  if (newDomain && !oldHost) fail('--new-domain needs the old domain too: the old list has only paths, so add --old-domain example.com.');

  // Indexes over the new site.
  const newByKey = new Map();
  const newBySlug = new Map();
  const postings = new Map();
  for (const n of newEntries) {
    if (!newByKey.has(n.key)) newByKey.set(n.key, n);
    if (n.slug) {
      if (!newBySlug.has(n.slug)) newBySlug.set(n.slug, []);
      newBySlug.get(n.slug).push(n);
    }
    for (const t of n.tokens) {
      if (!postings.has(t)) postings.set(t, []);
      postings.get(t).push(n);
    }
  }
  const tieBreak = (o) => (a, b) => (b.score - a.score)
    || ((b.n.firstFolder === o.firstFolder) - (a.n.firstFolder === o.firstFolder))
    || (a.n.clean.length - b.n.clean.length) || a.n.clean.localeCompare(b.n.clean);

  function bestSimilar(o) {
    const cands = new Set();
    for (const t of o.tokens) for (const n of postings.get(t) || []) cands.add(n);
    const scored = [...cands].map((n) => ({ n, score: jaccard(o.tokens, n.tokens) })).sort(tieBreak(o));
    return scored;
  }

  function parentSuggestion(o) {
    const segs = o.clean.split('/').filter(Boolean);
    for (let i = segs.length - 1; i >= 1; i--) {
      const n = newByKey.get(`/${segs.slice(0, i).join('/')}`);
      if (n) return n;
    }
    return null;
  }

  const rows = [];
  for (const o of oldEntries) {
    const row = { o, n: null, type: 'review', confidence: 'low', score: null, notes: [] };
    const same = newByKey.get(o.key);
    if (same) {
      Object.assign(row, { n: same, type: 'same-path', confidence: 'high' });
    } else if (HOME_ALIASES.has(o.clean) && !o.search && newByKey.has('/')) {
      Object.assign(row, { n: newByKey.get('/'), type: 'same-path', confidence: 'high' });
      row.notes.push('Old homepage address → new homepage');
    } else if (o.slug && newBySlug.has(o.slug)) {
      const list = newBySlug.get(o.slug).map((n) => ({ n, score: jaccard(o.tokens, n.tokens) })).sort(tieBreak(o));
      Object.assign(row, { n: list[0].n, type: 'slug', confidence: list.length === 1 ? 'high' : 'medium' });
      row.notes.push(list.length === 1 ? 'Same page name in another folder' : `Same page name also at: ${list.slice(1, 4).map((x) => x.n.path).join(', ')}`);
    } else {
      const scored = bestSimilar(o);
      const best = scored[0];
      if (best && best.score >= threshold) {
        const tie = scored[1] && scored[1].score === best.score;
        Object.assign(row, { n: best.n, type: 'similar', confidence: tie ? 'low' : 'medium', score: round(best.score) });
        row.notes.push(`Words match ${round(best.score)}${tie ? ` (tie with ${scored[1].n.path})` : ''}`);
      } else {
        const parent = parentSuggestion(o);
        row.suggestion = parent ? parent.path : null;
        row.closest = best && best.score > 0 ? { path: best.n.path, score: round(best.score) } : null;
        row.notes.push(parent
          ? `No close match. Suggested: ${parent.path} (closest parent section on the new site)`
          : 'No close match and no parent section on the new site');
        if (row.closest) row.notes.push(`closest words match: ${row.closest.path} (${row.closest.score})`);
        row.notes.push('Decide: a relevant page, or 410 if the content is gone on purpose. Do not send it to the homepage');
      }
    }
    rows.push(row);
  }

  // Optional: compare page titles / H1s to confirm matches and find matches for review rows.
  let titles = null;
  if (args['fetch-titles']) {
    const maxFetch = toInt(args['max-fetch'], 300);
    const oldBase = flag('old-base');
    const newBase = flag('new-base');
    const abs = (e, base) => (e.absolute ? e.raw : base ? new URL(e.path, base).href : null);
    const oldTargets = new Map();
    const newTargets = new Map();
    for (const r of rows) {
      if (r.type === 'same-path' || (r.type === 'slug' && r.confidence === 'high')) continue;
      const ou = abs(r.o, oldBase);
      if (ou) oldTargets.set(r, ou);
      if (r.n) { const nu = abs(r.n, newBase); if (nu) newTargets.set(r.n, nu); }
    }
    if ([...rows].some((r) => r.type === 'review')) {
      for (const n of newEntries) {
        const nu = abs(n, newBase);
        if (nu && !newTargets.has(n)) newTargets.set(n, nu);
      }
    }
    const oldUrls = [...new Set(oldTargets.values())].slice(0, Math.ceil(maxFetch / 2));
    const newUrls = [...new Set(newTargets.values())].slice(0, maxFetch - oldUrls.length);
    const fetched = await fetchTitles([...oldUrls, ...newUrls]);
    const oldTitleMap = new Map([...fetched.results].filter(([u]) => oldUrls.includes(u)));
    const newTitleMap = new Map([...fetched.results].filter(([u]) => newUrls.includes(u)));
    const oldTok = titleTokenMap(oldTitleMap);
    const newTok = titleTokenMap(newTitleMap);
    let confirmed = 0;
    let doubtful = 0;
    let found = 0;
    for (const r of rows) {
      const ou = oldTargets.get(r);
      if (!ou || !oldTok.has(ou)) continue;
      const ot = oldTok.get(ou);
      if (r.n && r.type !== 'review') {
        const nu = newTargets.get(r.n);
        if (!nu || !newTok.has(nu)) continue;
        const sim = round(jaccard(ot, newTok.get(nu)));
        if (sim >= 0.5) { r.confidence = 'high'; r.notes.push(`Title/H1 match ${sim}`); confirmed++; }
        else if (sim < 0.2) { r.confidence = 'low'; r.notes.push(`Titles differ (${sim}) — check`); doubtful++; }
      } else if (r.type === 'review') {
        const scored = newEntries.map((n) => ({ n, u: newTargets.get(n) })).filter((x) => x.u && newTok.has(x.u))
          .map((x) => ({ n: x.n, score: jaccard(ot, newTok.get(x.u)) })).sort(tieBreak(r.o));
        const best = scored[0];
        if (best && best.score >= 0.5 && !(scored[1] && scored[1].score === best.score) && best.n.clean !== '/') {
          const t = oldTitleMap.get(ou);
          Object.assign(r, { n: best.n, type: 'title', confidence: 'medium', score: round(best.score) });
          r.notes = [`Title/H1 match ${round(best.score)} ("${t.title || t.h1}")`];
          found++;
        }
      }
    }
    titles = { ...fetched.stats, requested: oldUrls.length + newUrls.length, confirmed, doubtful, foundForReviewRows: found,
      notFetched: Math.max(0, oldTargets.size + newTargets.size - oldUrls.length - newUrls.length) };
  }

  // Build the map rows.
  const oldOrigin = oldHost ? `https://${oldHost}` : '';
  const out = rows.map((r) => {
    const pr = priority ? priority.values.get(r.o.key) : undefined;
    const oldVal = domainChange ? (r.o.absolute ? `${r.o.origin}${r.o.path}` : `${oldOrigin}${r.o.path}`) : r.o.path;
    const newPath = r.n ? r.n.path : '';
    const newVal = r.n ? (domainChange ? `https://${domainChange.to}${newPath}` : newPath) : '';
    const notes = [...r.notes];
    if (r.type === 'same-path') {
      const unchanged = !domainChange && stripSlash(r.o.path) === stripSlash(newPath);
      if (unchanged) notes.unshift(r.o.path === newPath ? 'Same URL — no redirect needed' : 'Same URL apart from the trailing slash — no redirect needed if the platform redirects one form to the other');
      else if (domainChange && r.o.path === newPath) notes.unshift('Same path on the new domain — a domain-level redirect can cover it');
      else notes.unshift('Same page, URL form changed — redirect needed');
    }
    return {
      old: oldVal, new: newVal, status: '301', type: r.type, confidence: r.confidence,
      priority: pr === undefined ? '' : String(round(pr, 2)), note: notes.join('. '),
      _prio: pr === undefined ? -1 : pr, _score: r.score, _suggestion: r.suggestion || null,
    };
  });
  out.sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || b._prio - a._prio || a.old.localeCompare(b.old));

  const mapName = `${slugify(oldHost || newDomain || newListHost || 'site')}-${isoDate()}.csv`;
  const outPath = flag('out') || join('.powerup', 'redirects', mapName);
  ensureDir(outPath);
  writeFileSync(outPath, `${[MAP_COLUMNS.join(','), ...out.map((r) => csvLine(MAP_COLUMNS.map((c) => r[c])))].join('\n')}\n`);

  const counts = { 'same-path': 0, slug: 0, similar: 0, title: 0, review: 0 };
  for (const r of out) counts[r.type]++;
  const unchanged = out.filter((r) => r.type === 'same-path' && /no redirect needed/.test(r.note)).length;
  const summary = {
    map: outPath,
    old: { urls: oldEntries.length, source: oldSrc.info, ignoredLines: oldBuilt.ignored, skippedAssets: oldBuilt.assets, ...(priority ? { addedFromPriorityFile: priority.added } : {}) },
    new: { urls: newEntries.length, source: newSrc.info, ignoredLines: newBuilt.ignored, skippedAssets: newBuilt.assets },
    domainChange,
    counts,
    needRedirect: out.length - unchanged,
    unchanged,
    review: out.filter((r) => r.type === 'review').slice(0, 20).map((r) => ({ old: r.old, suggestion: r._suggestion, priority: r.priority || null })),
    uncertain: out.filter((r) => r.type !== 'review' && r.confidence !== 'high').slice(0, 20)
      .map((r) => ({ old: r.old, new: r.new, type: r.type, confidence: r.confidence, ...(r._score !== null ? { score: r._score } : {}) })),
    notes: [],
  };
  if (priority) summary.priority = { file: args.priority, column: priority.column, urlColumn: priority.urlColumn, pagesWithValue: priority.values.size };
  if (titles) summary.titles = titles;
  if (oldBuilt.assets) summary.notes.push(`${oldBuilt.assets} images/CSS/JS URLs were left out. If images get Image Search traffic, map them separately.`);
  if (!domainChange && oldHost && newListHost && siteKey(`https://${oldHost}/`) !== siteKey(`https://${newListHost}/`)) {
    summary.hostsDiffer = { old: oldHost, new: newListHost };
    summary.notes.push(`The lists are on different hosts (${oldHost} → ${newListHost}). Paths were mapped on the same domain. If this is a domain move, run again with --new-domain <host>; if the new list is a staging copy, ignore this.`);
  }
  if (domainChange) summary.notes.push(`Domain change ${domainChange.from} → ${domainChange.to}: old and new are full URLs. Also set up a domain-level redirect, and use Search Console's Change of Address tool after launch.`);
  if (counts.review) summary.notes.push(`${counts.review} pages have no match. Decide each one with the user: a relevant page, or 410 if gone on purpose. Never send them all to the homepage.`);
  summary.next = 'Review the "review" and "uncertain" rows with the user, fill the new column (or set status 410), then run: check <map.csv> --new <new source>';
  printJson(summary);
}

function stripSlash(p) {
  const [path, q] = String(p).split('?');
  const s = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return q === undefined ? s : `${s}?${q}`;
}

// ---------------------------------------------------------------------------
// Reading a map
// ---------------------------------------------------------------------------

function readMap(file) {
  if (!file) fail(`Missing the map file.\n${USAGE}`);
  if (!existsSync(file)) fail(`Map file not found: ${file}`);
  const { header, rows } = readTable(file);
  const norm = header.map(normHeader);
  const find = (names) => {
    for (const n of names) { const i = norm.indexOf(n); if (i !== -1) return i; }
    return -1;
  };
  const oi = find(['old', 'old url', 'old path', 'source', 'source url', 'redirect from', 'from']);
  const ni = find(['new', 'new url', 'new path', 'target', 'target url', 'redirect to', 'to', 'destination']);
  if (oi === -1 || ni === -1) fail(`${file} needs a header row with "old" and "new" columns (found: ${header.join(', ') || 'nothing'}).`);
  const col = (name) => norm.indexOf(name);
  const si = col('status');
  const extras = header.map((h, i) => ({ h, i })).filter(({ h, i }) => i !== oi && i !== ni && !MAP_COLUMNS.includes(normHeader(h)));
  const out = rows.map((r, idx) => {
    const statusRaw = si === -1 ? '' : (r[si] || '').trim();
    const status = statusRaw === '' ? 301 : Number(statusRaw);
    return {
      line: idx + 2,
      old: (r[oi] || '').trim(),
      new: (r[ni] || '').trim(),
      statusRaw,
      status,
      validStatus: REDIRECT_STATUSES.has(status) || status === 410,
      type: col('type') === -1 ? '' : (r[col('type')] || '').trim(),
      confidence: col('confidence') === -1 ? '' : (r[col('confidence')] || '').trim(),
      priority: col('priority') === -1 ? '' : (r[col('priority')] || '').trim(),
      note: col('note') === -1 ? '' : (r[col('note')] || '').trim(),
      extras: Object.fromEntries(extras.map(({ h, i }) => [h, r[i] ?? ''])),
    };
  }).filter((r) => r.old !== '' || r.new !== '');
  return { rows: out, extras: extras.map((e) => e.h) };
}

function writeMap(file, rows, extras) {
  const cols = [...MAP_COLUMNS, ...extras];
  const lines = [cols.join(','), ...rows.map((r) => csvLine([r.old, r.new, r.statusRaw || String(r.status), r.type, r.confidence, r.priority, r.note, ...extras.map((h) => r.extras[h])]))];
  ensureDir(file);
  writeFileSync(file, `${lines.join('\n')}\n`);
}

/** Split a map value into host/path parts. Relative paths have host ''. */
function parseRef(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      return { absolute: true, host: u.hostname.toLowerCase(), origin: u.origin, pathname: u.pathname || '/', search: u.search, valid: true };
    } catch { return { valid: false }; }
  }
  if (v.startsWith('/')) {
    const q = v.indexOf('?');
    return { absolute: false, host: '', origin: '', pathname: q === -1 ? v : v.slice(0, q), search: q === -1 ? '' : v.slice(q), valid: true };
  }
  return { valid: false };
}

/** Build lookup keys for a map value. Hosts that belong to the site are ignored so /a and https://site/a compare equal. */
function refKeys(ref, siteKeys) {
  const hostPart = ref.absolute && !siteKeys.has(siteKey(`${ref.origin}/`)) ? ref.host : '';
  const raw = `${hostPart}${ref.pathname}${ref.search}`;
  const slashless = `${hostPart}${ref.pathname.length > 1 ? ref.pathname.replace(/\/+$/, '') : ref.pathname}${ref.search}`;
  return { raw, slashless, lower: slashless.toLowerCase() };
}

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------

async function cmdCheck() {
  const file = args._[1];
  const { rows, extras } = readMap(file);
  if (!rows.length) fail(`${file} has no rows.`);
  let newSrc = null;
  let newKeys = null;
  // oldKeys: hosts where the old URLs live (ignored when comparing paths, so /a equals https://old-site/a).
  // siteKeys: old and new site hosts (anything else is an external website).
  const oldKeys = new Set();
  for (const r of rows) { const p = parseRef(r.old); if (p?.valid && p.absolute) oldKeys.add(siteKey(`${p.origin}/`)); }
  if (flag('old-domain')) oldKeys.add(siteKey(`https://${stripHost(flag('old-domain'))}/`));
  const siteKeys = new Set(oldKeys);
  if (flag('new-domain')) siteKeys.add(siteKey(`https://${stripHost(flag('new-domain'))}/`));
  if (args.new) {
    newSrc = await loadSource(flag('new'), 'new');
    if (newSrc.loose) newSrc.urls = newSrc.urls.map((u) => (/^(https?:\/\/|\/)/i.test(u) || DOMAIN_LIKE.test(u) ? u : `/${u}`));
    for (const u of newSrc.urls) { const p = parseRef(u); if (p?.valid && p.absolute) siteKeys.add(siteKey(`${p.origin}/`)); }
  }
  // If we still don't know the new site's host, assume the most common absolute target host is it.
  const targets = rows.map((r) => parseRef(r.new)).filter((p) => p?.valid);
  const targetHosts = targets.filter((p) => p.absolute).map((p) => siteKey(`${p.origin}/`));
  const assumedNewHost = targetHosts.some((h) => siteKeys.has(h)) ? null : mostCommon(targetHosts);
  if (assumedNewHost && targetHosts.filter((h) => h === assumedNewHost).length >= targets.length / 2) siteKeys.add(assumedNewHost);
  if (newSrc) {
    newKeys = { raw: new Set(), slashless: new Map(), lower: new Map() };
    for (const u of newSrc.urls) {
      const p = parseRef(u);
      if (!p?.valid) continue;
      const k = refKeys(p, siteKeys);
      newKeys.raw.add(k.raw);
      newKeys.slashless.set(k.slashless, u);
      newKeys.lower.set(k.lower, u);
    }
  }

  let fixed = null;
  let working = rows;
  if (args.fix) {
    const res = analyse(working, oldKeys, siteKeys, newKeys);
    const finalFor = new Map(res.chains.filter((c) => !c.toGone && !c.loop).map((c) => [c.row, c.finalTarget]));
    const seen = new Set();
    let removed = 0;
    working = [];
    for (const r of rows) {
      const copy = { ...r };
      if (finalFor.has(r)) {
        copy.new = finalFor.get(r);
        copy.note = [r.note, `Chain flattened (was ${r.new})`].filter(Boolean).join('. ');
      }
      const k = `${copy.old}\u0000${copy.new}\u0000${copy.status}`;
      if (seen.has(k)) { removed++; continue; }
      seen.add(k);
      working.push(copy);
    }
    const outPath = flag('out') || file;
    writeMap(outPath, working, extras);
    fixed = { file: outPath, chainsFlattened: finalFor.size, duplicateRowsRemoved: removed };
  }

  const res = analyse(working, oldKeys, siteKeys, newKeys);
  const findings = res.findings.sort((a, b) => ({ fail: 0, warn: 1, info: 2 }[a.status] - { fail: 0, warn: 1, info: 2 }[b.status]) || a.id.localeCompare(b.id));
  const reportPath = flag('report') || join(dirname(file), `${basename(file, extname(file))}-check.json`);
  ensureDir(reportPath);
  writeFileSync(reportPath, `${JSON.stringify({ meta: { tool: 'power-up-kit/redirect-map check', version: VERSION, map: file, checkedAt: new Date().toISOString(), newSource: newSrc?.info || null }, stats: res.stats, findings }, null, 2)}\n`);
  printJson({
    map: file,
    clean: !findings.some((f) => f.status === 'fail'),
    stats: res.stats,
    ...(fixed ? { fixed } : {}),
    counts: { fail: findings.filter((f) => f.status === 'fail').length, warn: findings.filter((f) => f.status === 'warn').length, info: findings.filter((f) => f.status === 'info').length },
    findings: findings.map((f) => ({ ...f, examples: f.examples.slice(0, 8) })),
    fullReport: reportPath,
    ...(newSrc ? {} : { note: 'Add --new <new site source> to check that every target exists on the new site.' }),
  });
}

function analyse(rows, oldKeys, siteKeys, newKeys) {
  const findings = [];
  const add = (id, status, examples, fix, extra = {}) => {
    if (examples.length) findings.push({ id, status, count: examples.length, fix, ...extra, examples });
  };
  const show = (r) => `line ${r.line}: ${r.old} → ${r.new || '(empty)'}${r.status !== 301 ? ` [${r.statusRaw || r.status}]` : ''}`;
  const items = rows.map((r) => ({ r, s: parseRef(r.old), t: parseRef(r.new) }));

  const invalidStatus = [];
  const invalidSource = [];
  const invalidTarget = [];
  const emptyTarget = [];
  const goneWithTarget = [];
  const temporary = [];
  const selfRedirect = [];
  const slashOnly = [];
  const caseOnly = [];
  const querySources = [];
  const external = [];
  const homepage = [];
  const unchanged = [];
  let redirects = 0;
  let gone = 0;

  for (const it of items) {
    const { r, s, t } = it;
    if (!r.validStatus) { invalidStatus.push(`line ${r.line}: ${r.old} has status "${r.statusRaw}"`); continue; }
    if (!s?.valid) { invalidSource.push(`line ${r.line}: "${r.old}"`); continue; }
    it.sk = refKeys(s, oldKeys);
    if (s.search) querySources.push(show(r));
    if (r.status === 410) {
      gone++;
      if (r.new) goneWithTarget.push(show(r));
      continue;
    }
    if (!r.new) { emptyTarget.push(`line ${r.line}: ${r.old}${r.type === 'review' ? ' (review row — no match yet)' : ''}`); continue; }
    if (!t?.valid) { invalidTarget.push(`line ${r.line}: "${r.new}"`); continue; }
    it.tk = refKeys(t, oldKeys);
    if (it.sk.raw === it.tk.raw) {
      if (r.type === 'same-path') unchanged.push(show(r)); else selfRedirect.push(show(r));
      it.skip = true;
      continue;
    }
    if (it.sk.slashless === it.tk.slashless) {
      if (r.type === 'same-path') unchanged.push(show(r)); else slashOnly.push(show(r));
      it.skip = true;
      continue;
    }
    if (it.sk.lower === it.tk.lower) caseOnly.push(show(r));
    redirects++;
    if ([302, 303, 307].includes(r.status)) temporary.push(show(r));
    if (t.absolute && !siteKeys.has(siteKey(`${t.origin}/`))) external.push(show(r));
    const sHome = HOME_ALIASES.has(cleanPath(s.pathname)) && !s.search;
    if (cleanPath(t.pathname) === '/' && !t.search && !sHome && (!t.absolute || siteKeys.has(siteKey(`${t.origin}/`)))) homepage.push(show(r));
  }

  add('invalid-status', 'fail', invalidStatus, 'Use 301 (or 308) for moved pages and 410 for pages that are gone on purpose.');
  add('invalid-source', 'fail', invalidSource, 'Old URLs must start with / or http(s)://.');
  add('invalid-target', 'fail', invalidTarget, 'New URLs must start with / or http(s)://.');
  add('empty-target', 'fail', emptyTarget, 'Decide each one: the most relevant new page, or status 410 if the content is gone on purpose. Do not send them to the homepage.');
  add('gone-with-target', 'warn', goneWithTarget, 'A 410 row needs no target — remove it, or change the status to 301 if the page should redirect.');
  add('temporary-redirect', 'warn', temporary, 'Use 301 or 308 for a permanent move; temporary redirects keep the old URL in Google.');
  add('self-redirect', 'fail', selfRedirect, 'Old and new are the same URL — this loops. Remove the row or fix the target.');
  add('trailing-slash-only', 'warn', slashOnly, 'Only the trailing slash differs. Most platforms handle this themselves; on Netlify such a rule loops. Remove the row unless you need it.');
  add('case-only', 'warn', caseOnly, 'Only letter case differs. On platforms that match paths without case (e.g. Vercel bulk redirects by default) this rule loops — test it.');
  add('query-in-source', 'warn', querySources, 'Old URLs with ?query: the Apache, nginx, Vercel, Next.js and WordPress exports handle them; Netlify, Cloudflare, Shopify, Webflow and Framer exports leave them out — set those up by hand and test them.');
  add('external-target', 'warn', external, 'These go to another website. Check this is intended.');
  if (homepage.length >= 3) add('homepage-redirects', 'fail', homepage, 'Google may treat mass redirects to the homepage as soft 404s, so the old pages lose their value. Map each page to its closest relevant page, or use 410 if the content is gone.');
  else add('homepage-redirects', 'warn', homepage, 'A page that redirects to the homepage may be treated as a soft 404. Prefer the closest relevant page.');
  add('unchanged', 'info', unchanged, 'Same URL on the new site — no redirect needed. Exports skip these rows.');

  // Duplicate sources.
  const bySource = new Map();
  for (const it of items) if (it.sk) {
    if (!bySource.has(it.sk.raw)) bySource.set(it.sk.raw, []);
    bySource.get(it.sk.raw).push(it);
  }
  const dupConflict = [];
  const dupSame = [];
  const caseVariants = new Map();
  for (const [, list] of [...bySource.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (list.length > 1) {
      const targets = new Set(list.map((x) => `${x.r.status} ${x.tk?.raw || x.r.new}`));
      if (targets.size > 1) dupConflict.push(`${list[0].r.old} → ${list.map((x) => `${x.r.new || `(${x.r.status})`} (line ${x.r.line})`).join(' | ')}`);
      else dupSame.push(`${list[0].r.old} (lines ${list.map((x) => x.r.line).join(', ')})`);
    }
    const lk = list[0].sk.lower;
    if (!caseVariants.has(lk)) caseVariants.set(lk, []);
    caseVariants.get(lk).push(list[0].r.old);
  }
  add('duplicate-source', 'fail', dupConflict, 'The same old URL has different targets — only one can win. Keep one row.');
  add('duplicate-row', 'warn', dupSame, 'The same row appears more than once. Remove the copies (check --fix does this).');
  add('case-variant-sources', 'info', [...caseVariants.values()].filter((v) => v.length > 1).map((v) => v.join(' | ')),
    'These old URLs differ only by letter case. Fine if both were real URLs.');

  // Chains and loops (trailing slash ignored, as most platforms treat /a and /a/ alike).
  const graph = new Map();
  for (const it of items) {
    if (!it.sk || it.skip || !it.r.validStatus) continue;
    if (!graph.has(it.sk.slashless)) graph.set(it.sk.slashless, it);
  }
  const chains = [];
  const loops = new Map();
  for (const it of items) {
    if (!it.tk || it.skip || it.r.status === 410) continue;
    const path = [it.r.old];
    const visited = new Set([it.sk.slashless]);
    let cur = it;
    let hops = 1;
    let loop = false;
    let toGone = false;
    while (true) {
      const next = graph.get(cur.tk.slashless);
      if (!next) break;
      if (next.r.status === 410) { toGone = true; path.push(next.r.old); break; }
      if (!next.tk) break;
      if (visited.has(next.sk.slashless)) { loop = true; path.push(next.r.old); break; }
      visited.add(next.sk.slashless);
      path.push(next.r.old);
      cur = next;
      hops++;
      if (hops > 50) { loop = true; break; }
    }
    if (loop) {
      const start = path.indexOf(path[path.length - 1]);
      const cycle = path.slice(start, -1);
      const keyed = [...cycle].sort().join(' ');
      if (!loops.has(keyed)) loops.set(keyed, [...cycle, cycle[0]].join(' → '));
      chains.push({ row: it.r, loop: true });
    } else if (toGone) {
      chains.push({ row: it.r, toGone: true, path });
    } else if (hops > 1) {
      chains.push({ row: it.r, finalTarget: cur.r.new, hops, path: [...path, cur.r.new] });
    }
  }
  const chainRows = chains.filter((c) => c.finalTarget);
  add('chain', 'fail', chainRows.map((c) => `line ${c.row.line}: ${c.path.join(' → ')} — point ${c.row.old} straight to ${c.finalTarget}`),
    'Each extra hop slows visitors and loses signals. Point every old URL straight to its final target (check --fix does this).',
    { flattened: chainRows.map((c) => ({ old: c.row.old, was: c.row.new, finalTarget: c.finalTarget, hops: c.hops })) });
  add('chain-to-gone', 'fail', chains.filter((c) => c.toGone).map((c) => `line ${c.row.line}: ${c.path.join(' → ')} (410)`),
    'This redirects to a page that is marked 410 (gone). Pick another target or mark the row 410 too.');
  add('loop', 'fail', [...loops.values()].sort(), 'Redirect loop — the page can never load. Break the loop by fixing one of the targets.');

  // Targets missing from the new site.
  if (newKeys) {
    const missing = [];
    const formDiffers = [];
    for (const it of items) {
      if (!it.tk || it.skip || it.r.status === 410) continue;
      if (it.t.absolute && !siteKeys.has(siteKey(`${it.t.origin}/`))) continue;
      const k = refKeys(it.t, siteKeys);
      if (newKeys.raw.has(k.raw)) continue;
      const alt = newKeys.slashless.get(k.slashless) || newKeys.lower.get(k.lower);
      if (alt) formDiffers.push(`line ${it.r.line}: ${it.r.new} — the new site lists it as ${alt}`);
      else if (!graph.has(it.tk.slashless)) missing.push(show(it.r));
    }
    add('target-missing', 'fail', missing, 'The target is not in the new site\'s URL list — it may 404. Fix the target or add the page.');
    add('target-form-differs', 'warn', formDiffers, 'Use the exact form the new site uses (trailing slash, letter case), or visitors get a second redirect.');
  } else {
    // Without a new URL list, at least flag mixed trailing-slash styles in targets.
    const withSlash = [];
    const without = [];
    for (const it of items) {
      if (!it.tk || it.skip || it.r.status === 410) continue;
      const p = it.t.pathname;
      if (p === '/' || /\.[a-z0-9]{2,5}$/i.test(p)) continue;
      (p.endsWith('/') ? withSlash : without).push(show(it.r));
    }
    if (withSlash.length && without.length) {
      const minority = withSlash.length <= without.length ? withSlash : without;
      add('mixed-trailing-slash', 'warn', minority, `Targets mix /page and /page/ (${withSlash.length} with, ${without.length} without). Use the form the new site uses, or each redirect gets a second hop.`);
    }
  }

  // Pattern suggestions: many rows that only swap a folder.
  const groups = new Map();
  for (const it of items) {
    if (!it.tk || it.skip || it.r.status === 410 || it.s.search || (it.t.absolute && !siteKeys.has(siteKey(`${it.t.origin}/`)))) continue;
    const a = it.s.pathname.split('/').filter(Boolean);
    const b = it.t.pathname.split('/').filter(Boolean);
    let k = 0;
    while (k < a.length && k < b.length && a[a.length - 1 - k] === b[b.length - 1 - k]) k++;
    if (k < 1 || k >= a.length) continue;
    const from = `/${a.slice(0, a.length - k).join('/')}`;
    const to = b.length - k ? `/${b.slice(0, b.length - k).join('/')}` : '';
    if (from === to) continue;
    const key = `${from}\u0000${to}`;
    if (!groups.has(key)) groups.set(key, { from, to, rows: [] });
    groups.get(key).rows.push(it);
  }
  const patterns = [...groups.values()].filter((g) => g.rows.length >= 3).sort((x, y) => y.rows.length - x.rows.length || x.from.localeCompare(y.from)).map((g) => {
    const inFolder = items.filter((it) => it.s?.valid && it.s.pathname.startsWith(`${g.from}/`));
    const exceptions = inFolder.length - g.rows.length;
    const other = exceptions === 1 ? '1 other row' : `${exceptions} other rows`;
    return `${g.from}/* → ${g.to}/* covers ${g.rows.length} rows${exceptions > 0 ? ` (${other} in ${g.from}/ ${exceptions === 1 ? 'goes' : 'go'} elsewhere — keep ${exceptions === 1 ? 'it' : 'them'} above the wildcard rule)` : ''}`;
  });
  add('pattern-suggestion', 'info', patterns, 'One wildcard rule can replace these rows (e.g. Netlify: /news/* /blog/:splat 301). Keep exact rules above wildcard rules. Only use it if every page in the folder follows the pattern.');

  return {
    findings,
    chains,
    stats: { rows: rows.length, redirects, gone, unchanged: unchanged.length, emptyTargets: emptyTarget.length },
  };
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

const DEFAULT_FILE = {
  netlify: '_redirects', vercel: 'vercel-redirects.json', next: 'next-redirects.js', apache: 'htaccess-redirects.txt',
  nginx: 'nginx-redirects.conf', cloudflare: 'cloudflare-bulk-redirects.csv', shopify: 'shopify-redirects.csv',
  wordpress: 'redirection-import.csv', webflow: 'webflow-redirects.csv', framer: 'framer-redirects.csv', csv: 'redirects.csv',
};

const WHERE = {
  netlify: 'Save as _redirects in the site\'s publish folder (or add the lines to the existing file) and deploy. Rules run top to bottom; the first match wins.',
  vercel: 'Copy the "redirects" array into vercel.json at the project root (merge with any existing redirects) and deploy. permanent: true sends 308, which Google treats like 301.',
  next: 'Copy the objects inside return [ … ] into the redirects() function in next.config.js (or use the file as next.config.js if you have no other settings) and deploy. permanent: true sends 308.',
  apache: 'Paste near the top of the .htaccess file in the site root, above the WordPress or CMS rules. Needs mod_rewrite. Test on staging first: a mistake in .htaccess can take the site down.',
  nginx: 'Paste inside the server { } block that serves the old URLs, then run nginx -t and reload nginx.',
  cloudflare: 'Cloudflare dashboard → Bulk Redirects: create a URL redirect list, import this CSV, then create a Bulk Redirect rule that uses the list. The CSV has no header row on purpose.',
  shopify: 'Shopify admin → Content → Menus → URL redirects → Import. Redirects only work when the old path has no live page on the store.',
  wordpress: 'WordPress admin → Tools → Redirection → Import/Export → Import (Redirection plugin). The CSV has no header row: source, target, regex (0 = no), HTTP code.',
  webflow: 'Webflow → Site settings → Publishing → 301 redirects → Import, then publish. An import REPLACES all existing redirects: export the current ones first and add them to this file. Webflow does not document the header names — if its export uses different ones, copy them. Redirects work on published sites with a paid site plan.',
  framer: 'Framer has no import here: add each pair under Site Settings → Hosting → Redirects (or use a redirects plugin from the Framer Marketplace), then publish.',
  csv: 'Generic list: old, new, status. Use it for platforms not listed here or to share with a developer.',
};

const LIMITS = {
  vercel: 2048,
  cloudflare: 10000,
  shopify: 100000,
};

function cmdExport() {
  const file = args._[1];
  const format = String(flag('format') || '').toLowerCase();
  if (!format) fail(`Missing --format. Choose one of: ${FORMATS.join(', ')}`);
  if (!FORMATS.includes(format)) fail(`Unknown format "${format}". Choose one of: ${FORMATS.join(', ')}`);
  const { rows } = readMap(file);
  if (!rows.length) fail(`${file} has no rows.`);

  const oldDomain = stripHost(flag('old-domain'));
  const newDomain = stripHost(flag('new-domain'));
  const items = [];
  const skipped = [];
  let unchanged = 0;
  const hostCounts = [];
  for (const r of rows) {
    const s = parseRef(r.old);
    if (s?.valid && s.absolute) hostCounts.push(s.host);
  }
  const oldHost = oldDomain || mostCommon(hostCounts);
  const siteKeys = new Set(oldHost ? [siteKey(`https://${oldHost}/`)] : []);
  let domainTarget = null;

  for (const r of rows) {
    const s = parseRef(r.old);
    const t = parseRef(r.new);
    if (!r.validStatus) { skipped.push({ line: r.line, old: r.old, reason: `invalid status "${r.statusRaw}"` }); continue; }
    if (!s?.valid) { skipped.push({ line: r.line, old: r.old, reason: 'old URL must start with / or http(s)://' }); continue; }
    if (r.status !== 410) {
      if (!r.new) { skipped.push({ line: r.line, old: r.old, reason: 'no target yet — pick a relevant page or set 410, then run check' }); continue; }
      if (!t?.valid) { skipped.push({ line: r.line, old: r.old, reason: `new URL must start with / or http(s)://: "${r.new}"` }); continue; }
      const sk = refKeys(s, siteKeys);
      const tk = refKeys(t, siteKeys);
      if (sk.slashless === tk.slashless) { unchanged++; continue; }
    }
    const host = s.absolute ? s.host : oldHost || '';
    const crossDomain = Boolean(t?.absolute && host && t.host !== host && siteKey(`https://${t.host}/`) !== siteKey(`https://${host}/`)
      && (newDomain ? t.host === newDomain : true));
    const samePathMove = crossDomain && t.pathname === s.pathname && t.search === s.search;
    if (crossDomain && !domainTarget) domainTarget = { from: host, to: t.host, scheme: t.origin.split(':')[0] };
    items.push({
      line: r.line,
      old: r.old,
      host,
      pathname: s.pathname,
      search: s.search,
      from: encodeUrlish(s.pathname + s.search),
      fromPath: encodeUrlish(s.pathname),
      to: r.status === 410 ? '' : encodeUrlish(r.new),
      status: r.status,
      gone: r.status === 410,
      crossDomain,
      samePathMove,
    });
  }

  const ctx = { file, date: isoDate(), skipped, oldHost, newDomain, force: Boolean(args.force), domainTarget };
  const built = EXPORTERS[format](items, ctx);
  const outPath = flag('out') || join(dirname(file), `${basename(file, extname(file))}-${format}`, DEFAULT_FILE[format]);
  ensureDir(outPath);
  writeFileSync(outPath, built.text);
  const warnings = [...(built.warnings || [])];
  if (LIMITS[format] && built.rules > LIMITS[format]) {
    warnings.push({
      vercel: `Vercel allows 2,048 redirects in vercel.json. Use Vercel bulk redirects (Pro/Enterprise) or wildcard rules for the rest.`,
      cloudflare: 'Cloudflare Free allows 10,000 URL redirects across lists (Pro 25,000, Business 50,000). Check your plan.',
      shopify: 'Shopify allows 100,000 URL redirects (more on Plus).',
    }[format]);
  }
  if (domainTarget) warnings.push(`Domain change ${domainTarget.from} → ${domainTarget.to}: also set up the domain-level redirect (hostRule) so URLs not in this list still land on the same path, and use Search Console's Change of Address tool after launch.`);
  const byReason = {};
  for (const s of skipped) byReason[s.reason] = (byReason[s.reason] || 0) + 1;
  printJson({
    format,
    file: outPath,
    rules: built.rules,
    gone: built.gone || 0,
    unchangedSkipped: unchanged,
    skipped: { count: skipped.length, byReason, examples: skipped.slice(0, 10) },
    whereToUse: WHERE[format],
    ...(built.hostRule ? { hostRule: built.hostRule } : {}),
    warnings,
  });
}

function hostRuleText(format, d) {
  if (!d) return null;
  const to = `${d.scheme}://${d.to}`;
  return {
    netlify: `https://${d.from}/* ${to}/:splat 301!  (keep it LAST; the old domain must be added to this Netlify site)`,
    vercel: `{ "source": "/:path*", "has": [{ "type": "host", "value": ${JSON.stringify(regexEscape(d.from))} }], "destination": "${to}/:path*", "permanent": true }  (put it last), or set a domain redirect under Project → Domains`,
    next: `{ source: '/:path*', has: [{ type: 'host', value: ${JSON.stringify(regexEscape(d.from))} }], destination: '${to}/:path*', permanent: true }  (put it last)`,
    apache: `RewriteCond %{HTTP_HOST} ^${regexEscape(d.from)}$ [NC]\nRewriteRule ^(.*)$ ${to}/$1 [R=301,L]  (after the rules above)`,
    nginx: `location / { return 301 ${to}$request_uri; }  (in the old domain's server block; exact rules above still win)`,
    cloudflare: `${d.from}/,${to}/,301,TRUE,TRUE,TRUE,TRUE  (catch-all with subpath matching — check how it combines with the exact rules before adding it)`,
  }[format] || `Set a domain-level redirect from ${d.from} to ${d.to} in your host or DNS provider (keep the path).`;
}

function splitQuery(search) {
  return [...new URLSearchParams(search).entries()];
}

const EXPORTERS = {
  netlify(items, ctx) {
    const lines = [`# Netlify _redirects — generated by Power-Up Kit redirect-map on ${ctx.date} from ${basename(ctx.file)}`,
      '# old  new  status. The first matching rule wins: keep exact rules above any wildcard rules.'];
    const entries = [];
    let gone = 0;
    for (const it of items) {
      if (it.search) {
        entries.push(`# Query-string URL, set up by hand (see Netlify docs on query parameters): ${it.from} -> ${it.to || '410'}`);
        ctx.skipped.push({ line: it.line, old: it.old, reason: 'query-string source — Netlify needs a hand-made query rule' });
        continue;
      }
      if (it.gone) {
        entries.push(`# 410 ${it.from} — no rule needed: Netlify answers 404 for paths that don't exist (Google treats 404 and 410 alike for removed pages)`);
        gone++;
        continue;
      }
      const status = it.status === 307 || it.status === 303 ? 302 : it.status === 308 ? 301 : it.status;
      const from = it.crossDomain ? `https://${it.host}${it.from}` : it.from;
      entries.push([from, it.to, `${status}${ctx.force || it.crossDomain ? '!' : ''}`]);
    }
    const rules = entries.filter(Array.isArray);
    const w = Math.min(60, Math.max(0, ...rules.map((r) => r[0].length)));
    for (const e of entries) lines.push(Array.isArray(e) ? `${e[0].padEnd(w)}  ${e[1]}  ${e[2]}` : e);
    return { text: `${lines.join('\n')}\n`, rules: rules.length, gone, hostRule: hostRuleText('netlify', ctx.domainTarget),
      warnings: ctx.domainTarget ? ['Domain change: sources are full URLs (https://old-domain/path) so they only fire on the old domain. If the old domain also serves http, add the http:// versions or turn on HTTPS.'] : [] };
  },

  vercel(items, ctx) {
    const redirects = vercelLike(items, ctx);
    const text = `${JSON.stringify({ $schema: 'https://openapi.vercel.sh/vercel.json', redirects }, null, 2)}\n`;
    return { text, rules: redirects.length, hostRule: hostRuleText('vercel', ctx.domainTarget) };
  },

  next(items, ctx) {
    const redirects = vercelLike(items, ctx);
    const J = JSON.stringify;
    const obj = (r) => {
      const has = r.has ? `, has: [${r.has.map((h) => `{ type: ${J(h.type)}, ${h.key !== undefined ? `key: ${J(h.key)}, ` : ''}value: ${J(h.value)} }`).join(', ')}]` : '';
      return `      { source: ${J(r.source)}${has}, destination: ${J(r.destination)}, permanent: ${r.permanent} },`;
    };
    const text = [
      `// Next.js redirects — generated by Power-Up Kit redirect-map on ${ctx.date} from ${basename(ctx.file)}`,
      '// Copy the objects inside return [ ... ] into the redirects() function of your next.config.js,',
      '// or use this file as next.config.js if you have no other settings. permanent: true sends 308.',
      'module.exports = {',
      '  async redirects() {',
      '    return [',
      ...redirects.map(obj),
      '    ];',
      '  },',
      '};',
      '',
    ].join('\n');
    return { text, rules: redirects.length, hostRule: hostRuleText('next', ctx.domainTarget) };
  },

  apache(items, ctx) {
    const lines = [`# Apache .htaccess redirects — generated by Power-Up Kit redirect-map on ${ctx.date} from ${basename(ctx.file)}`,
      '# Paste near the TOP of .htaccess, above the WordPress or CMS rules. Folder-style paths also match with a trailing slash.',
      '<IfModule mod_rewrite.c>', 'RewriteEngine On'];
    let rules = 0;
    let gone = 0;
    for (const it of items) {
      const decoded = safeDecode(it.pathname).replace(/^\/+/, '');
      const body = regexEscape(decoded.replace(/\/+$/, '')).replace(/\s/g, '\\s');
      const fileLike = /\.[a-z0-9]{1,5}$/i.test(decoded);
      const pattern = it.search || fileLike ? `^${regexEscape(decoded).replace(/\s/g, '\\s')}$` : body ? `^${body}/?$` : '^$';
      // mod_rewrite reads $N and %N in the target as back-references, so write the target decoded and
      // let Apache percent-encode it (its default for redirects). Targets that still contain $ or % are left out.
      const target = it.gone ? '-' : safeDecode(it.to);
      if (!it.gone && /[$%]/.test(target)) {
        ctx.skipped.push({ line: it.line, old: it.old, reason: 'target contains $ or % — write this rule by hand' });
        continue;
      }
      if (it.crossDomain || (ctx.domainTarget && it.host)) lines.push(`RewriteCond %{HTTP_HOST} ^${regexEscape(it.host)}$ [NC]`);
      if (it.search) lines.push(`RewriteCond %{QUERY_STRING} ^${regexEscape(it.search.slice(1))}$`);
      if (it.gone) {
        lines.push(`RewriteRule ${pattern} - [G,L]`);
        gone++;
        continue;
      }
      const flags = [];
      if (it.search && !target.includes('?')) flags.push('QSD');
      flags.push(`R=${it.status}`);
      if (target.includes('#')) flags.push('NE');
      flags.push('L');
      const quoted = /[\s"]/.test(target) ? `"${target.replace(/"/g, '\\"')}"` : target;
      lines.push(`RewriteRule ${pattern} ${quoted} [${flags.join(',')}]`);
      rules++;
    }
    lines.push('</IfModule>');
    if (ctx.domainTarget) lines.push('', '# Domain change — catch-all for the old domain (add it after the rules above, inside the IfModule block):', ...hostRuleText('apache', ctx.domainTarget).split('\n').map((l) => `# ${l}`));
    return { text: `${lines.join('\n')}\n`, rules, gone, hostRule: hostRuleText('apache', ctx.domainTarget) };
  },

  nginx(items, ctx) {
    const lines = [`# nginx redirects — generated by Power-Up Kit redirect-map on ${ctx.date} from ${basename(ctx.file)}`,
      `# Paste inside the server { } block that serves the old URLs${ctx.domainTarget ? ` (${ctx.domainTarget.from})` : ''}, then run: nginx -t && nginx -s reload`];
    const quote = (s) => (/[\s;{}"'#$\\]/.test(s) ? `"${s.replace(/[\\"]/g, '\\$&')}"` : s);
    let rules = 0;
    let gone = 0;
    const queryLines = [];
    for (const it of items) {
      const target = it.to.replace(/\$/g, '%24');
      const action = it.gone ? 'return 410;' : `return ${it.status} ${quote(target)};`;
      if (it.search) {
        queryLines.push(`if ($request_uri = "${it.from.replace(/[\\"]/g, '\\$&')}") { ${action} }`);
      } else {
        lines.push(`location = ${quote(safeDecode(it.pathname))} { ${action} }`);
      }
      if (it.gone) gone++; else rules++;
    }
    if (queryLines.length) lines.push('# Old URLs with a query string (exact match on the full request URI):', ...queryLines);
    if (ctx.domainTarget) lines.push('# Domain change — catch-all for the old domain (other old URLs keep their path):', `# ${hostRuleText('nginx', ctx.domainTarget)}`);
    return { text: `${lines.join('\n')}\n`, rules, gone, hostRule: hostRuleText('nginx', ctx.domainTarget) };
  },

  cloudflare(items, ctx) {
    const lines = [];
    let rules = 0;
    for (const it of items) {
      if (!it.host) fail('Cloudflare Bulk Redirects need the old domain in each source URL. Add --old-domain example.com.');
      if (it.gone) { ctx.skipped.push({ line: it.line, old: it.old, reason: '410 — Bulk Redirects only redirect; let the origin answer 404/410' }); continue; }
      if (it.search) { ctx.skipped.push({ line: it.line, old: it.old, reason: 'query-string source — use a Single Redirect rule instead' }); continue; }
      const target = /^https?:\/\//i.test(it.to) ? it.to : `https://${ctx.newDomain || it.host}${it.to}`;
      const status = [301, 302, 307, 308].includes(it.status) ? it.status : 301;
      lines.push(csvLine([`${it.host}${it.from}`, target, status, target.includes('?') ? 'FALSE' : 'TRUE', 'FALSE', 'FALSE', 'FALSE']));
      rules++;
    }
    return { text: lines.length ? `${lines.join('\n')}\n` : '', rules, hostRule: hostRuleText('cloudflare', ctx.domainTarget),
      warnings: ['Columns: source URL, target URL, status, preserve query string, include subdomains, subpath matching, preserve path suffix. Source URLs have no scheme, so they match http and https.'] };
  },

  shopify(items, ctx) {
    return pathList(items, ctx, ['Redirect from', 'Redirect to'], 'shopify', '410 — Shopify answers 404 for removed pages; no redirect needed');
  },

  wordpress(items, ctx) {
    const lines = [];
    let rules = 0;
    for (const it of items) {
      if (it.gone) { ctx.skipped.push({ line: it.line, old: it.old, reason: '410 — the CSV import only takes redirects; add it by hand in Redirection as an error (410) action' }); continue; }
      if (it.samePathMove) { ctx.skipped.push({ line: it.line, old: it.old, reason: 'same path on the new domain — covered by the domain-level redirect' }); continue; }
      const code = [301, 302, 303, 307, 308].includes(it.status) ? it.status : 301;
      lines.push(csvLine([it.from, it.to, 0, code]));
      rules++;
    }
    return { text: lines.length ? `${lines.join('\n')}\n` : '', rules, hostRule: hostRuleText('wordpress', ctx.domainTarget),
      warnings: items.some((i) => i.search) ? ['Some old URLs have a query string: check the query parameter option of those redirects in the Redirection plugin after import.'] : [] };
  },

  webflow(items, ctx) {
    return pathList(items, ctx, ['source', 'target'], 'webflow', '410 — Webflow answers 404 for pages that no longer exist; no redirect needed');
  },

  framer(items, ctx) {
    return pathList(items, ctx, ['Old path', 'New path'], 'framer', '410 — Framer answers 404 for pages that no longer exist; no redirect needed');
  },

  csv(items, ctx) {
    const lines = [csvLine(['old', 'new', 'status'])];
    for (const it of items) lines.push(csvLine([it.crossDomain ? `https://${it.host}${it.from}` : it.from, it.to, it.status]));
    return { text: `${lines.join('\n')}\n`, rules: items.filter((i) => !i.gone).length, gone: items.filter((i) => i.gone).length, hostRule: hostRuleText('csv', ctx.domainTarget) };
  },
};

function vercelLike(items, ctx) {
  const out = [];
  for (const it of items) {
    if (it.gone) { ctx.skipped.push({ line: it.line, old: it.old, reason: '410 — redirects cannot return 410; the removed page will answer 404' }); continue; }
    const source = safeDecode(it.pathname).replace(/[(){}:*+?]/g, '\\$&');
    const has = [];
    if (it.crossDomain) has.push({ type: 'host', value: regexEscape(it.host) });
    for (const [key, value] of splitQuery(it.search)) has.push({ type: 'query', key, value: regexEscape(value) });
    const r = { source: encodeUrlish(source).replace(/%5C/gi, '\\') };
    if (has.length) r.has = has;
    r.destination = it.to;
    r.permanent = it.status === 301 || it.status === 308;
    out.push(r);
  }
  return out;
}

const PATTERN_CHARS = {
  webflow: { re: /[()*%?=&]/, reason: 'special characters — Webflow reads ( ) * ? = & % as pattern characters; add by hand (escape them with %) and test' },
  framer: { re: /[*:]/, reason: 'special characters — Framer reads * and : as wildcard characters; add by hand and test' },
};

function pathList(items, ctx, header, format, goneReason) {
  const lines = [csvLine(header)];
  let rules = 0;
  const warnings = [];
  for (const it of items) {
    if (it.gone) { ctx.skipped.push({ line: it.line, old: it.old, reason: goneReason }); continue; }
    if (it.search) { ctx.skipped.push({ line: it.line, old: it.old, reason: 'query-string source — add by hand and test' }); continue; }
    if (PATTERN_CHARS[format]?.re.test(it.fromPath)) { ctx.skipped.push({ line: it.line, old: it.old, reason: PATTERN_CHARS[format].reason }); continue; }
    if (it.samePathMove) { ctx.skipped.push({ line: it.line, old: it.old, reason: 'same path on the new domain — covered by the domain-level redirect' }); continue; }
    if (![301, 308].includes(it.status) && !warnings.length) warnings.push('This platform has no status column: rows marked 302/307 are imported as normal permanent redirects.');
    lines.push(csvLine([it.from, it.to]));
    rules++;
  }
  return { text: `${lines.join('\n')}\n`, rules, hostRule: hostRuleText(format, ctx.domainTarget), warnings };
}

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

function compareKey(url) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    let p = u.pathname.replace(/\/{2,}/g, '/');
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return `${u.host.toLowerCase()}${safeDecode(p)}${u.search}`;
  } catch {
    return url;
  }
}

async function cmdVerify() {
  const file = args._[1];
  const { rows } = readMap(file);
  if (!rows.length) fail(`${file} has no rows.`);
  const base = flag('base');
  let baseUrl = null;
  if (base) {
    try { baseUrl = new URL(/^https?:\/\//i.test(base) ? base : `https://${base}`); } catch { fail(`--base is not a valid URL: ${base}`); }
  }
  const concurrency = Math.min(toInt(args.concurrency, 3), 8);
  const delayMs = args.delay === undefined ? 150 : Math.max(0, Number(args.delay) || 0);
  const max = toInt(args.max, 1000);

  const todo = [];
  const notChecked = [];
  for (const r of rows) {
    const s = parseRef(r.old);
    if (!r.validStatus || !s?.valid) { notChecked.push({ line: r.line, old: r.old, reason: 'invalid row — run check' }); continue; }
    if (r.status !== 410 && !r.new) { notChecked.push({ line: r.line, old: r.old, reason: 'no target in the map' }); continue; }
    if (!s.absolute && !baseUrl) fail('The map has relative paths (/old-page). Add --base https://your-site.com so they can be requested.');
    const oldUrl = s.absolute ? r.old : new URL(r.old, baseUrl).href;
    let expected = null;
    if (r.status !== 410) {
      try { expected = new URL(r.new, oldUrl).href; } catch { notChecked.push({ line: r.line, old: r.old, reason: 'invalid target' }); continue; }
    }
    // http:// → https:// is a real redirect even though host and path stay the same.
    const unchanged = expected !== null && compareKey(oldUrl) === compareKey(expected)
      && new URL(oldUrl).protocol === new URL(expected).protocol;
    todo.push({ row: r, oldUrl, expected, unchanged });
  }
  const limited = todo.slice(0, max);
  for (const t of todo.slice(max)) notChecked.push({ line: t.row.line, old: t.row.old, reason: `over --max ${max}` });

  const results = await mapLimit(limited, concurrency, async (t) => {
    let res = await fetchWithRedirects(t.oldUrl, { method: 'HEAD', timeoutMs: 15000 });
    if ([0, 400, 403, 405, 501].includes(res.status)) res = await fetchWithRedirects(t.oldUrl, { timeoutMs: 20000, maxBytes: 200_000 });
    const hops = res.chain.length;
    const first = hops ? res.chain[0].status : res.status;
    const problems = [];
    let status = 'pass';
    const worse = (s) => { if (s === 'fail' || (s === 'warn' && status === 'pass')) status = s; };
    if (res.status === 0) {
      problems.push(`could not load: ${res.error}`);
      worse('fail');
    } else if (t.row.status === 410) {
      if (!hops && res.status === 410) { /* pass */ } else if (!hops && res.status === 404) problems.push('answers 404 (410 is a slightly clearer "gone" signal; both are fine)');
      else if (hops) { problems.push(`redirects (${first}) to ${res.url} but the map says 410`); worse('fail'); }
      else { problems.push(`answers ${res.status} — the page still loads; it should be 410 or 404`); worse('fail'); }
    } else if (t.unchanged) {
      if (res.status !== 200) { problems.push(`unchanged URL answers ${res.status}`); worse('fail'); }
      if (hops) { problems.push(`unchanged URL redirects ${hops} time(s) to ${res.url}`); worse('warn'); }
    } else {
      if (!hops) {
        problems.push(res.status === 404 ? 'no redirect — the old URL answers 404' : `no redirect — the old URL answers ${res.status}`);
        worse('fail');
      } else {
        if ([302, 303, 307].includes(first)) { problems.push(`first redirect is ${first} (temporary) — use 301 or 308`); worse('warn'); }
        if (hops === 2) { problems.push('2 redirects in a row (chain) — point the old URL straight to the final page'); worse('warn'); }
        if (hops > 2) { problems.push(`${hops} redirects in a row — too many; point the old URL straight to the final page`); worse('fail'); }
        const sameScheme = new URL(res.url).protocol === new URL(t.expected).protocol;
        if (compareKey(res.url) !== compareKey(t.expected) || !sameScheme) { problems.push(`ends at ${res.url}, expected ${t.expected}`); worse('fail'); }
        if (res.status !== 200) { problems.push(`final page answers ${res.status}`); worse('fail'); }
      }
    }
    return {
      line: t.row.line, old: t.oldUrl, expected: t.row.status === 410 ? '410' : t.expected, status,
      firstStatus: first, hops, finalUrl: res.url, finalStatus: res.status, chain: res.chain.map((c) => `${c.status} ${c.url}`), problems,
    };
  }, { delayMs });

  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const r of results) counts[r.status]++;
  const host = baseUrl ? baseUrl.hostname : siteKey(limited[0]?.oldUrl || '') || 'site';
  const outPath = flag('out') || join('.powerup', 'redirects', `verify-${slugify(host)}-${isoDate()}.json`);
  ensureDir(outPath);
  writeFileSync(outPath, `${JSON.stringify({ meta: { tool: 'power-up-kit/redirect-map verify', version: VERSION, map: file, base: baseUrl?.href || null, checkedAt: new Date().toISOString(), userAgent: USER_AGENT }, counts, results, notChecked }, null, 2)}\n`);
  const order = { fail: 0, warn: 1, pass: 2 };
  const problems = results.filter((r) => r.status !== 'pass').sort((a, b) => order[a.status] - order[b.status] || a.line - b.line);
  printJson({
    map: file,
    base: baseUrl?.href || null,
    checked: results.length,
    ...counts,
    notChecked: notChecked.length,
    verdict: counts.fail ? 'fail' : counts.warn ? 'warn' : 'pass',
    problems: problems.slice(0, 25).map((r) => ({ line: r.line, old: r.old, status: r.status, problems: r.problems })),
    ...(notChecked.length ? { notCheckedExamples: notChecked.slice(0, 10) } : {}),
    fullReport: outPath,
  });
}

// ---------------------------------------------------------------------------

const COMMANDS = { match: cmdMatch, check: cmdCheck, export: cmdExport, verify: cmdVerify };
if (!command || !COMMANDS[command]) fail(command ? `Unknown command "${command}".\n${USAGE}` : USAGE);
try {
  await COMMANDS[command]();
} catch (err) {
  fail(`redirect-map ${command} failed: ${err.message || err}`);
}
