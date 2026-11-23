#!/usr/bin/env node
// Power-Up Kit — seo-report: compare two crawls
//
// Compares two crawl reports made by the seo-audit skill (seo-crawl JSON) and lists
// what changed between them: health score, issues fixed / new / better / worse,
// pages added or removed, pages whose HTTP status changed (e.g. 200 → 404), new
// redirects, pages that became noindex, title and meta description changes, and
// the indexable page and sitemap URL counts. Tolerates reports from older kit
// versions and the short summary the crawler prints (missing fields are skipped
// and listed under "warnings").
//
// Usage:
//   node compare-crawls.mjs <previous.json> <current.json> [--out diff.json]
//
// Prints a short JSON summary. The full diff goes to --out
// (default .powerup/reports/crawl-diff-<domain>-<date>.json).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fail, isoDate, parseArgs, printJson, siteKey, slugify } from './powerup-lib.mjs';

const USAGE = 'Usage: node compare-crawls.mjs <previous.json> <current.json> [--out diff.json]';
const args = parseArgs(process.argv.slice(2));
const [prevFile, curFile] = args._;
if (!prevFile || !curFile) fail(USAGE);

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const warnings = [];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const has = (obj, key) => obj && Object.prototype.hasOwnProperty.call(obj, key);

function load(file, label) {
  if (!existsSync(file)) fail(`The ${label} crawl file was not found: ${file}`);
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    fail(`The ${label} crawl file is not valid JSON (${file}): ${e.message}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail(`The ${label} crawl file is not a seo-crawl report (${file}). Run the seo-audit skill's crawl to make one.`);
  }
  if (!has(data, 'score') && !Array.isArray(data.issues) && !Array.isArray(data.pages)) {
    fail(`The ${label} crawl file has no score, issues or pages (${file}) — it does not look like a seo-crawl report. Run the seo-audit skill's crawl to make one.`);
  }
  return normalizeReport(data, file, label);
}

function sameUrl(a, b) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    x.hash = '';
    y.hash = '';
    return x.href === y.href;
  } catch {
    return a === b;
  }
}

function normalizeReport(r, file, label) {
  const meta = r.meta && typeof r.meta === 'object' ? r.meta : {};
  const pages = Array.isArray(r.pages) ? r.pages.filter((p) => p && typeof p.url === 'string') : null;
  const issues = Array.isArray(r.issues) ? r.issues.filter((i) => i && typeof i.id === 'string') : null;
  const startUrl = meta.startUrl || r.startUrl || meta.inputUrl || pages?.[0]?.url || null;
  const htmlPages = pages ? pages.filter((p) => p.status >= 200 && p.status < 300 && p.title !== undefined) : null;
  let indexablePages = num(meta.indexablePages);
  if (indexablePages === null && htmlPages) {
    indexablePages = htmlPages.filter((p) => !p.noindex && (!p.canonical || sameUrl(p.canonical, p.finalUrl || p.url))).length;
  }
  let brokenLinks = null;
  if (Array.isArray(r.brokenLinks)) brokenLinks = r.brokenLinks.length;
  else if (issues) brokenLinks = num(issues.find((i) => i.id === 'broken-internal-links')?.count) ?? 0;

  if (!pages) warnings.push(`The ${label} report has no page list (older kit version or the short crawl summary) — page-level changes were not compared.`);
  if (!issues) warnings.push(`The ${label} report has no issue list — issue changes were not compared.`);
  if (num(r.score) === null) warnings.push(`The ${label} report has no health score.`);

  return {
    file,
    startUrl,
    crawledAt: meta.crawledAt || null,
    kitVersion: meta.version || null,
    maxPages: num(meta.maxPages),
    score: num(r.score),
    pagesCrawled: num(meta.pagesCrawled) ?? num(r.pagesCrawled) ?? (pages ? pages.length : null),
    htmlPages: num(meta.htmlPages) ?? num(r.htmlPages) ?? (htmlPages ? htmlPages.length : null),
    indexablePages,
    sitemapUrls: num(r.site?.sitemap?.urlCount) ?? num(r.site?.sitemapUrls) ?? null,
    brokenLinks,
    issues,
    pages,
  };
}

const prev = load(prevFile, 'previous');
const cur = load(curFile, 'current');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function round(n, d = 1) {
  const f = 10 ** d;
  const v = Math.round(n * f) / f;
  return Object.is(v, -0) ? 0 : v;
}

/** "▲ 13" / "▼ 4" / "no change". `lowerIsBetter` adds (better)/(worse) so the arrow reads right. */
function deltaLabel(change, { lowerIsBetter = false } = {}) {
  if (change === null) return null;
  if (change === 0) return 'no change';
  const size = round(Math.abs(change), 1);
  if (lowerIsBetter) return change < 0 ? `▼ ${size} (better)` : `▲ ${size} (worse)`;
  return change > 0 ? `▲ ${size}` : `▼ ${size}`;
}

