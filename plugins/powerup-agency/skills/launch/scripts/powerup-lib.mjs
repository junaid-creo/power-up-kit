// Power-Up Kit shared helpers.
//
// Source of truth: shared/powerup-lib.mjs in the repository.
// `node scripts/sync-shared.mjs` copies this file into every skill that needs it,
// so each skill folder works on its own (Claude Code plugin, Claude app ZIP, `npx skills add`).
// Do not edit the copies inside plugins/ — edit this file and run the sync script.
//
// Zero dependencies. Requires Node.js 18 or newer (global fetch).

import { gunzipSync } from 'node:zlib';

export const VERSION = '0.2.1';
export const USER_AGENT = `PowerUpKit/${VERSION} (+https://github.com/junaid-creo/power-up-kit)`;

// ---------------------------------------------------------------------------
// Command-line arguments
// ---------------------------------------------------------------------------

/**
 * Parse argv into { _: positional[], ...flags }.
 * `--key value`, `--key=value` and boolean `--flag` are supported.
 * Flags listed in `booleans` never consume the next token.
 */
export function parseArgs(argv, { booleans = [] } = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--') {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq !== -1) {
        out[token.slice(2, eq)] = token.slice(eq + 1);
        continue;
      }
      const key = token.slice(2);
      const next = argv[i + 1];
      if (booleans.includes(key) || next === undefined || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(token);
    }
  }
  return out;
}

export function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', copy: '©', reg: '®', trade: '™', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  laquo: '«', raquo: '»', middot: '·', bull: '•', euro: '€', pound: '£',
};

export function decodeEntities(s) {
  if (!s) return '';
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      try { return Number.isFinite(n) ? String.fromCodePoint(n) : m; } catch { return m; }
    }
    const v = NAMED_ENTITIES[code.toLowerCase()];
    return v === undefined ? m : v;
  });
}

export function stripTags(s) {
  return (s || '').replace(/<[^>]*>/g, ' ');
}

export function cleanText(s) {
  return decodeEntities(stripTags(s)).replace(/\s+/g, ' ').trim();
}

export function countWords(text) {
  if (!text) return 0;
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function truncate(s, n) {
  if (!s) return s;
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ---------------------------------------------------------------------------
// HTML parsing (tolerant, regex based — good enough for audits, not a browser)
// ---------------------------------------------------------------------------

const TAG_RE = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

export function parseAttrs(attrText) {
  const attrs = {};
  if (!attrText) return attrs;
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(attrText))) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    if (!(name in attrs)) attrs[name] = decodeEntities(value);
  }
  return attrs;
}

/** Iterate opening tags: yields { name, attrs, index }. */
export function* openingTags(html) {
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(html))) {
    yield { name: m[1].toLowerCase(), attrs: parseAttrs(m[2]), index: m.index };
  }
}

export function resolveUrl(href, base) {
  if (!href) return null;
  const h = href.trim();
  if (!h || /^(javascript|mailto|tel|sms|data|blob|about):/i.test(h) || h.startsWith('#')) return null;
  try {
    const u = new URL(h, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

export function siteKey(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isSameSite(a, b) {
  const ka = siteKey(a);
  return ka !== '' && ka === siteKey(b);
}

const TRACKING_PARAMS = /^(utm_[a-z]+|gclid|fbclid|msclkid|mc_cid|mc_eid|_ga|_gl|ref)$/i;

/** Normalise a URL for crawling: no hash, no tracking params, consistent trailing slash on root. */
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    if (u.pathname === '') u.pathname = '/';
    return u.href;
  } catch {
    return url;
  }
}

const NON_HTML_EXT = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|mp4|webm|mov|avi|mp3|wav|ogg|zip|rar|7z|gz|tar|dmg|exe|msi|apk|docx?|xlsx?|pptx?|csv|json|xml|txt|css|js|mjs|woff2?|ttf|otf|eot)(\?|$)/i;

export function looksLikePage(url) {
  try {
    return !NON_HTML_EXT.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function collectJsonLdTypes(node, types) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdTypes(item, types);
    return;
  }
  const t = node['@type'];
  if (typeof t === 'string') types.add(t);
  else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && types.add(x));
  if (node['@graph']) collectJsonLdTypes(node['@graph'], types);
}

