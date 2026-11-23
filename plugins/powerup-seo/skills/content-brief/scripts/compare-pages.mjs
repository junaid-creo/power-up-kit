#!/usr/bin/env node
// Power-Up Kit — content-brief: compare the pages that rank for a keyword
//
// Reads the top-ranking pages for a keyword (URLs or saved files) and measures what
// they have in common: length, H2/H3 outline, shared subtopics, questions, schema
// types, dates and where the keyword appears. With --site it also reads the client's
// sitemap to suggest internal links and to spot a client page that already targets
// the keyword (cannibalization). It measures structure, not quality.
//
// Usage:
//   node compare-pages.mjs <url-or-file>... [--keyword "wedding cakes dubai"]
//        [--site https://client.com] [--max-links 10] [--out file.json]
//        [--concurrency 3] [--delay 250]
//
// Pass pages in ranking order (position 1 first). Files can be saved HTML pages
// (.html) or page text (.md / .txt) with optional "URL:", "Title:", "Description:",
// "Published:" and "Modified:" lines at the top.
//
// Respects robots.txt (disallowed pages are skipped and reported), fetches slowly
// with a PowerUpKit user agent. Prints a short JSON summary; the full data goes to
// --out or .powerup/briefs/research-<keyword>-<date>.json.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  USER_AGENT, VERSION, analyzeHtml, cleanText, fail, fetchWithRedirects, isSameSite, isoDate,
  loadSitemapUrls, looksLikePage, mapLimit, normalizeUrl, openingTags, parseArgs, parseRobots,
  robotsAllows, slugify, toInt, truncate,
} from './powerup-lib.mjs';

const USAGE = 'Usage: node compare-pages.mjs <url-or-file>... [--keyword "wedding cakes dubai"] [--site https://client.com] [--max-links 10] [--out file.json]';
const MAX_INPUTS = 12;
const TEXT_EXT = new Set(['.md', '.markdown', '.txt']);
const HTML_EXT = new Set(['.html', '.htm', '.xhtml']);
const MIN_WORDS_FOR_LENGTH = 100; // pages below this are probably blocked or built with JavaScript
const PLACEHOLDER_BASE = 'https://saved-page.invalid/';

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------
const args = parseArgs(process.argv.slice(2));
const inputs = [...new Set(args._.map((s) => String(s).trim()).filter(Boolean))];
if (!inputs.length) fail(USAGE);
if (inputs.length > MAX_INPUTS) fail(`Too many pages (${inputs.length}). Compare the top 3–8 ranking pages (at most ${MAX_INPUTS}).`);
for (const flag of ['keyword', 'site', 'out', 'max-links']) {
  if (args[flag] === true) fail(`--${flag} needs a value.\n${USAGE}`);
}

const keyword = typeof args.keyword === 'string' ? args.keyword.trim().replace(/\s+/g, ' ') : null;
if (args.keyword !== undefined && !keyword) fail('--keyword is empty.');

const STOPWORDS = new Set(`a about across after all also am an and any are around as at back be been before best between both but by can
  could did do does each for from get got had has have here how i if in into is it its just me more most my near need new no
  not of on only or other our ours out over own same should since so some such than that the their them then there these
  they this those to too top under until up us very via vs versus was way we well were what whats when where which who why
  will with within without would you your yours every per through`.split(/\s+/).filter(Boolean));

const kwStems = keyword ? keywordStems(keyword) : [];
if (keyword && !kwStems.length) fail(`The keyword "${keyword}" has no words to match.`);

