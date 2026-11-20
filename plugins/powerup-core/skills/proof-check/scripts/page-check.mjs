#!/usr/bin/env node
// Power-Up Kit — proof-check: page-check
//
// Checks one web page and prints evidence as JSON: status, redirects, speed of the
// server response, SEO basics, accessibility basics, mixed content and broken links.
//
// Usage:
//   node page-check.mjs <url>                     live page or local dev server
//   node page-check.mjs <file.html> [--base-url https://example.com/page]
// Options:
//   --links <n>     internal links to test (default 40, 0 to skip)
//   --external      also test external links (up to 20)
//   --summary       print only the summary and the failed/warned checks

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  analyzeHtml, checkLink, fetchWithRedirects, linkStatus, mapLimit, parseArgs, printJson, fail, VERSION,
} from './powerup-lib.mjs';

const args = parseArgs(process.argv.slice(2), { booleans: ['external', 'summary'] });
const target = args._[0];
if (!target) {
  fail('Usage: node page-check.mjs <url | file.html> [--base-url URL] [--links 40] [--external] [--summary]');
}

const checks = [];
function add(id, label, status, detail, evidence) {
  checks.push({ id, label, status, detail, ...(evidence !== undefined ? { evidence } : {}) });
}

async function main() {
  const isFile = !/^https?:\/\//i.test(target) && existsSync(target);
  let html;
  let pageUrl;
  let response = null;

  if (isFile) {
    html = readFileSync(target, 'utf8');
    pageUrl = args['base-url'] || pathToFileURL(resolve(target)).href;
    add('source', 'Source', 'info', `Local file ${target}. Server checks (status, speed, redirects) need a URL.`);
  } else {
    if (!/^https?:\/\//i.test(target)) fail(`Not a URL or an existing file: ${target}`);
    response = await fetchWithRedirects(target);
    pageUrl = response.url;
    if (response.status === 0) {
      add('http-status', 'Page loads', 'fail', `Could not load the page: ${response.error}`);
      return finish(null, response);
    }
    html = response.isHtml ? response.body : '';
    const s = response.status;
    add('http-status', 'Page loads', s >= 200 && s < 300 ? 'pass' : 'fail', `HTTP ${s}`, { finalUrl: response.url });
    if (response.chain.length) {
      add('redirects', 'Redirects', response.chain.length > 1 ? 'warn' : 'info',
        `${response.chain.length} redirect(s) before the page loads${response.chain.length > 1 ? ' — a chain slows pages and wastes crawl budget' : ''}`,
        response.chain);
    }
    add('https', 'Uses HTTPS', response.url.startsWith('https:') ? 'pass' : 'warn',
      response.url.startsWith('https:') ? 'Final URL is HTTPS' : 'Final URL is not HTTPS (fine on localhost, not on a live site)');
    const t = response.timeMs;
    add('response-time', 'Server response + download time', t < 800 ? 'pass' : t < 2000 ? 'warn' : 'fail', `${t} ms (one request, from this machine)`);
    if (!response.isHtml) {
      add('content-type', 'Content type', 'fail', `Expected HTML, got "${response.contentType}"`);
      return finish(null, response);
    }
    if (response.truncated) add('size', 'Page size', 'warn', 'HTML is larger than 6 MB and was cut off for analysis');
  }

  const a = analyzeHtml(html, pageUrl);

  // --- SEO basics -----------------------------------------------------------
  if (!a.title) add('title', 'Title tag', 'fail', 'Missing <title>');
  else {
    const n = a.title.length;
    add('title', 'Title tag', n >= 15 && n <= 60 ? 'pass' : 'warn', `${n} characters${n > 60 ? ' (Google usually cuts off after ~60)' : n < 15 ? ' (very short)' : ''}`, a.title);
  }
  if (a.titleCount > 1) add('title-count', 'Single title tag', 'warn', `${a.titleCount} <title> tags found`);

  if (!a.metaDescription) add('meta-description', 'Meta description', 'warn', 'Missing — Google will pick random text for the snippet');
  else {
    const n = a.metaDescription.length;
    add('meta-description', 'Meta description', n >= 70 && n <= 160 ? 'pass' : 'warn', `${n} characters${n > 160 ? ' (likely cut off)' : n < 70 ? ' (short)' : ''}`, a.metaDescription);
  }

  if (a.h1.length === 0) add('h1', 'One H1 heading', 'fail', 'No <h1> on the page');
  else add('h1', 'One H1 heading', a.h1.length === 1 ? 'pass' : 'warn', `${a.h1.length} H1 heading(s)`, a.h1.slice(0, 5));

  const skips = [];
  for (let i = 1; i < a.headings.length; i++) {
    const prev = a.headings[i - 1].level;
    const cur = a.headings[i].level;
    if (cur > prev + 1) skips.push(`h${prev} → h${cur} ("${a.headings[i].text.slice(0, 50)}")`);
  }
  add('heading-order', 'Heading order', skips.length ? 'warn' : 'pass', skips.length ? `${skips.length} skipped level(s)` : 'No skipped heading levels', skips.slice(0, 5));

  if (a.canonical === null) add('canonical', 'Canonical URL', 'warn', 'No canonical link');
  else {
    const self = a.canonical.replace(/\/$/, '') === pageUrl.replace(/\/$/, '');
    add('canonical', 'Canonical URL', self ? 'pass' : 'info', self ? 'Points to this page' : 'Points to a different URL — make sure that is intended', a.canonical);
  }

  if (a.metaRobots && /noindex/.test(a.metaRobots)) {
    add('robots-meta', 'Indexable', 'warn', 'Page has noindex — Google will not show it. Intended?', a.metaRobots);
  } else if (response && /noindex/i.test(response.headers?.['x-robots-tag'] || '')) {
    add('robots-meta', 'Indexable', 'warn', 'X-Robots-Tag header says noindex', response.headers['x-robots-tag']);
  } else {
    add('robots-meta', 'Indexable', 'pass', 'No noindex found');
  }

  const ogOk = a.og.title && a.og.image;
  add('open-graph', 'Social sharing preview', ogOk ? 'pass' : 'warn', ogOk ? 'og:title and og:image present' : `Missing ${[!a.og.title && 'og:title', !a.og.image && 'og:image'].filter(Boolean).join(' and ')}`);

  if (!a.jsonLd.length) add('structured-data', 'Structured data (JSON-LD)', 'info', 'None found');
  else {
    const bad = a.jsonLd.filter((j) => !j.valid);
    add('structured-data', 'Structured data (JSON-LD)', bad.length ? 'fail' : 'pass',
      bad.length ? `${bad.length} block(s) are not valid JSON` : `Types: ${[...new Set(a.jsonLd.flatMap((j) => j.types))].join(', ') || 'none named'}`,
      bad.map((b) => b.error));
  }

  // --- Accessibility & mobile basics -----------------------------------------
  add('lang', 'Page language set', a.lang ? 'pass' : 'warn', a.lang ? `lang="${a.lang}"` : 'Missing lang on <html> — screen readers may use the wrong voice');
  add('viewport', 'Mobile viewport', a.viewport && /width\s*=\s*device-width/.test(a.viewport) ? 'pass' : 'fail',
    a.viewport ? `content="${a.viewport}"` : 'Missing <meta name="viewport"> — page will look zoomed out on phones');
  if (a.viewport && /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/.test(a.viewport)) {
    add('zoom', 'Zoom allowed', 'warn', 'Viewport blocks zooming — an accessibility problem');
  }

  const noAlt = a.images.filter((i) => !i.hasAlt);
  add('img-alt', 'Images have alt text', noAlt.length ? 'warn' : 'pass',
    a.images.length ? `${a.images.length - noAlt.length}/${a.images.length} images have an alt attribute` : 'No images',
    noAlt.slice(0, 10).map((i) => i.src));
  const noSize = a.images.filter((i) => !i.width || !i.height);
  if (noSize.length) add('img-size', 'Images have width/height', 'info', `${noSize.length} image(s) without width/height — can cause layout shift`, noSize.slice(0, 5).map((i) => i.src));

  const emptyLinks = a.links.filter((l) => !l.text);
  if (emptyLinks.length) add('link-names', 'Links have names', 'warn', `${emptyLinks.length} link(s) with no text or label`, emptyLinks.slice(0, 5).map((l) => l.href));

  add('favicon', 'Favicon', a.favicon ? 'pass' : 'warn', a.favicon ? a.favicon : 'No <link rel="icon">');

  if (a.mixedContent.length) add('mixed-content', 'No insecure (http) resources', 'fail', `${a.mixedContent.length} http:// resource(s) on an https page`, a.mixedContent.slice(0, 10));
  else if (pageUrl.startsWith('https:')) add('mixed-content', 'No insecure (http) resources', 'pass', 'None found');

  add('word-count', 'Words on page', 'info', `${a.wordCount} words`);

  // --- Links ---------------------------------------------------------------
  const linkLimit = args.links === undefined ? 40 : Math.max(0, Number.parseInt(args.links, 10) || 0);
  const canCheckLinks = /^https?:/.test(pageUrl);
  let linkReport = null;
  if (linkLimit > 0 && canCheckLinks) {
    const internal = [...new Set(a.links.filter((l) => l.internal).map((l) => l.href))].slice(0, linkLimit);
    const external = args.external ? [...new Set(a.links.filter((l) => !l.internal).map((l) => l.href))].slice(0, 20) : [];
    const externalSet = new Set(external);
    const results = await mapLimit([...internal, ...external], 4, (u) => checkLink(u));
    const classified = results.map((r) => ({ ...r, verdict: linkStatus(r, { external: externalSet.has(r.url) }) }));
    const broken = classified.filter((r) => r.verdict === 'broken');
    const blocked = classified.filter((r) => r.verdict === 'blocked');
    const uniqueOnPage = new Set(a.links.map((l) => l.href)).size;
    linkReport = { checked: results.length, internalChecked: internal.length, externalChecked: external.length, broken, blocked };
    add('broken-links', 'Links work', broken.length ? 'fail' : 'pass',
      `${results.length - broken.length - blocked.length}/${results.length} links OK${uniqueOnPage > results.length ? ` (${results.length} of ${uniqueOnPage} different links checked)` : ''}`,
      broken.slice(0, 15).map((b) => `${b.status || 'ERR'} ${b.url}${b.error ? ` (${b.error})` : ''}`));
    if (blocked.length) {
      add('links-unverified', 'Links that block automated checks', 'info',
        `${blocked.length} link(s) refuse bots (e.g. LinkedIn answers 999) — open them by hand to confirm`,
        blocked.slice(0, 10).map((b) => `${b.status || 'ERR'} ${b.url}`));
    }
  } else if (!canCheckLinks) {
    add('broken-links', 'Links work', 'info', 'Not checked: pass --base-url to test links from a local file');
  }

  return finish(a, response, linkReport);
}

function finish(a, response, linkReport = null) {
  const summary = {
    pass: checks.filter((c) => c.status === 'pass').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
    info: checks.filter((c) => c.status === 'info').length,
  };
  const out = {
    tool: 'power-up-kit/page-check',
    version: VERSION,
    checkedAt: new Date().toISOString(),
    target,
    finalUrl: response?.url || a?.url || target,
    verdict: summary.fail ? 'fail' : summary.warn ? 'pass with warnings' : 'pass',
    summary,
    checks: args.summary ? checks.filter((c) => c.status === 'fail' || c.status === 'warn') : checks,
    ...(linkReport && !args.summary ? { links: linkReport } : {}),
    notChecked: [
      'Visual layout and screenshots (use a browser tool)',
      'Colour contrast and keyboard use (run scripts/a11y-snippet.js in a browser)',
      'Real-user speed (run scripts/pagespeed.mjs for public URLs)',
    ],
  };
  printJson(out);
}

main().catch((err) => fail(`page-check failed: ${err.stack || err}`));