/**
 * Analyse an HTML document. `pageUrl` is used to resolve relative links.
 * Returns plain data — no judgement. Checks live in the scripts that use this.
 */
export function analyzeHtml(html, pageUrl) {
  const src = (html || '').replace(/<!--[\s\S]*?-->/g, '');

  // <base href> changes how relative links resolve.
  let base = pageUrl;
  for (const tag of openingTags(src)) {
    if (tag.name === 'base' && tag.attrs.href) {
      base = resolveUrl(tag.attrs.href, pageUrl) || pageUrl;
      break;
    }
    if (tag.name === 'body') break;
  }

  // Scripts: collect JSON-LD and external script URLs, then drop script/style bodies.
  const jsonLd = [];
  const scripts = [];
  const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let sm;
  while ((sm = SCRIPT_RE.exec(src))) {
    const attrs = parseAttrs(sm[1]);
    if ((attrs.type || '').toLowerCase().includes('ld+json')) {
      const raw = sm[2].trim();
      try {
        const data = JSON.parse(raw);
        const types = new Set();
        collectJsonLdTypes(data, types);
        jsonLd.push({ valid: true, types: [...types], data });
      } catch (err) {
        jsonLd.push({ valid: false, types: [], error: String(err.message || err).slice(0, 160) });
      }
    } else if (attrs.src) {
      const u = resolveUrl(attrs.src, base);
      if (u) scripts.push(u);
    }
  }

  const body = src
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi, ' <svg> ');

  const result = {
    url: pageUrl,
    base,
    lang: null,
    charset: null,
    title: null,
    titleCount: 0,
    metaDescription: null,
    metaDescriptionCount: 0,
    metaRobots: null,
    canonical: null,
    viewport: null,
    themeColor: null,
    og: {},
    twitter: {},
    hreflang: [],
    favicon: null,
    appleTouchIcon: null,
    manifest: null,
    stylesheets: [],
    scripts,
    headings: [],
    h1: [],
    links: [],
    images: [],
    iframes: [],
    jsonLd,
    wordCount: 0,
    textSample: '',
    mixedContent: [],
  };

  const titles = [...src.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi)];
  result.titleCount = titles.length;
  if (titles.length) result.title = cleanText(titles[0][1]);

  for (const tag of openingTags(body)) {
    const a = tag.attrs;
    switch (tag.name) {
      case 'html':
        if (a.lang) result.lang = a.lang;
        break;
      case 'meta': {
        const name = (a.name || '').toLowerCase();
        const prop = (a.property || '').toLowerCase();
        if (a.charset) result.charset = a.charset;
        if (name === 'description') {
          result.metaDescriptionCount++;
          if (result.metaDescription === null) result.metaDescription = (a.content || '').trim();
        } else if (name === 'robots' || name === 'googlebot') {
          result.metaRobots = [result.metaRobots, (a.content || '').toLowerCase()].filter(Boolean).join(', ');
        } else if (name === 'viewport') {
          result.viewport = a.content || '';
        } else if (name === 'theme-color') {
          result.themeColor = a.content || null;
        } else if (name.startsWith('twitter:')) {
          result.twitter[name.slice(8)] = a.content || '';
        }
        if (prop.startsWith('og:')) result.og[prop.slice(3)] = a.content || '';
        break;
      }
      case 'link': {
        const rel = (a.rel || '').toLowerCase().split(/\s+/);
        const href = resolveUrl(a.href, base);
        if (rel.includes('canonical') && result.canonical === null) result.canonical = href || a.href || '';
        if (rel.includes('stylesheet') && href) result.stylesheets.push(href);
        if ((rel.includes('icon') || rel.includes('shortcut')) && !result.favicon) result.favicon = href || (a.href ? a.href.slice(0, 80) : null);
        if (rel.includes('apple-touch-icon') && !result.appleTouchIcon) result.appleTouchIcon = href;
        if (rel.includes('manifest')) result.manifest = href;
        if (rel.includes('alternate') && a.hreflang) result.hreflang.push({ lang: a.hreflang, href });
        break;
      }
      case 'img': {
        const srcUrl = resolveUrl(a.src || a['data-src'] || '', base);
        result.images.push({
          src: srcUrl || a.src || a['data-src'] || null,
          alt: 'alt' in a ? a.alt : null,
          hasAlt: 'alt' in a,
          width: a.width || null,
          height: a.height || null,
          loading: a.loading || null,
        });
        break;
      }
      case 'iframe':
        if (a.src) result.iframes.push(resolveUrl(a.src, base) || a.src);
        break;
      default:
        break;
    }
  }

  for (const m of body.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)) {
    const text = cleanText(m[2]);
    result.headings.push({ level: Number(m[1]), text });
    if (m[1] === '1') result.h1.push(text);
  }

  for (const m of body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const a = parseAttrs(m[1]);
    const href = resolveUrl(a.href, base);
    if (!href) continue;
    const rel = (a.rel || '').toLowerCase();
    const inner = m[2];
    const imgAlt = [...inner.matchAll(/<img\b([^>]*)>/gi)].map((x) => parseAttrs(x[1]).alt || '').join(' ');
    result.links.push({
      href,
      text: cleanText(inner) || cleanText(imgAlt) || (a['aria-label'] || '').trim(),
      rel,
      nofollow: rel.includes('nofollow'),
      internal: isSameSite(href, pageUrl),
    });
  }

  const bodyMatch = body.match(/<body\b[^>]*>([\s\S]*)$/i);
  const text = cleanText(bodyMatch ? bodyMatch[1] : body);
  result.wordCount = countWords(text);
  result.textSample = truncate(text, 600);

  if (pageUrl && pageUrl.startsWith('https:')) {
    const resources = [
      ...result.images.map((i) => i.src),
      ...result.scripts,
      ...result.stylesheets,
      ...result.iframes,
    ];
    result.mixedContent = [...new Set(resources.filter((u) => typeof u === 'string' && u.startsWith('http:')))];
  }

  return result;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