let siteUrl = null;
if (args.site !== undefined) {
  if (!/^https?:\/\//i.test(String(args.site))) fail('--site must be the client website address, starting with https://');
  if (!keyword) fail('--site needs --keyword (it looks for client pages about that keyword).');
  siteUrl = normalizeUrl(String(args.site));
}
const MAX_LINKS = Math.min(toInt(args['max-links'], 10), 50);
const CONCURRENCY = Math.min(toInt(args.concurrency, 3), 5);
const DELAY = args.delay === undefined ? 250 : Math.max(0, Number(args.delay) || 0);

const sources = inputs.map((input) => {
  if (/^https?:\/\//i.test(input)) {
    try {
      return { input, kind: 'url', url: new URL(input).href };
    } catch {
      return fail(`Not a valid URL: ${input}`);
    }
  }
  if (existsSync(input) && statSync(input).isFile()) return { input, kind: 'file', path: resolve(input) };
  return fail(`Not a URL or an existing file: ${input}\nPass competitor URLs (https://…) or saved page files (.html, .md, .txt).`);
});

// ---------------------------------------------------------------------------
// Words, light stemming and keyword matching
// ---------------------------------------------------------------------------
function words(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Light plural stemming: cakes → cake, bakeries → bakery, boxes → box. */
function stem(w) {
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

function isContentWord(w) {
  return w.length > 1 && !STOPWORDS.has(w) && !/^\d+$/.test(w);
}

function keywordStems(kw) {
  const all = words(kw);
  const content = all.filter(isContentWord);
  return [...new Set((content.length ? content : all).map(stem))];
}

/** True when every keyword word appears in the text (ignoring case and simple plurals). */
function hasKeyword(text) {
  if (!kwStems.length) return null;
  const set = new Set(words(text).map(stem));
  return kwStems.every((s) => set.has(s));
}

function urlText(url) {
  try {
    const u = new URL(url);
    let path = u.pathname;
    try { path = decodeURIComponent(path); } catch { /* keep encoded */ }
    return `${u.hostname} ${path}`;
  } catch {
    return '';
  }
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const num = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ---------------------------------------------------------------------------
// Page parsing
// ---------------------------------------------------------------------------

/** The main content of a page: <main>, else <article>, else <body> — without nav, header, footer, aside, forms. */
function contentRegion(html) {
  const src = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|template|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  let area = 'body';
  let inner = null;
  const main = src.match(/<main\b[^>]*>([\s\S]*)<\/main\s*>/i);
  if (main) {
    area = 'main';
    inner = main[1];
  } else {
    const article = src.match(/<article\b[^>]*>([\s\S]*)<\/article\s*>/i);
    if (article) {
      area = 'article';
      inner = article[1];
    }
  }
  if (inner === null) {
    const body = src.match(/<body\b[^>]*>([\s\S]*?)(?:<\/body\s*>|$)/i);
    inner = body ? body[1] : src;
  }
  inner = inner.replace(/<(nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  return { area, html: inner };
}

function normDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const t = Date.parse(v);
  return Number.isFinite(t) ? isoDate(new Date(t)) : null;
}

function metaDates(html) {
  const out = { published: null, modified: null };
  for (const tag of openingTags(String(html || '').replace(/<!--[\s\S]*?-->/g, ''))) {
    if (tag.name !== 'meta') continue;
    const key = (tag.attrs.property || tag.attrs.name || '').toLowerCase();
    if (key === 'article:published_time' && !out.published) out.published = tag.attrs.content || null;
    if (key === 'article:modified_time' && !out.modified) out.modified = tag.attrs.content || null;
  }
  return out;
}

const NO_DATE_TYPES = new Set(['Review', 'Comment', 'Answer', 'Question', 'Rating', 'AggregateRating']);

/** Walk JSON-LD (breadth first, so page-level dates win over nested ones): dates and FAQPage questions. */
function jsonLdInfo(blocks) {
  let published = null;
  let modified = null;
  const faq = [];
  const queue = blocks.filter((b) => b.valid).map((b) => b.data);
  let guard = 0;
  while (queue.length && guard++ < 5000) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    const types = [].concat(node['@type'] || []).map(String);
    if (types.includes('FAQPage')) {
      for (const q of [].concat(node.mainEntity || [])) {
        if (q && typeof q === 'object' && typeof q.name === 'string' && q.name.trim()) faq.push(cleanText(q.name));
      }
    }
    if (!types.some((t) => NO_DATE_TYPES.has(t))) {
      if (!published && typeof node.datePublished === 'string') published = node.datePublished;
      if (!modified && typeof node.dateModified === 'string') modified = node.dateModified;
    }
    for (const v of Object.values(node)) if (v && typeof v === 'object') queue.push(v);
  }
  return { published, modified, faq };
}

const isQuestion = (t) => /[?؟]\s*$/.test(t || '');
const questionKey = (t) => words(t).join(' ');

function analysePage(html, webUrl, { textFile = false } = {}) {
  const base = webUrl || PLACEHOLDER_BASE;
  const full = analyzeHtml(html, base);
  const region = contentRegion(html);
  const content = analyzeHtml(`<body>${region.html}</body>`, base);
  const text = cleanText(region.html);
  const first100 = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).slice(0, 100).join(' ');

  const outline = content.headings.filter((h) => (h.level === 2 || h.level === 3) && h.text);
  const ld = jsonLdInfo(full.jsonLd);
  const md = metaDates(html);
  const pubMeta = normDate(md.published);
  const modMeta = normDate(md.modified);
  const published = pubMeta || normDate(ld.published);
  const modified = modMeta || normDate(ld.modified);
  const dateSource = new Set();
  if (published) dateSource.add(pubMeta ? 'meta article:published_time' : 'JSON-LD datePublished');
  if (modified) dateSource.add(modMeta ? 'meta article:modified_time' : 'JSON-LD dateModified');

  // Questions: headings ending in "?" plus FAQPage schema questions (one entry per question per page).
  const questions = [];
  const seenQ = new Map();
  const addQ = (q, from) => {
    const key = questionKey(q);
    if (!key) return;
    if (seenQ.has(key)) {
      const item = seenQ.get(key);
      if (!item.from.includes(from)) item.from.push(from);
      return;
    }
    const item = { text: q, from: [from] };
    seenQ.set(key, item);
    questions.push(item);
  };
  for (const h of [...full.h1.map((t) => ({ text: t })), ...content.headings]) if (isQuestion(h.text)) addQ(h.text, 'heading');
  for (const q of ld.faq) addQ(q, 'faq-schema');

  const h1 = full.h1.filter(Boolean);
  const title = full.title || null;
  return {
    title,
    titleLength: title ? title.length : 0,
    metaDescription: full.metaDescription || null,
    metaDescriptionLength: full.metaDescription ? full.metaDescription.length : 0,
    h1,
    outline: outline.slice(0, 80).map((h) => ({ level: h.level, text: truncate(h.text, 160) })),
    h2Count: content.headings.filter((h) => h.level === 2).length,
    h3Count: content.headings.filter((h) => h.level === 3).length,
    wordCount: content.wordCount,
    contentArea: region.area,
    images: content.images.length,
    internalLinks: content.links.filter((l) => l.internal).length,
    externalLinks: content.links.filter((l) => !l.internal).length,
    schemaTypes: textFile ? null : [...new Set(full.jsonLd.flatMap((j) => j.types))].sort(cmp),
    invalidJsonLd: full.jsonLd.filter((j) => !j.valid).length,
    questions,
    published,
    modified,
    dateSource: dateSource.size ? [...dateSource].join(', ') : null,
    first100,
  };
}

// --- Page text (Markdown / plain text) → minimal HTML -----------------------
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inlineMd(s) {
  return esc(s.replace(/(\*\*|__)(.+?)\1/g, '$2'))
    .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '<a href="$2">$1</a>');
}

function textToHtml(raw) {
  let text = String(raw).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const meta = {};
  const KEY = /^\s*(url|source|title|description|meta description|published|modified)\s*:\s*(.+?)\s*$/i;
  const setMeta = (m) => {
    const k = m[1].toLowerCase();
    const key = k === 'source' ? 'url' : k === 'meta description' ? 'description' : k;
    if (!meta[key]) meta[key] = m[2].replace(/^["']|["']$/g, '');
  };
  const front = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (front) {
    for (const line of front[1].split('\n')) {
      const m = line.match(KEY);
      if (m) setMeta(m);
    }
    text = text.slice(front[0].length);
  }
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length && (!lines[i].trim() || KEY.test(lines[i]))) {
    const m = lines[i].match(KEY);
    if (m) setMeta(m);
    i++;
  }
  const body = [];
  for (const line of lines.slice(i)) {
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) body.push(`<h${h[1].length}>${inlineMd(h[2])}</h${h[1].length}>`);
    else if (line.trim()) body.push(`<p>${inlineMd(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''))}</p>`);
  }
  const head = [
    meta.title ? `<title>${esc(meta.title)}</title>` : '',
    meta.description ? `<meta name="description" content="${esc(meta.description)}">` : '',
    meta.url ? `<link rel="canonical" href="${esc(meta.url)}">` : '',
    meta.published ? `<meta property="article:published_time" content="${esc(meta.published)}">` : '',
    meta.modified ? `<meta property="article:modified_time" content="${esc(meta.modified)}">` : '',
  ].join('');
  return {
    html: `<!doctype html><html><head>${head}</head><body><main>\n${body.join('\n')}\n</main></body></html>`,
    url: /^https?:\/\//i.test(meta.url || '') ? meta.url : null,
    hasTitle: !!meta.title,
    hasDescription: !!meta.description,
  };
}

// ---------------------------------------------------------------------------
// Loading pages (polite: robots.txt, small concurrency, delay)
// ---------------------------------------------------------------------------
const robotsCache = new Map();
function robotsFor(origin) {
  if (!robotsCache.has(origin)) {
    robotsCache.set(origin, (async () => {
      const r = await fetchWithRedirects(`${origin}/robots.txt`, { timeoutMs: 15000 });
      if (r.ok && r.body && !/<html/i.test(r.body)) return { found: true, robots: parseRobots(r.body) };
      return { found: false, robots: null, status: r.status, error: r.error || null };
    })());
  }
  return robotsCache.get(origin);
}

async function robotsOk(url) {
  const u = new URL(url);
  const rb = await robotsFor(u.origin);
  return !rb.found || robotsAllows(rb.robots, USER_AGENT, u.pathname + u.search);
}

async function loadSource(src) {
  if (src.kind === 'url') {
    if (!(await robotsOk(src.url))) return { skip: 'robots.txt disallows this page for crawlers — not fetched' };
    const r = await fetchWithRedirects(src.url);
    if (r.status === 0) return { skip: `network error: ${r.error}`, network: true };
    if (!r.ok) {
      const blocked = [401, 403, 429, 999].includes(r.status);
      return { skip: `HTTP ${r.status}${blocked ? ' — the site refuses automated requests; save the page from a browser and pass the file' : ''}` };
    }
    if (!r.isHtml || !r.body) return { skip: `not an HTML page (${r.contentType || 'unknown type'})` };
    return { kind: 'url', html: r.body, webUrl: r.url, status: r.status, redirected: r.chain.length > 0 };
  }
  const raw = readFileSync(src.path, 'utf8');
  const ext = extname(src.path).toLowerCase();
  const looksHtml = HTML_EXT.has(ext) || (!TEXT_EXT.has(ext) && /<(html|head|body|title|h1|h2|p|div)\b/i.test(raw));
  if (looksHtml) {
    const probe = analyzeHtml(raw, pathToFileURL(src.path).href);
    const savedFrom = raw.match(/<!--\s*saved from url=\(\d+\)(https?:\/\/[^\s>]+)\s*-->/i);
    const webUrl = [probe.canonical, probe.og.url, savedFrom && savedFrom[1]].find((u) => u && /^https?:\/\//i.test(u)) || null;
    return { kind: 'html-file', html: raw, webUrl, status: null };
  }
  const t = textToHtml(raw);
  return { kind: 'text-file', html: t.html, webUrl: t.url, status: null, hasTitle: t.hasTitle, hasDescription: t.hasDescription };
}

function buildRecord(src, loaded, position) {
  const textFile = loaded.kind === 'text-file';
  const p = analysePage(loaded.html, loaded.webUrl, { textFile });
  const record = {
    position,
    input: src.input,
    source: loaded.kind,
    url: loaded.webUrl,
    status: loaded.status,
    ...p,
  };
  if (textFile) {
    record.note = 'Page text from a file: schema and meta tags unknown; word count approximate.';
    if (!loaded.hasTitle) record.title = null;
    if (!loaded.hasDescription) record.metaDescription = null;
  }
  record.keyword = keyword
    ? {
      inTitle: textFile && !loaded.hasTitle ? null : hasKeyword(record.title || ''),
      inH1: record.h1.some((h) => hasKeyword(h)),
      inUrl: record.url ? hasKeyword(urlText(record.url)) : null,
      inFirst100Words: hasKeyword(p.first100),
    }
    : null;
  if (siteUrl) record.isClientPage = !!(record.url && isSameSite(record.url, siteUrl));
  delete record.first100;
  return record;
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    return truncate(`${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`, 80);
  } catch {
    return url;
  }
}

function oneLine(p) {
  const where = p.url ? shortUrl(p.url) : p.input;
  const bits = [`${num(p.wordCount)} words${p.source === 'text-file' ? ' (approx.)' : ''}`, `${p.h2Count} H2 / ${p.h3Count} H3`];
  if (p.questions.length) bits.push(`${p.questions.length} question${p.questions.length === 1 ? '' : 's'}`);
  if (p.schemaTypes) bits.push(p.schemaTypes.length ? `schema: ${p.schemaTypes.join(', ')}` : 'no schema');
  if (p.modified) bits.push(`updated ${p.modified}`);
  else if (p.published) bits.push(`published ${p.published}`);
  if (p.keyword) {
    const k = [['inTitle', 'title'], ['inH1', 'H1'], ['inUrl', 'URL'], ['inFirst100Words', 'first 100 words']]
      .filter(([key]) => p.keyword[key]).map(([, label]) => label);
    bits.push(k.length ? `keyword in ${k.join(', ')}` : 'keyword not in title, H1, URL or intro');
  }
  const title = p.title ? `"${truncate(p.title, 70)}"` : p.source === 'text-file' ? '(title unknown)' : '(no title)';
  return `#${p.position} ${where} — ${title} — ${bits.join(' · ')}`;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------
function median(values) {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function stats(values) {
  if (!values.length) return null;
  return { min: Math.min(...values), median: median(values), max: Math.max(...values) };
}

const round50 = (n) => Math.max(50, Math.round(n / 50) * 50);

function wordCountAggregate(pages) {
  const counted = pages.filter((p) => p.wordCount >= MIN_WORDS_FOR_LENGTH);
  const excluded = pages.filter((p) => p.wordCount < MIN_WORDS_FOR_LENGTH).map((p) => ({ position: p.position, input: p.input, words: p.wordCount }));
  const s = stats(counted.map((p) => p.wordCount));
  if (!s) {
    return { pages: 0, excluded, note: `No page had ${MIN_WORDS_FOR_LENGTH}+ words of main content — the pages may be built with JavaScript or blocked. Judge length by reading them.` };
  }
  const low = round50(s.median * 0.9);
  const high = Math.max(low + 50, round50(Math.min(s.max, s.median * 1.25)));
  return {
    pages: counted.length,
    ...s,
    recommended: { min: low, max: high },
    basis: `Main-content words of ${counted.length} ranking page(s): median ${num(s.median)} (range ${num(s.min)}–${num(s.max)}). Range = about the median (−10% / +25%), capped near the longest page. Cover the topic fully; never pad to reach a number.`,
    ...(excluded.length ? { excluded, excludedNote: `Pages under ${MIN_WORDS_FOR_LENGTH} words left out (probably JavaScript-built or blocked).` } : {}),
  };
}

function pickSurface(counts) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || cmp(a[0], b[0]))[0][0];
}

function subtopicAggregate(pages) {
  const M = pages.length;
  const terms = new Map(); // key -> { pages:Set, surfaces:Map, headings:[] , size }
  const note = (key, size, pageIdx, surface, heading) => {
    if (!terms.has(key)) terms.set(key, { key, size, pages: new Set(), surfaces: new Map(), headings: [] });
    const t = terms.get(key);
    t.surfaces.set(surface, (t.surfaces.get(surface) || 0) + 1);
    if (!t.pages.has(pageIdx)) {
      t.pages.add(pageIdx);
      if (t.headings.length < 3) t.headings.push(truncate(heading, 90));
    }
  };
  const kw = new Set(kwStems);
  pages.forEach((p, idx) => {
    for (const h of p.outline.filter((x) => !isQuestion(x.text))) { // questions are listed separately
      const toks = words(h.text);
      const keep = toks.map((w) => (isContentWord(w) && !kw.has(stem(w)) ? w : null));
      keep.forEach((w, i) => {
        if (!w) return;
        note(stem(w), 1, idx, w, h.text);
        const next = keep[i + 1];
        if (next) note(`${stem(w)} ${stem(next)}`, 2, idx, `${w} ${next}`, h.text);
      });
    }
  });
  let shared = [...terms.values()].filter((t) => t.pages.size >= 2);
  const phrases = shared.filter((t) => t.size === 2);
  shared = shared.filter((t) => t.size === 2 || !phrases.some((ph) => ph.pages.size === t.pages.size && ph.key.split(' ').includes(t.key)));
  shared.sort((a, b) => b.pages.size - a.pages.size || b.size - a.size || cmp(a.key, b.key));
  return shared.map((t) => ({ term: pickSurface(t.surfaces), pages: t.pages.size, coveredBy: `${t.pages.size} of ${M}`, headings: t.headings }));
}

function questionAggregate(pages) {
  const M = pages.length;
  const all = new Map();
  for (const p of pages) {
    for (const q of p.questions) {
      const key = questionKey(q.text);
      if (!all.has(key)) all.set(key, { question: q.text, pages: new Set(), from: new Set() });
      const item = all.get(key);
      if (!isQuestion(item.question) && isQuestion(q.text)) item.question = q.text;
      item.pages.add(p.position);
      q.from.forEach((f) => item.from.add(f));
    }
  }
  return [...all.values()]
    .sort((a, b) => b.pages.size - a.pages.size || cmp(a.question.toLowerCase(), b.question.toLowerCase()))
    .map((q) => ({ question: q.question, pages: q.pages.size, coveredBy: `${q.pages.size} of ${M}`, from: [...q.from].sort(cmp) }));
}

function schemaAggregate(pages) {
  const known = pages.filter((p) => Array.isArray(p.schemaTypes));
  const byType = new Map();
  for (const p of known) for (const t of p.schemaTypes) byType.set(t, (byType.get(t) || 0) + 1);
  const all = [...byType.entries()].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0])).map(([type, n]) => ({ type, pages: n, coveredBy: `${n} of ${known.length}` }));
  return {
    pagesChecked: known.length,
    pagesWithSchema: known.filter((p) => p.schemaTypes.length).length,
    shared: all.filter((t) => t.pages >= 2),
    all,
  };
}