function countChange(a, b, opts) {
  const change = a === null || b === null ? null : round(b - a, 1);
  return { previous: a, current: b, change, label: deltaLabel(change, opts) };
}

function example(e) {
  if (e === null || e === undefined) return '';
  if (typeof e !== 'object') return String(e);
  if (e.url) return e.status !== undefined ? `${e.url} (${e.status})` : e.url;
  if (Array.isArray(e.urls)) return `${e.title || e.description || 'same text'}: ${e.urls.join(', ')}`;
  return JSON.stringify(e);
}

function examplesOf(issue) {
  const list = issue.examples || issue.affected || [];
  return Array.isArray(list) ? list.slice(0, 5).map(example) : [];
}

const bySeverity = (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) || a.id.localeCompare(b.id);

// ---------------------------------------------------------------------------
// Sanity checks
// ---------------------------------------------------------------------------
const prevSite = prev.startUrl ? siteKey(prev.startUrl) : '';
const curSite = cur.startUrl ? siteKey(cur.startUrl) : '';
const sameSite = prevSite !== '' && prevSite === curSite;
if (prevSite && curSite && !sameSite) {
  warnings.push(`The two crawls are of different sites (${prevSite} and ${curSite}) — page changes compare full URLs.`);
}
if (prev.crawledAt && cur.crawledAt && Date.parse(prev.crawledAt) > Date.parse(cur.crawledAt)) {
  warnings.push(`The "previous" crawl (${prev.crawledAt}) is newer than the "current" one (${cur.crawledAt}) — are the files the right way round?`);
}
if (prev.pagesCrawled && cur.pagesCrawled) {
  const ratio = Math.max(prev.pagesCrawled, cur.pagesCrawled) / Math.min(prev.pagesCrawled, cur.pagesCrawled);
  if (ratio > 1.2) warnings.push(`The crawls differ in size (${prev.pagesCrawled} vs ${cur.pagesCrawled} pages) — some changes may come from crawling different pages, not from real fixes.`);
}
if (prev.maxPages && cur.maxPages && prev.maxPages !== cur.maxPages) {
  warnings.push(`The crawls used different page limits (--max ${prev.maxPages} vs ${cur.maxPages}). Use the same limit each month for a fair comparison.`);
}
for (const [label, r] of [['previous', prev], ['current', cur]]) {
  if (r.maxPages && r.pagesCrawled && r.pagesCrawled >= r.maxPages) {
    warnings.push(`The ${label} crawl stopped at its page limit (${r.maxPages}) — "added" or "removed" pages may only mean they were or weren't reached.`);
  }
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------
let issueDiff = null;
if (prev.issues && cur.issues) {
  const pm = new Map(prev.issues.map((i) => [i.id, i]));
  const cm = new Map(cur.issues.map((i) => [i.id, i]));
  const fixed = [];
  const added = [];
  const better = [];
  const worse = [];
  const unchanged = [];
  for (const [id, p] of pm) {
    if (!cm.has(id)) {
      fixed.push({ id, severity: p.severity || null, title: p.title || null, previousCount: num(p.count), previousExamples: examplesOf(p) });
    }
  }
  for (const [id, c] of cm) {
    const p = pm.get(id);
    const severity = c.severity || p?.severity || null;
    if (!p) {
      added.push({ id, severity, title: c.title || null, count: num(c.count), ofTotal: num(c.ofTotal), deduction: num(c.deduction), examples: examplesOf(c), fix: c.fix || null });
      continue;
    }
    const pc = num(p.count);
    const cc = num(c.count);
    const row = {
      id, severity, title: c.title || p.title || null,
      previous: pc, current: cc, change: pc === null || cc === null ? null : cc - pc,
      previousOfTotal: num(p.ofTotal), currentOfTotal: num(c.ofTotal),
      deductionChange: num(p.deduction) === null || num(c.deduction) === null ? null : round(num(c.deduction) - num(p.deduction), 1),
    };
    if (row.change === null || row.change === 0) unchanged.push(row);
    else if (row.change < 0) better.push(row);
    else worse.push({ ...row, examples: examplesOf(c) });
  }
  issueDiff = {
    fixed: fixed.sort(bySeverity),
    new: added.sort(bySeverity),
    better: better.sort(bySeverity),
    worse: worse.sort(bySeverity),
    unchanged: unchanged.sort(bySeverity),
  };
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
function pageKey(url) {
  if (!sameSite) return url;
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

let pageDiff = null;
if (prev.pages && cur.pages) {
  const pm = new Map();
  for (const p of prev.pages) if (!pm.has(pageKey(p.url))) pm.set(pageKey(p.url), p);
  const cm = new Map();
  for (const p of cur.pages) if (!cm.has(pageKey(p.url))) cm.set(pageKey(p.url), p);
  const keys = [...new Set([...pm.keys(), ...cm.keys()])].sort();
  const out = { added: [], removed: [], statusChanged: [], newRedirects: [], noindexChanged: [], titleChanged: [], descriptionChanged: [] };
  for (const k of keys) {
    const p = pm.get(k);
    const c = cm.get(k);
    if (!p) { out.added.push(c.url); continue; }
    if (!c) { out.removed.push(p.url); continue; }
    const pStatus = num(p.status);
    const cStatus = num(c.status);
    const cRedirects = num(c.redirects) || 0;
    const pRedirects = num(p.redirects) || 0;
    if (pStatus !== null && cStatus !== null && pStatus !== cStatus) {
      out.statusChanged.push({
        url: c.url, from: pStatus, to: cStatus,
        ...(cRedirects && c.finalUrl && !sameUrl(c.finalUrl, c.url) ? { nowRedirectsTo: c.finalUrl } : {}),
      });
    }
    if (!pRedirects && cRedirects && c.finalUrl && !sameUrl(c.finalUrl, c.url)) {
      out.newRedirects.push({ url: c.url, to: c.finalUrl });
    }
    if (typeof p.noindex === 'boolean' && typeof c.noindex === 'boolean' && p.noindex !== c.noindex) {
      out.noindexChanged.push({ url: c.url, from: p.noindex ? 'noindex' : 'indexable', to: c.noindex ? 'noindex' : 'indexable' });
    }
    if (p.title !== undefined && c.title !== undefined && (p.title || null) !== (c.title || null)) {
      out.titleChanged.push({ url: c.url, from: p.title || null, to: c.title || null });
    }
    if (p.metaDescription !== undefined && c.metaDescription !== undefined && (p.metaDescription || null) !== (c.metaDescription || null)) {
      out.descriptionChanged.push({ url: c.url, from: p.metaDescription || null, to: c.metaDescription || null });
    }
  }
  pageDiff = out;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
const describe = (r) => ({ file: r.file, startUrl: r.startUrl, crawledAt: r.crawledAt, kitVersion: r.kitVersion });
const counts = {
  pagesCrawled: countChange(prev.pagesCrawled, cur.pagesCrawled),
  htmlPages: countChange(prev.htmlPages, cur.htmlPages),
  indexablePages: countChange(prev.indexablePages, cur.indexablePages),
  sitemapUrls: countChange(prev.sitemapUrls, cur.sitemapUrls),
  brokenLinks: countChange(prev.brokenLinks, cur.brokenLinks, { lowerIsBetter: true }),
};
const score = countChange(prev.score, cur.score);

const full = {
  tool: 'power-up-kit/compare-crawls',
  previous: describe(prev),
  current: describe(cur),
  score,
  counts,
  issues: issueDiff,
  pages: pageDiff,
  warnings,
};

const domain = slugify(curSite || prevSite || 'site');
const outPath = args.out && args.out !== true ? args.out : `.powerup/reports/crawl-diff-${domain}-${isoDate()}.json`;
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(full, null, 2)}\n`);

const brief = (list, n, map = (x) => x) => (list ? { count: list.length, items: list.slice(0, n).map(map) } : null);
printJson({
  tool: full.tool,
  previous: full.previous,
  current: full.current,
  score,
  counts,
  issues: issueDiff && {
    fixed: issueDiff.fixed.map(({ id, severity, previousCount }) => ({ id, severity, previousCount })),
    new: issueDiff.new.map(({ id, severity, count, ofTotal }) => ({ id, severity, count, ofTotal })),
    better: issueDiff.better.map(({ id, severity, previous, current }) => ({ id, severity, previous, current })),
    worse: issueDiff.worse.map(({ id, severity, previous, current }) => ({ id, severity, previous, current })),
    unchanged: issueDiff.unchanged.length,
  },
  pages: pageDiff && {
    added: brief(pageDiff.added, 5),
    removed: brief(pageDiff.removed, 5),
    statusChanged: brief(pageDiff.statusChanged, 10),
    newRedirects: brief(pageDiff.newRedirects, 5),
    noindexChanged: brief(pageDiff.noindexChanged, 10),
    titleChanged: brief(pageDiff.titleChanged, 5, (t) => t.url),
    descriptionChanged: brief(pageDiff.descriptionChanged, 5, (t) => t.url),
  },
  warnings,
  fullDiff: outPath,
});