/**
 * GET (or HEAD) a URL, following redirects by hand so the chain is recorded.
 * Never throws: network problems come back as { status: 0, error }.
 */
export async function fetchWithRedirects(url, opts = {}) {
  const {
    method = 'GET',
    timeoutMs = 20000,
    maxRedirects = 10,
    maxBytes = 6_000_000,
    binary = false,
    headers = {},
    userAgent = USER_AGENT,
  } = opts;
  const started = Date.now();
  const chain = [];
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(current, {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': userAgent,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...headers,
        },
      });
    } catch (err) {
      clearTimeout(timer);
      const reason = err.name === 'AbortError' ? `timed out after ${timeoutMs} ms` : (err.cause?.code || err.message || String(err));
      return { requestedUrl: url, url: current, status: 0, ok: false, chain, error: reason, timeMs: Date.now() - started };
    }
    const location = res.headers.get('location');
    if (REDIRECT_CODES.has(res.status) && location) {
      clearTimeout(timer);
      chain.push({ url: current, status: res.status });
      try { await res.body?.cancel(); } catch { /* ignore */ }
      try {
        current = new URL(location, current).href;
      } catch {
        return { requestedUrl: url, url: current, status: res.status, ok: false, chain, error: `bad redirect location: ${location}`, timeMs: Date.now() - started };
      }
      continue;
    }
    const contentType = res.headers.get('content-type') || '';
    let body = null;
    let truncated = false;
    if (method !== 'HEAD') {
      try {
        const buf = Buffer.from(await res.arrayBuffer());
        const limited = buf.length > maxBytes ? buf.subarray(0, maxBytes) : buf;
        truncated = buf.length > maxBytes;
        body = binary ? limited : limited.toString('utf8');
      } catch (err) {
        clearTimeout(timer);
        return { requestedUrl: url, url: current, status: res.status, ok: false, chain, error: `could not read body: ${err.message}`, timeMs: Date.now() - started };
      }
    }
    clearTimeout(timer);
    return {
      requestedUrl: url,
      url: current,
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      chain,
      headers: Object.fromEntries(res.headers.entries()),
      contentType,
      isHtml: /text\/html|application\/xhtml/i.test(contentType),
      body,
      truncated,
      timeMs: Date.now() - started,
    };
  }
  return { requestedUrl: url, url: current, status: 0, ok: false, chain, error: `more than ${maxRedirects} redirects`, timeMs: Date.now() - started };
}