function keywordAggregate(pages) {
  if (!keyword) return null;
  const count = (key) => {
    const known = pages.filter((p) => p.keyword[key] !== null);
    return { count: known.filter((p) => p.keyword[key]).length, of: known.length };
  };
  return {
    keyword,
    matching: 'all keyword words, ignoring case, small words and simple plurals',
    inTitle: count('inTitle'),
    inH1: count('inH1'),
    inUrl: count('inUrl'),
    inFirst100Words: count('inFirst100Words'),
  };
}

function dateAggregate(pages) {
  const pick = (key, newest) => {
    const withDate = pages.filter((p) => p[key]).sort((a, b) => cmp(a[key], b[key]) || a.position - b.position);
    if (!withDate.length) return null;
    const p = newest ? withDate[withDate.length - 1] : withDate[0];
    return { date: p[key], position: p.position, page: p.url || p.input };
  };
  return {
    pagesWithDates: pages.filter((p) => p.published || p.modified).length,
    of: pages.length,
    newestPublished: pick('published', true),
    oldestPublished: pick('published', false),
    newestModified: pick('modified', true),
    oldestModified: pick('modified', false),
  };
}

// ---------------------------------------------------------------------------
// Client site: internal link candidates and cannibalization
// ---------------------------------------------------------------------------
async function siteResearch() {
  const origin = new URL(siteUrl).origin;
  const rb = await robotsFor(origin);
  const sitemapStart = rb.found && rb.robots.sitemaps.length ? rb.robots.sitemaps : [`${origin}/sitemap.xml`];
  const sm = await loadSitemapUrls(sitemapStart, { maxFiles: 10, maxUrls: 5000 });
  let urls = [...new Set(sm.urls.map(normalizeUrl).filter((u) => isSameSite(u, siteUrl) && looksLikePage(u)))];
  let urlSource = 'sitemap';
  if (!urls.length) {
    const home = await fetchWithRedirects(siteUrl);
    if (home.ok && home.isHtml && home.body) {
      const a = analyzeHtml(home.body, home.url);
      urls = [...new Set([normalizeUrl(home.url), ...a.links.filter((l) => l.internal).map((l) => normalizeUrl(l.href)).filter(looksLikePage)])];
      urlSource = 'homepage links (no sitemap found)';
    } else {
      urlSource = 'none (no sitemap and the homepage did not load)';
    }
  }

  const scored = urls.map((url) => {
    const u = new URL(url);
    const pathStems = new Set(words(urlText(url).replace(u.hostname, '')).map(stem));
    return { url, slugScore: kwStems.filter((s) => pathStems.has(s)).length, depth: u.pathname.split('/').filter(Boolean).length };
  });
  const allowed = [];
  let blockedByRobots = 0;
  for (const s of scored) {
    const u = new URL(s.url);
    if (rb.found && !robotsAllows(rb.robots, USER_AGENT, u.pathname + u.search)) blockedByRobots++;
    else allowed.push(s);
  }
  allowed.sort((a, b) => b.slugScore - a.slugScore || a.depth - b.depth || cmp(a.url, b.url));
  const toFetch = allowed.slice(0, MAX_LINKS);

  const fetched = await mapLimit(toFetch, CONCURRENCY, async (c) => {
    const r = await fetchWithRedirects(c.url);
    if (!r.ok || !r.isHtml || !r.body) return { ...c, error: r.error || `HTTP ${r.status}` };
    const a = analyzeHtml(r.body, r.url);
    const titleStems = new Set(words([a.title, ...a.h1].join(' ')).map(stem));
    const titleScore = kwStems.filter((s) => titleStems.has(s)).length;
    const matchedIn = [hasKeyword(a.title || '') && 'title', a.h1.some((h) => hasKeyword(h)) && 'H1'].filter(Boolean);
    return {
      url: c.url,
      title: a.title || null,
      h1: a.h1[0] || null,
      score: c.slugScore + titleScore,
      matchedIn,
      noindex: /noindex/.test(a.metaRobots || ''),
    };
  }, { delayMs: DELAY });

  const ok = fetched.filter((f) => !f.error);
  return {
    site: siteUrl,
    urlSource,
    sitemapFiles: sm.files.map((f) => ({ url: f.url, status: f.status, urls: f.urls })),
    pagesFound: urls.length,
    blockedByRobots,
    pagesRead: ok.length,
    failed: fetched.filter((f) => f.error).map((f) => ({ url: f.url, error: f.error })),
    scoring: 'Score = keyword words found in the URL path + keyword words found in the title or H1. Pages were picked for reading by URL score, then by how close they are to the homepage.',
    internalLinkCandidates: ok
      .filter((f) => f.score > 0 && !f.noindex)
      .sort((a, b) => b.score - a.score || cmp(a.url, b.url))
      .map((f) => ({ url: f.url, title: f.title, score: f.score })),
    possibleCannibalization: ok
      .filter((f) => f.matchedIn.length)
      .sort((a, b) => cmp(a.url, b.url))
      .map((f) => ({ url: f.url, title: f.title, h1: f.h1, matchedIn: f.matchedIn })),
  };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const loaded = await mapLimit(sources, CONCURRENCY, async (src) => {
  try {
    return await loadSource(src);
  } catch (err) {
    return { skip: `could not read: ${err.message || err}` };
  }
}, { delayMs: sources.some((s) => s.kind === 'url') ? DELAY : 0 });

const pages = [];
const skipped = [];
sources.forEach((src, i) => {
  const l = loaded[i];
  if (l.skip) skipped.push({ position: i + 1, input: src.input, reason: l.skip, ...(l.network ? { network: true } : {}) });
  else pages.push(buildRecord(src, l, i + 1));
});

if (!pages.length) {
  const lines = skipped.map((s) => `  #${s.position} ${s.input}: ${s.reason}`).join('\n');
  const hint = skipped.some((s) => s.network)
    ? '\nNo internet from here? (Common in the Claude app.) Fetch the pages with your web tool, save each one as .html or .md, and run this script on the files.'
    : '';
  fail(`No page could be analysed:\n${lines}${hint}`);
}

const site = siteUrl ? await siteResearch() : null;

const aggregates = {
  pagesAnalysed: pages.length,
  wordCount: wordCountAggregate(pages),
  h2PerPage: stats(pages.map((p) => p.h2Count)),
  subtopics: pages.length >= 2 ? subtopicAggregate(pages) : [],
  questions: questionAggregate(pages),
  schema: schemaAggregate(pages),
  keywordPlacement: keywordAggregate(pages),
  dates: dateAggregate(pages),
};

const outPath = typeof args.out === 'string' ? args.out : join('.powerup', 'briefs', `research-${slugify(keyword || 'pages')}-${isoDate()}.json`);
const report = {
  meta: {
    tool: 'power-up-kit/compare-pages',
    version: VERSION,
    createdAt: new Date().toISOString(),
    keyword,
    keywordWords: kwStems,
    inputs,
    userAgent: USER_AGENT,
    contentArea: 'Counts use the main content: <main>, else <article>, else <body> without nav, header, footer, aside and forms.',
  },
  pages,
  skipped,
  aggregates,
  site,
};
mkdirSync(dirname(resolve(outPath)), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

const clientPagesInResults = pages.filter((p) => p.isClientPage).map((p) => ({ position: p.position, url: p.url }));
process.stdout.write(`${JSON.stringify({
  keyword,
  pagesAnalysed: pages.length,
  skipped,
  pages: pages.map(oneLine),
  wordCount: aggregates.wordCount,
  h2PerPage: aggregates.h2PerPage,
  subtopics: aggregates.subtopics.slice(0, 25).map((t) => `${t.term} — covered by ${t.coveredBy}`),
  ...(aggregates.subtopics.length > 25 ? { moreSubtopics: aggregates.subtopics.length - 25 } : {}),
  questions: aggregates.questions.slice(0, 30).map((q) => `${q.question} (${q.coveredBy})`),
  ...(aggregates.questions.length > 30 ? { moreQuestions: aggregates.questions.length - 30 } : {}),
  schemaShared: aggregates.schema.shared.map((t) => `${t.type} (${t.coveredBy})`),
  keywordPlacement: aggregates.keywordPlacement,
  dates: aggregates.dates,
  ...(site ? {
    site: {
      site: site.site,
      urlSource: site.urlSource,
      pagesFound: site.pagesFound,
      pagesRead: site.pagesRead,
      internalLinkCandidates: site.internalLinkCandidates.slice(0, 10),
      possibleCannibalization: site.possibleCannibalization,
      ...(clientPagesInResults.length ? { clientPagesInResults } : {}),
    },
  } : {}),
  note: 'Structure only. Read the top 2–3 pages yourself for quality, angle and gaps.',
  fullData: outPath,
}, null, 2)}\n`);