/** Check a link's status cheaply: HEAD first, GET when the server refuses HEAD. */
export async function checkLink(url, opts = {}) {
  let r = await fetchWithRedirects(url, { ...opts, method: 'HEAD', timeoutMs: opts.timeoutMs || 12000 });
  if (r.status === 0 || [400, 403, 405, 406, 429, 501].includes(r.status)) {
    r = await fetchWithRedirects(url, { ...opts, method: 'GET', timeoutMs: opts.timeoutMs || 15000, maxBytes: 200_000 });
  }
  return { url, finalUrl: r.url, status: r.status, redirects: r.chain.length, error: r.error || null };
}

const BOT_WALL_HOSTS = /(^|\.)(linkedin\.com|instagram\.com|facebook\.com|x\.com|twitter\.com|tiktok\.com|behance\.net|dribbble\.com|medium\.com|quora\.com|glassdoor\.com|indeed\.com|yelp\.com|amazon\.[a-z.]+)$/i;

/**
 * Classify a checkLink() result:
 *   'ok'      — works
 *   'blocked' — the site refuses automated checks (e.g. LinkedIn answers 999), so we can't tell; check by hand
 *   'broken'  — really doesn't work
 */
export function linkStatus(result, { external = false } = {}) {
  const s = result.status;
  if (s >= 200 && s < 400) return 'ok';
  if (s === 999) return 'blocked';
  let host = '';
  try { host = new URL(result.url).hostname; } catch { /* ignore */ }
  if (external && (s === 401 || s === 403 || s === 429 || (s === 0 && BOT_WALL_HOSTS.test(host)))) return 'blocked';
  if (external && BOT_WALL_HOSTS.test(host) && s >= 400 && s < 500 && s !== 404 && s !== 410) return 'blocked';
  return 'broken';
}

/** Run async `worker` over `items` with a concurrency limit and optional delay between starts. */
export async function mapLimit(items, limit, worker, { delayMs = 0 } = {}) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      if (delayMs) await sleep(delayMs);
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, run));
  return results;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// robots.txt and sitemaps
// ---------------------------------------------------------------------------

export function parseRobots(txt) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;
  for (const rawLine of (txt || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'allow' || field === 'disallow') {
      current.rules.push({ allow: field === 'allow', path: value });
    }
  }
  return { groups, sitemaps };
}

function robotsPatternMatches(pattern, path) {
  if (pattern === '') return false;
  let re = '';
  for (const ch of pattern) {
    if (ch === '*') re += '.*';
    else if (ch === '$') re += '$';
    else re += ch.replace(/[.+?^{}()|[\]\\/]/g, '\\$&');
  }
  return new RegExp(`^${re}`).test(path);
}

/** Google-style matching: most specific group, longest matching rule wins, allow wins ties. */
export function robotsAllows(robots, userAgent, pathWithQuery) {
  if (!robots || !robots.groups.length) return true;
  const ua = (userAgent || '').toLowerCase();
  let group = null;
  let bestLen = -1;
  for (const g of robots.groups) {
    for (const agent of g.agents) {
      if (agent !== '*' && ua.includes(agent) && agent.length > bestLen) {
        group = g;
        bestLen = agent.length;
      }
    }
  }
  if (!group) group = robots.groups.find((g) => g.agents.includes('*')) || null;
  if (!group) return true;
  let verdict = true;
  let matchLen = -1;
  for (const rule of group.rules) {
    if (rule.path === '' && !rule.allow) continue; // "Disallow:" with no path allows everything
    if (robotsPatternMatches(rule.path, pathWithQuery)) {
      const len = rule.path.length;
      if (len > matchLen || (len === matchLen && rule.allow)) {
        verdict = rule.allow;
        matchLen = len;
      }
    }
  }
  return verdict;
}

export function robotsBlocksEverything(robots) {
  return !robotsAllows(robots, '*', '/');
}

export function parseSitemap(xml) {
  const urls = [];
  const sitemaps = [];
  const text = xml || '';
  for (const m of text.matchAll(/<sitemap\b[^>]*>([\s\S]*?)<\/sitemap\s*>/gi)) {
    const loc = m[1].match(/<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/i);
    if (loc) sitemaps.push(decodeEntities(loc[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()));
  }
  for (const m of text.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url\s*>/gi)) {
    const loc = m[1].match(/<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/i);
    if (loc) urls.push(decodeEntities(loc[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()));
  }
  return { urls, sitemaps };
}

/** Fetch a sitemap (plain or .gz), following sitemap indexes up to `maxFiles`. */
export async function loadSitemapUrls(startSitemaps, { maxFiles = 10, maxUrls = 5000 } = {}) {
  const seen = new Set();
  const queue = [...startSitemaps];
  const urls = [];
  const files = [];
  while (queue.length && files.length < maxFiles && urls.length < maxUrls) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    const isGz = /\.gz(\?|$)/i.test(sm);
    const r = await fetchWithRedirects(sm, { binary: isGz, timeoutMs: 20000 });
    let xml = '';
    if (r.ok && r.body) {
      if (isGz) {
        try { xml = gunzipSync(r.body).toString('utf8'); } catch { xml = r.body.toString('utf8'); }
      } else {
        xml = r.body;
      }
    }
    const parsed = parseSitemap(xml);
    files.push({ url: sm, status: r.status, urls: parsed.urls.length, childSitemaps: parsed.sitemaps.length, error: r.error || null });
    for (const child of parsed.sitemaps) if (!seen.has(child)) queue.push(child);
    for (const u of parsed.urls) {
      if (urls.length >= maxUrls) break;
      urls.push(u);
    }
  }
  return { urls, files };
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

const NAMED_COLORS = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255],
  yellow: [255, 255, 0], orange: [255, 165, 0], purple: [128, 0, 128], gray: [128, 128, 128], grey: [128, 128, 128],
  silver: [192, 192, 192], navy: [0, 0, 128], teal: [0, 128, 128], maroon: [128, 0, 0], olive: [128, 128, 0],
  lime: [0, 255, 0], aqua: [0, 255, 255], cyan: [0, 255, 255], fuchsia: [255, 0, 255], magenta: [255, 0, 255],
  pink: [255, 192, 203], gold: [255, 215, 0], beige: [245, 245, 220], ivory: [255, 255, 240],
  whitesmoke: [245, 245, 245], gainsboro: [220, 220, 220], lightgray: [211, 211, 211], lightgrey: [211, 211, 211],
  darkgray: [169, 169, 169], darkgrey: [169, 169, 169], dimgray: [105, 105, 105], dimgrey: [105, 105, 105],
  crimson: [220, 20, 60], tomato: [255, 99, 71], coral: [255, 127, 80], salmon: [250, 128, 114],
  indigo: [75, 0, 130], violet: [238, 130, 238], skyblue: [135, 206, 235], royalblue: [65, 105, 225],
  dodgerblue: [30, 144, 255], steelblue: [70, 130, 180], slategray: [112, 128, 144], slategrey: [112, 128, 144],
  forestgreen: [34, 139, 34], seagreen: [46, 139, 87], tan: [210, 180, 140], chocolate: [210, 105, 30],
  brown: [165, 42, 42], khaki: [240, 230, 140], lavender: [230, 230, 250], mintcream: [245, 255, 250],
};

export const COLOR_TOKEN_RE = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:black|white|red|green|blue|yellow|orange|purple|gr[ae]y|silver|navy|teal|maroon|olive|lime|aqua|cyan|fuchsia|magenta|pink|gold|beige|ivory|whitesmoke|gainsboro|light gr[ae]y|lightgr[ae]y|darkgr[ae]y|dimgr[ae]y|crimson|tomato|coral|salmon|indigo|violet|skyblue|royalblue|dodgerblue|steelblue|slategr[ae]y|forestgreen|seagreen|tan|chocolate|brown|khaki|lavender|mintcream)\b/gi;

function clamp255(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseNumberList(inner) {
  // Supports "1, 2, 3", "1 2 3 / 50%", and percentages.
  const [main, alphaPart] = inner.split('/');
  const parts = main.split(/[\s,]+/).filter(Boolean);
  if (alphaPart !== undefined) parts.push(alphaPart.trim());
  return parts;
}

function parseAlpha(v) {
  if (v === undefined) return 1;
  const s = String(v).trim();
  const n = s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
}

function hslToRgb(h, s, l) {
  const hh = (((h % 360) + 360) % 360) / 360;
  const ss = s / 100;
  const ll = l / 100;
  if (ss === 0) return [ll * 255, ll * 255, ll * 255];
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const conv = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [conv(hh + 1 / 3) * 255, conv(hh) * 255, conv(hh - 1 / 3) * 255];
}

/** Parse a CSS colour into { r, g, b, a } or null. */
export function parseColor(input) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const named = NAMED_COLORS[s.replace(/\s+/g, '')];
  if (named) return { r: named[0], g: named[1], b: named[2], a: 1 };
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) {
      const [r, g, b, a] = h.split('').map((c) => parseInt(c + c, 16));
      return { r, g, b, a: h.length === 4 ? a / 255 : 1 };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }
  m = s.match(/^rgba?\((.*)\)$/);
  if (m) {
    const parts = parseNumberList(m[1]);
    if (parts.length < 3) return null;
    const ch = parts.slice(0, 3).map((p) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p)));
    if (ch.some((x) => !Number.isFinite(x))) return null;
    return { r: clamp255(ch[0]), g: clamp255(ch[1]), b: clamp255(ch[2]), a: parseAlpha(parts[3]) };
  }
  m = s.match(/^hsla?\((.*)\)$/);
  if (m) {
    const parts = parseNumberList(m[1]);
    if (parts.length < 3) return null;
    const h = parseFloat(parts[0]);
    const sat = parseFloat(parts[1]);
    const light = parseFloat(parts[2]);
    if (![h, sat, light].every(Number.isFinite)) return null;
    const [r, g, b] = hslToRgb(h, sat, light);
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: parseAlpha(parts[3]) };
  }
  return null;
}

export function toHex({ r, g, b }) {
  return `#${[r, g, b].map((x) => clamp255(x).toString(16).padStart(2, '0')).join('')}`;
}

function channelToLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }) {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

/** WCAG 2 contrast ratio between two opaque colours (1 to 21). */
export function contrastRatio(c1, c2) {
  const l1 = relativeLuminance(c1);
  const l2 = relativeLuminance(c2);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

export function wcagRating(ratio) {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA large text only';
  return 'fail';
}

function rgbToLab({ r, g, b }) {
  let x = channelToLinear(r) * 0.4124 + channelToLinear(g) * 0.3576 + channelToLinear(b) * 0.1805;
  let y = channelToLinear(r) * 0.2126 + channelToLinear(g) * 0.7152 + channelToLinear(b) * 0.0722;
  let z = channelToLinear(r) * 0.0193 + channelToLinear(g) * 0.1192 + channelToLinear(b) * 0.9505;
  x /= 0.95047;
  z /= 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** CIE76 colour difference. Below ~6 looks like "the same colour" to most people. */
export function deltaE(c1, c2) {
  const a = rgbToLab(c1);
  const b = rgbToLab(c2);
  return Math.sqrt((a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}

/** Chroma in Lab space: low values are greys/neutrals. */
export function chroma(c) {
  const lab = rgbToLab(c);
  return Math.sqrt(lab.a ** 2 + lab.b ** 2);
}

// ---------------------------------------------------------------------------
// Google PageSpeed Insights (Lighthouse in the cloud)
// ---------------------------------------------------------------------------

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

function ms(v) {
  return typeof v === 'number' ? Math.round(v) : null;
}

/**
 * Run PageSpeed Insights for a public URL. Works without a key at low volume;
 * set PAGESPEED_API_KEY for reliable use. Returns a compact summary, never throws.
 */
export async function pageSpeed(url, { strategy = 'mobile', apiKey = process.env.PAGESPEED_API_KEY, timeoutMs = 120000, endpoint = process.env.POWERUP_PSI_ENDPOINT || PSI_ENDPOINT } = {}) {
  const qs = new URLSearchParams({ url, strategy });
  for (const c of ['PERFORMANCE', 'ACCESSIBILITY', 'BEST_PRACTICES', 'SEO']) qs.append('category', c);
  if (apiKey) qs.set('key', apiKey);
  const r = await fetchWithRedirects(`${endpoint}?${qs}`, {
    timeoutMs,
    headers: { accept: 'application/json' },
  });
  if (!r.ok) {
    let message = r.error || `HTTP ${r.status}`;
    try {
      const err = JSON.parse(r.body || '{}').error;
      if (err?.message) message = err.message;
    } catch { /* ignore */ }
    const hint = r.status === 429 ? ' (quota reached: set PAGESPEED_API_KEY — see docs/connectors.md)' : '';
    return { url, strategy, ok: false, error: `${message}${hint}` };
  }
  let data;
  try {
    data = JSON.parse(r.body);
  } catch {
    return { url, strategy, ok: false, error: 'PageSpeed returned invalid JSON' };
  }
  const lh = data.lighthouseResult || {};
  const cats = lh.categories || {};
  const audits = lh.audits || {};
  const score = (k) => (cats[k]?.score == null ? null : Math.round(cats[k].score * 100));
  const field = data.loadingExperience?.metrics || {};
  const fieldMetric = (k) => field[k] ? { p75: field[k].percentile, rating: field[k].category } : null;
  const opportunities = Object.values(audits)
    .filter((a) => a.details?.type === 'opportunity' && typeof a.score === 'number' && a.score < 0.9)
    .map((a) => ({ id: a.id, title: a.title, savingsMs: ms(a.details.overallSavingsMs), display: a.displayValue || '' }))
    .sort((a, b) => (b.savingsMs || 0) - (a.savingsMs || 0))
    .slice(0, 8);
  return {
    url,
    finalUrl: lh.finalDisplayedUrl || lh.finalUrl || url,
    strategy,
    ok: true,
    fetchedAt: lh.fetchTime || new Date().toISOString(),
    scores: {
      performance: score('performance'),
      accessibility: score('accessibility'),
      bestPractices: score('best-practices'),
      seo: score('seo'),
    },
    lab: {
      fcpMs: ms(audits['first-contentful-paint']?.numericValue),
      lcpMs: ms(audits['largest-contentful-paint']?.numericValue),
      tbtMs: ms(audits['total-blocking-time']?.numericValue),
      cls: audits['cumulative-layout-shift']?.numericValue ?? null,
      speedIndexMs: ms(audits['speed-index']?.numericValue),
    },
    field: {
      source: data.loadingExperience?.id ? 'Chrome UX Report (real visitors, 28 days)' : null,
      overall: data.loadingExperience?.overall_category || null,
      lcpMs: fieldMetric('LARGEST_CONTENTFUL_PAINT_MS'),
      inpMs: fieldMetric('INTERACTION_TO_NEXT_PAINT'),
      cls: field.CUMULATIVE_LAYOUT_SHIFT_SCORE
        ? { p75: field.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100, rating: field.CUMULATIVE_LAYOUT_SHIFT_SCORE.category }
        : null,
      ttfbMs: fieldMetric('EXPERIMENTAL_TIME_TO_FIRST_BYTE'),
    },
    opportunities,
  };
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

export function printJson(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

export function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

export function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function slugify(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item';
}
