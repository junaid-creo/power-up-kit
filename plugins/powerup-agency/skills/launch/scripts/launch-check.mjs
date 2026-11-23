#!/usr/bin/env node
// Power-Up Kit — launch-check
//
// Go-live checks for a website launch or relaunch. Crawls a few pages politely
// (robots.txt respected, at most 3 requests at a time) and looks for the classic
// launch disasters: noindex left on, robots.txt blocking everything, staging URLs in
// canonicals / links / sitemaps, no analytics, missing redirects, soft 404s and
// placeholder text. Prints a compact JSON verdict (go / go-with-warnings / no-go);
// the full report goes to a JSON file.
//
// Usage:
//   node launch-check.mjs <url> [--phase pre|post] [--max 30] [--staging host1,host2]
//                         [--expect-host www.example.com] [--redirects map.csv]
//                         [--out file.json] [--delay 250]
//
//   --phase pre     staging site, before launch (default). noindex and a blocking
//                   robots.txt are warnings: "remove at launch".
//   --phase post    live site, after launch. The same problems are failures.
//   --staging       extra staging hosts to look for (the usual platform hosts such as
//                   *.webflow.io, *.vercel.app, staging.* are always checked).
//   --expect-host   the host the live site must end on (e.g. www.example.com).
//   --redirects     CSV with two columns, old,new (header optional). Each old path is
//                   checked on this host: one 301/308 hop to the new URL, which returns 200.
//
// Needs real HTTP: local HTML files are not supported. Only check sites you own or
// have permission to check.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  USER_AGENT, VERSION, analyzeHtml, checkLink, cleanText, fail, fetchWithRedirects, isoDate, looksLikePage,
  mapLimit, normalizeUrl, openingTags, parseArgs, parseAttrs, parseRobots, parseSitemap, robotsAllows,
  siteKey, slugify, toInt, truncate,
} from './powerup-lib.mjs';

const USAGE = 'Usage: node launch-check.mjs <https://example.com> [--phase pre|post] [--max 30] [--staging host1,host2] [--expect-host www.example.com] [--redirects map.csv] [--out file.json]';
const NO_NETWORK_HINT = 'If this machine cannot reach the site (for example the Claude app sandbox), fetch the key pages with your web tool and check them by hand with reference/launch-checklist.md — and say the check was done by hand.';

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------
const args = parseArgs(process.argv.slice(2));
const input = args._[0];
if (!input) fail(USAGE);
if (!/^https?:\/\//i.test(input)) {
  if (existsSync(input) || /\.(html?|xml|txt)$/i.test(input)) {
    fail(`Local files are not supported: "${input}". A launch check needs real HTTP (status codes, redirects, robots.txt, sitemap, headers, 404s). Give the staging or live URL instead. ${NO_NETWORK_HINT}`);
  }
  fail(`Not a URL: "${input}". Start it with https:// or http://.\n${USAGE}`);
}
try { new URL(input); } catch { fail(`Not a valid URL: "${input}".\n${USAGE}`); }

const phase = args.phase === undefined ? 'pre' : String(args.phase).toLowerCase();
if (!['pre', 'post'].includes(phase)) fail('--phase must be "pre" (staging, before launch) or "post" (live site, after launch).');
for (const flag of ['staging', 'expect-host', 'redirects', 'out']) {
  if (args[flag] === true) fail(`--${flag} needs a value.\n${USAGE}`);
}
const MAX_PAGES = Math.min(toInt(args.max, 30), 200);
const CONCURRENCY = Math.min(toInt(args.concurrency, 3), 3);
const DELAY = args.delay === undefined ? 250 : Math.max(0, Number(args.delay) || 0);
const cleanHost = (s) => String(s).trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '');
const extraStaging = args.staging ? String(args.staging).split(',').map(cleanHost).filter(Boolean).sort() : [];
const expectHost = args['expect-host'] ? cleanHost(args['expect-host']) : null;
const redirectMap = args.redirects ? readRedirectMap(String(args.redirects)) : null;
const sev = (pre, post) => (phase === 'pre' ? pre : post);
const started = Date.now();

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------
const PLATFORM_RE = /\.(webflow\.io|framer\.app|framer\.website|vercel\.app|netlify\.app|pages\.dev|wpengine\.com|wpenginepowered\.com|kinsta\.cloud)$/i;
const STAGING_PATTERNS = [
  '*.webflow.io', '*.framer.app', '*.framer.website', '*.vercel.app', '*.netlify.app', '*.pages.dev',
  '*.wpengine.com', '*.wpenginepowered.com', '*.kinsta.cloud', '*.myshopify.com (info only)',
  'localhost', '127.0.0.1', 'staging.* / stage.* / dev.* / test.* subdomains', ...extraStaging,
];

const PLACEHOLDER_TEXT = [
  [/lorem ipsum/i, 'lorem ipsum', 'strong'],
  [/dolor sit amet/i, 'dolor sit amet', 'strong'],
  [/\[\s*your\b[^\]]{0,40}\]/i, '[Your …]', 'strong'],
  [/\{\{/, '{{ (unfilled template tag)', 'strong'],
  [/\b(your text here|add (your )?text here|insert (your )?text here|text goes here|placeholder text)\b/i, 'filler text', 'strong'],
  [/just another wordpress site/i, 'WordPress default tagline', 'strong'],
  [/\bTODO\b/, 'TODO', 'weak'],
  [/\bFIXME\b/, 'FIXME', 'weak'],
  [/[\w.+-]+@example\.(com|org|net)\b/i, 'example.com email', 'weak'],
];
const DEFAULT_TITLE_STRONG = [
  /^untitled\b/i, /\|\s*my site\s*$/i, /^my site$/i, /\bmy (webflow|framer|wordpress|shopify) (site|blog|store)\b/i,
  /just another wordpress site/i, /^(new page|page title|site title|your title here|sample page|hello world!?)$/i,
];
const DEFAULT_TITLE_WEAK = [/^home$/i, /^index$/i];

const ANALYTICS = [
  ['Google Analytics 4', /googletagmanager\.com\/gtag\/js\?id=G-|gtag\(\s*['"]config['"]\s*,\s*['"]G-[A-Z0-9]+/i],
  ['Google Tag Manager', /googletagmanager\.com\/gtm\.js|\bGTM-[A-Z0-9]{4,}\b/],
  ['Plausible', /plausible\.io\/js\/|\/js\/plausible[\w.-]*\.js/i],
  ['Fathom', /cdn\.usefathom\.com|usefathom\.com\/script\.js/i],
  ['Matomo', /matomo\.js|piwik\.js|_paq\.push|matomo\.cloud/i],
  ['Umami', /umami\.is\/script\.js|\/umami\.js|data-website-id=/i],
  ['Microsoft Clarity', /clarity\.ms\/tag|["']clarity["']\s*,\s*["']script["']/i],
  ['Meta Pixel', /connect\.facebook\.net\/[^"'\s]*\/fbevents\.js|fbq\(\s*['"]init['"]/i],
  ['Hotjar', /static\.hotjar\.com|hotjar-\d+\.js|\bhjid\s*:/i],
  ['Simple Analytics', /simpleanalyticscdn\.com|simpleanalytics\.com\/(latest|app)\.js/i],
  ['Vercel Analytics', /\/_vercel\/insights\/script\.js|va\.vercel-scripts\.com/i],
  ['Universal Analytics (old)', /google-analytics\.com\/analytics\.js|\bUA-\d{4,}-\d+\b/],
];
const COOKIELESS = new Set(['Plausible', 'Fathom', 'Simple Analytics', 'Umami', 'Vercel Analytics']);
const CONSENT = [
  ['Cookiebot', /consent\.cookiebot\.com|cookiebot\.com\/uc\.js|\bCookiebot\b/i],
  ['OneTrust', /cdn\.cookielaw\.org|otSDKStub|optanon|onetrust/i],
  ['CookieYes', /cdn-cookieyes\.com|cookieyes/i],
  ['Termly', /app\.termly\.io|termly\.io\/embed/i],
  ['iubenda', /iubenda\.com|\b_iub\b/i],
  ['Osano', /cmp\.osano\.com|osano\.js/i],
  ['Complianz', /complianz|cmplz/i],
  ['Usercentrics', /usercentrics/i],
  ['Borlabs Cookie', /borlabs-cookie|BorlabsCookie/i],
  ['Axeptio', /axept\.io|axeptio/i],
];
const CAPTCHA = [
  ['reCAPTCHA', /google\.com\/recaptcha|recaptcha\/api\.js|g-recaptcha|grecaptcha/i],
  ['hCaptcha', /hcaptcha\.com|h-captcha/i],
  ['Cloudflare Turnstile', /challenges\.cloudflare\.com\/turnstile|cf-turnstile/i],
  ['Friendly Captcha', /friendlycaptcha|frc-captcha/i],
];
const FORM_PROVIDERS = [
  ['Webflow', /data-name=|\bw-form\b|data-wf-/i],
  ['HubSpot', /hs-form|hsforms|hbspt/i],
  ['Netlify Forms', /data-netlify|\bnetlify\b/i],
  ['Formspree', /formspree\.io/i],
  ['Contact Form 7', /wpcf7/i],
  ['Gravity Forms', /gform/i],
  ['WPForms', /wpforms/i],
  ['Shopify', /form_type|contact_form/i],
];
const EMBED_FORMS = [
  ['Typeform', /typeform\.com/i], ['Jotform', /jotform\.com/i], ['Google Forms', /docs\.google\.com\/forms/i],
  ['Tally', /tally\.so/i], ['HubSpot', /hsforms\.(com|net)|share\.hsforms/i], ['Airtable', /airtable\.com\/embed/i],
];
const LEGAL = {
  privacy: /privacy|datenschutz|privacidad|confidentialit|privacit|gizlilik|privacybeleid|integritetspolicy|rgpd|gdpr/i,
  terms: /\bterms\b|terms-|conditions|\bagb\b|\btos\b|\bcgv\b|\bcgu\b|condiciones|nutzungsbedingungen|voorwaarden/i,
  cookies: /cookie[\s_-]?(policy|policies|notice|settings|preferences|declaration|richtlinie)|cookie-?beleid|politique[\s-]de[\s-]cookies|pol[ií]tica[\s-]de[\s-]cookies/i,
  imprint: /imprint|impressum|legal[\s_-]?notice|mentions[\s-]l[eé]gales|aviso[\s-]legal|colofon/i,
};

// ---------------------------------------------------------------------------
// 1. Home page, robots.txt, sitemap
// ---------------------------------------------------------------------------
const first = await fetchWithRedirects(normalizeUrl(input), { timeoutMs: 20000, maxBytes: 3_000_000 });
if (first.status === 0) {
  fail(`Could not reach ${input}: ${first.error}. Check the address and that the site is online. ${NO_NETWORK_HINT}`);
}
const startUrl = normalizeUrl(first.url);
const start = new URL(startUrl);
const origin = start.origin;
const mainHost = start.host;
const mainHostname = start.hostname.toLowerCase();
const isHttps = start.protocol === 'https:';
const local = isLocalHost(mainHostname);
const ignoreHosts = new Set([mainHost.toLowerCase(), new URL(normalizeUrl(input)).host.toLowerCase()]);
const protectedHome = first.status === 401 || first.status === 403
  || /\/(password|wp-login\.php)(\/|$)/i.test(start.pathname);

const robotsRes = await fetchWithRedirects(`${origin}/robots.txt`, { timeoutMs: 15000, maxBytes: 500_000 });
const robotsFound = robotsRes.ok && !robotsRes.isHtml && !/<html[\s>]/i.test(robotsRes.body || '');
const robots = robotsFound ? parseRobots(robotsRes.body) : { groups: [], sitemaps: [] };
const blocksAllAgents = robotsFound && !robotsAllows(robots, '*', '/');
const blocksGoogle = robotsFound && !robotsAllows(robots, 'Googlebot', '/');
// A robots.txt that blocks the whole site is the thing we are checking for (the usual
// staging lock). Respecting it would mean checking nothing, so the crawl goes ahead in
// that case only; specific Disallow rules (e.g. /admin/) are always respected.
const honorRobots = robotsFound && !blocksAllAgents;

const sitemapCandidates = robots.sitemaps.length ? robots.sitemaps.slice(0, 5) : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
const sitemap = await loadSitemaps(sitemapCandidates, !robots.sitemaps.length);
const sitemapSet = new Set(sitemap.urls.map(normalizeUrl));

// ---------------------------------------------------------------------------
// 2. Crawl
// ---------------------------------------------------------------------------
const pages = new Map(); // requested url -> record
const analyzed = []; // HTML pages on this host that loaded
const analyzedFinal = new Set();
const inlinks = new Map(); // target url -> Set(source urls)
const queue = [];
const queued = new Set([startUrl, normalizeUrl(input)]);
const skippedByRobots = [];
let discoveredNotCrawled = 0;

function sameHost(u) {
  try { return new URL(u).host.toLowerCase() === mainHost.toLowerCase(); } catch { return false; }
}
function enqueue(u) {
  if (queued.has(u) || queued.size >= MAX_PAGES * 4 || !looksLikePage(u)) return;
  queued.add(u);
  queue.push(u);
}
function processPage(url, r) {
  const rec = { url, finalUrl: r.url, status: r.status, redirects: r.chain.length, error: r.error || null };
  pages.set(url, rec);
  if (!(r.status >= 200 && r.status < 300) || !r.body || !r.isHtml) return;
  if (!sameHost(r.url)) { rec.leftSite = true; return; }
  const finalNorm = normalizeUrl(r.url);
  if (analyzedFinal.has(finalNorm)) { rec.duplicateOf = finalNorm; return; }
  analyzedFinal.add(finalNorm);
  const page = analyzePage(r.body, finalNorm, r.headers || {});
  page.inSitemap = sitemapSet.has(finalNorm) || sitemapSet.has(url);
  analyzed.push(page);
  for (const link of page.internalLinks) {
    if (link.href === url || link.href === finalNorm) continue;
    if (!inlinks.has(link.href)) inlinks.set(link.href, new Set());
    inlinks.get(link.href).add(finalNorm);
    if (!link.nofollow) enqueue(link.href);
  }
}
async function crawlOne(url) {
  const u = new URL(url);
  if (honorRobots && !robotsAllows(robots, USER_AGENT, u.pathname + u.search)) {
    skippedByRobots.push(url);
    return;
  }
  processPage(url, await fetchWithRedirects(url, { maxBytes: 3_000_000 }));
}

if (!protectedHome) {
  processPage(startUrl, first);
  for (const u of sitemap.urls.map(normalizeUrl).filter(sameHost)) enqueue(u);
  let index = 0;
  while (index < queue.length && pages.size + skippedByRobots.length < MAX_PAGES) {
    const room = MAX_PAGES - pages.size - skippedByRobots.length;
    const batch = queue.slice(index, index + Math.min(CONCURRENCY * 4, room));
    index += batch.length;
    await mapLimit(batch, CONCURRENCY, (u) => crawlOne(u), { delayMs: DELAY });
  }
  discoveredNotCrawled = queue.length - index;
} else {
  pages.set(startUrl, { url: startUrl, finalUrl: first.url, status: first.status, redirects: first.chain.length, error: null });
}
analyzed.sort((a, b) => a.url.localeCompare(b.url));
skippedByRobots.sort();
const home = analyzed.find((p) => p.url === startUrl) || null;
const N = analyzed.length;
const NOT_LOADED = protectedHome
  ? 'Not tested: the site asks for a password, so no pages could be read.'
  : 'Not tested: no pages could be loaded.';

// ---------------------------------------------------------------------------
// 3. Checks
// ---------------------------------------------------------------------------
const checks = [];
function check(id, status, evidence, fix = null, extra = {}) {
  checks.push({ id, status, evidence, fix, ...extra });
}
const RANK = { fail: 3, warn: 2, info: 1, pass: 0 };
const worst = (list, fallback = 'pass') => list.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), fallback);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// reachable -----------------------------------------------------------------
{
  const via = first.chain.length ? ` after ${plural(first.chain.length, 'redirect')} (${first.chain.map((c) => `${c.status} ${c.url}`).join(' → ')})` : '';
  if (protectedHome) {
    check('reachable', sev('info', 'fail'), `HTTP ${first.status} at ${first.url} — the site asks for a password${via}.`,
      phase === 'pre'
        ? 'Fine on staging. Remove the password (or the store password page) at launch, then run this check with --phase post. Pages behind the password were not checked.'
        : 'Remove the password protection now: visitors and Google cannot see the site.');
  } else if (first.status >= 200 && first.status < 300 && first.isHtml) {
    check('reachable', 'pass', `HTTP ${first.status} in ${first.timeMs} ms at ${first.url}${via}.`);
  } else if (first.status >= 200 && first.status < 300) {
    check('reachable', 'fail', `The homepage answered HTTP ${first.status} but is not a web page (content type "${first.contentType}").`, 'Check the hosting and domain settings: the homepage must return an HTML page.');
  } else {
    check('reachable', 'fail', `The homepage answered HTTP ${first.status} at ${first.url}${via}.`, 'Fix the homepage first: it must return HTTP 200. Check the hosting, the domain connection and the publish status.');
  }
}

// https and host --------------------------------------------------------------
const platformHost = PLATFORM_RE.test(mainHostname);
if (local) {
  check('https', 'info', `Not tested: ${mainHostname} is a local or test address.`);
  check('host', 'info', `Not tested: ${mainHostname} is a local or test address.`);
} else {
  // https
  if (isHttps) {
    const r = await probe(`http://${mainHost}/`);
    if (r.status === 0 && !r.chain.length) {
      check('https', 'info', `http://${mainHost}/ did not answer (${r.error}). Browsers use https first, so this is usually fine.`, 'If people type the address without https, make sure http:// redirects to https://.');
    } else if (r.url.startsWith('https:')) {
      if (r.chain.length === 1) check('https', 'pass', `http://${mainHost}/ redirects to ${r.url} in one hop (${r.chain[0].status}).`);
      else check('https', 'warn', `http://${mainHost}/ reaches https in ${r.chain.length} hops: ${r.chain.map((c) => `${c.status} ${c.url}`).join(' → ')} → ${r.url}.`, 'Redirect http:// straight to the final https:// address in one 301 hop.');
    } else {
      check('https', sev('warn', 'fail'), `http://${mainHost}/ does not redirect to https (ends at ${r.url}, HTTP ${r.status}).`, 'Turn on "force HTTPS" / "redirect to HTTPS" in the hosting or platform settings (one site-wide 301 redirect).');
    }
  } else {
    const r = await probe(`https://${mainHost}/`);
    if (r.status === 0 && !r.chain.length) {
      check('https', sev('info', 'fail'), phase === 'pre' ? `Not tested: the staging address only works over http (${r.error}).` : `The site does not work over https (${r.error}).`,
        phase === 'pre' ? 'Make sure the live domain gets an SSL certificate at launch.' : 'Add an SSL certificate (most hosts and platforms do this for free) and redirect http:// to https://.');
    } else {
      check('https', sev('warn', 'fail'), `${input} stays on http://; https answers with HTTP ${r.status} at ${r.url}.`, 'Redirect every http:// address to https:// with one site-wide 301 redirect.');
    }
  }
  // host
  if (phase === 'pre' && platformHost) {
    check('host', 'info', `Not tested: ${mainHostname} is a platform staging address. Run with --phase post on the live domain.`);
  } else {
    const alt = mainHostname.startsWith('www.') ? mainHostname.slice(4) : `www.${mainHostname}`;
    const target = expectHost ? expectHost.replace(/:\d+$/, '') : mainHostname;
    const problems = [];
    const notes = [];
    if (expectHost && mainHostname !== target) {
      problems.push({ level: sev('warn', 'fail'), text: `The site ends on ${mainHostname}, but the expected host is ${target}.` });
    }
    if (phase === 'post' && platformHost) {
      problems.push({ level: 'warn', text: `${mainHostname} is a platform address, not a custom domain. Check the real live domain too.` });
    }
    // A www. version of a platform address (www.x.vercel.app) is never a real address — don't test it.
    const variants = platformHost ? [] : [`https://${alt}/`, `http://${alt}/`];
    const results = await mapLimit(variants, CONCURRENCY, (u) => probe(u), { delayMs: DELAY });
    let unreachable = 0;
    results.forEach((r, i) => {
      const hops = r.chain.length ? ` after ${plural(r.chain.length, 'hop')}` : '';
      if (r.status === 0) {
        // No answer at all, or a redirect that ends in an error (e.g. no certificate for www): nothing is served.
        unreachable++;
        notes.push(`${variants[i]} does not answer${hops} (${r.error || 'no response'})`);
        return;
      }
      const endHost = safeHostname(r.url);
      notes.push(`${variants[i]} → ${r.url} (HTTP ${r.status}, ${plural(r.chain.length, 'hop')})`);
      if (endHost === target) return;
      if (r.status >= 200 && r.status < 300) {
        problems.push({ level: sev('warn', 'fail'), text: `${variants[i]} ends on ${endHost}, not ${target} — two versions of the site are live.` });
      } else {
        problems.push({ level: 'warn', text: `${variants[i]} ends on ${endHost} with HTTP ${r.status} — visitors who type it get an error page.` });
      }
    });
    if (variants.length && unreachable === variants.length) {
      problems.push({ level: sev('info', 'warn'), text: `${alt} does not answer — people who type it get an error.` });
    } else if (unreachable && problems.every((p) => !/two versions/.test(p.text))) {
      notes.push(`${alt} only answers partly — make sure it has DNS and an SSL certificate, or leave it out on purpose`);
    }
    const status = worst(problems.map((p) => p.level));
    const okText = variants.length
      ? `Both ${mainHostname} and ${alt} end on ${target}. (${notes.join('; ')})`
      : `${mainHostname} is the only host to check.`;
    check('host', status,
      problems.length ? `${problems.map((p) => p.text).join(' ')}${notes.length ? ` (${notes.join('; ')})` : ''}` : okText,
      problems.length ? (problems.some((p) => /two versions|error page|does not answer|expected host/.test(p.text))
        ? `Pick one main host (${target}) and 301-redirect the other version to it. Add DNS records and SSL for both the root domain and www.`
        : 'Run the check again on the real custom domain once it is connected.') : null);
  }
}

// robots.txt ------------------------------------------------------------------
{
  if (!robotsFound) {
    check('robots-txt', 'warn', `No robots.txt at ${origin}/robots.txt (HTTP ${robotsRes.status}${robotsRes.isHtml ? ', returned a web page' : ''}).`,
      'Add a robots.txt that allows crawling and lists the sitemap, e.g. "User-agent: *", "Allow: /", "Sitemap: https://<domain>/sitemap.xml".');
  } else {
    const problems = [];
    if (blocksAllAgents) problems.push({ level: sev('warn', 'fail'), text: 'robots.txt blocks all crawlers ("Disallow: /" for User-agent: *).' });
    else if (blocksGoogle) problems.push({ level: sev('warn', 'fail'), text: 'robots.txt blocks Googlebot from the whole site.' });
    if (!robots.sitemaps.length) problems.push({ level: 'warn', text: 'No "Sitemap:" line.' });
    const fixes = [];
    if (blocksAllAgents || blocksGoogle) {
      fixes.push(phase === 'pre'
        ? 'Fine on staging — it keeps the staging site out of Google. Remove "Disallow: /" at launch: the live robots.txt must allow crawling.'
        : 'Remove "Disallow: /" now (platform SEO/indexing settings, or edit robots.txt), then test the homepage with URL Inspection in Search Console.');
    }
    if (!robots.sitemaps.length) fixes.push('Add a line "Sitemap: https://<domain>/sitemap.xml".');
    check('robots-txt', worst(problems.map((p) => p.level)),
      problems.length ? problems.map((p) => p.text).join(' ') : `robots.txt allows crawling and lists ${plural(robots.sitemaps.length, 'sitemap')}.`,
      fixes.length ? fixes.join(' ') : null,
      { robots: { url: `${origin}/robots.txt`, sitemaps: robots.sitemaps, blocksAll: blocksAllAgents, blocksGoogle } });
  }
}

// noindex ---------------------------------------------------------------------
{
  const hits = analyzed.filter((p) => p.noindexBy.length);
  if (!N) check('noindex', 'info', NOT_LOADED);
  else if (!hits.length) check('noindex', 'pass', `No noindex on ${plural(N, 'page')} checked (meta robots and X-Robots-Tag).`);
  else {
    check('noindex', sev('warn', 'fail'),
      `${hits.length} of ${plural(N, 'page')} tell search engines not to index them${home && home.noindexBy.length ? ', including the homepage' : ''}.`,
      phase === 'pre'
        ? 'Fine while on staging. At launch, remove noindex from every page that should be in Google (platform indexing setting, WordPress "Discourage search engines", meta robots tag or X-Robots-Tag header).'
        : 'Remove noindex now from every page that should be in Google (platform indexing setting, meta robots tag or X-Robots-Tag header), then request indexing of the homepage in Search Console. A page that is noindex on purpose (e.g. a thank-you page) can be accepted in the sign-off.',
      { pages: hits.map((p) => ({ url: p.url, detail: p.noindexBy.join('; ') })) });
  }
}

// staging leftovers -----------------------------------------------------------
{
  const refs = [];
  const seen = new Set();
  const push = (ref) => {
    const key = `${ref.context}|${ref.url}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(ref);
  };
  for (const p of analyzed) for (const r of p.stagingRefs) push({ ...r, page: p.url });
  for (const sm of robots.sitemaps) {
    const kind = stagingKindOf(sm);
    if (kind) push({ host: safeHost(sm), kind, context: 'robots.txt', url: sm, page: `${origin}/robots.txt` });
  }
  let sitemapRefs = 0;
  for (const u of sitemap.urls) {
    const kind = stagingKindOf(u);
    if (!kind) continue;
    sitemapRefs++;
    if (sitemapRefs <= 10) push({ host: safeHost(u), kind, context: 'sitemap', url: u, page: sitemap.files[0]?.url || 'sitemap' });
  }
  refs.sort((a, b) => a.page.localeCompare(b.page) || a.context.localeCompare(b.context) || a.url.localeCompare(b.url));
  const serious = refs.filter((r) => r.kind !== 'shopify');
  const hosts = [...new Set(serious.map((r) => r.host))].sort();
  const contexts = [...new Set(serious.map((r) => r.context))].sort();
  const pagesOut = refs.map((r) => ({ url: r.page, detail: `${r.context}: ${r.url}${r.kind === 'shopify' ? ' (Shopify — often fine for checkout)' : ''}` }));
  if (!N && !refs.length) check('staging-leftovers', 'info', NOT_LOADED);
  else if (!refs.length) {
    check('staging-leftovers', 'pass', `No links, canonicals, og:url, assets or sitemap URLs point at staging hosts (${plural(N, 'page')}${sitemap.urls.length ? ` and ${plural(sitemap.urls.length, 'sitemap URL')}` : ''} checked).`);
  } else if (!serious.length) {
    check('staging-leftovers', 'info', `${plural(refs.length, 'reference')} to *.myshopify.com — normal for Shopify checkout. Check none of them are links to old pages.`, null, { pages: pagesOut });
  } else {
    check('staging-leftovers', sev('warn', 'fail'),
      `${plural(serious.length, 'reference')} to staging hosts (${hosts.join(', ')}) in: ${contexts.join(', ')}${sitemapRefs > 10 ? ` (${sitemapRefs} sitemap URLs in total)` : ''}.`,
      'Replace staging addresses with the live domain: set the live domain as the default/canonical domain in the platform, re-publish, regenerate the sitemap, and search content, custom code and CMS fields for the staging host. If a link to another project is on purpose, note it as accepted.',
      { pages: pagesOut, hosts });
  }
}

// canonical -------------------------------------------------------------------
{
  if (!N) check('canonical', 'info', NOT_LOADED);
  else {
    const missing = [];
    const relative = [];
    const otherHost = [];
    const insecure = [];
    const notSelf = [];
    for (const p of analyzed) {
      if (!p.canonicalRaw) { missing.push({ url: p.url }); continue; }
      if (!/^https?:\/\//i.test(p.canonicalRaw)) relative.push({ url: p.url, detail: `canonical "${truncate(p.canonicalRaw, 120)}"` });
      const target = p.canonical;
      const host = safeHost(target);
      if (host && host !== mainHost.toLowerCase()) {
        const kind = stagingKindOf(target);
        const toExpected = expectHost && safeHostname(target) === expectHost.replace(/:\d+$/, '');
        otherHost.push({ url: p.url, host, detail: `canonical → ${target}`, level: phase === 'post' ? 'fail' : kind ? 'warn' : toExpected ? 'info' : 'warn' });
      } else if (target && normalizeUrl(target).replace(/\/$/, '') !== p.url.replace(/\/$/, '')) {
        notSelf.push({ url: p.url, detail: `canonical → ${target}` });
      }
      if (isHttps && /^http:/i.test(target || '')) insecure.push({ url: p.url, detail: `canonical → ${target}` });
    }
    const levels = [
      ...otherHost.map((o) => o.level),
      ...(missing.length || relative.length || insecure.length ? ['warn'] : []),
      ...(notSelf.length ? ['info'] : []),
    ];
    const parts = [];
    if (otherHost.length) parts.push(`${otherHost.length} point to another host (${[...new Set(otherHost.map((o) => o.host))].sort().join(', ')})`);
    if (missing.length) parts.push(`${missing.length} have no canonical`);
    if (relative.length) parts.push(`${relative.length} use a relative canonical`);
    if (insecure.length) parts.push(`${insecure.length} point to http:// on an https site`);
    if (notSelf.length) parts.push(`${notSelf.length} point to a different page on this site (check that is on purpose)`);
    const status = worst(levels);
    check('canonical', status,
      parts.length ? `Of ${plural(N, 'page')}: ${parts.join('; ')}.` : `All ${plural(N, 'page')} have an absolute canonical on ${mainHost} that points to the page itself.`,
      status === 'pass' || status === 'info' ? (otherHost.length && phase === 'pre' ? 'Canonicals point to the live domain — correct once it is live.' : null)
        : 'Every page needs a full canonical URL (https://live-domain/page) pointing to itself on the live domain. Set the live domain as the canonical/base URL in the platform settings and re-publish.',
      { pages: [...otherHost.map(({ url, detail }) => ({ url, detail })), ...missing.map((m) => ({ url: m.url, detail: 'no canonical' })), ...relative, ...insecure, ...notSelf] });
  }
}

// sitemap ---------------------------------------------------------------------
const sample = [];
{
  const found = sitemap.files.filter((f) => f.isXml);
  if (!found.length) {
    check('sitemap', 'warn', `No XML sitemap found (tried ${sitemap.files.map((f) => `${f.url} → HTTP ${f.status}${f.error ? ` ${f.error}` : ''}`).join(', ') || sitemapCandidates.join(', ')}).`,
      'Publish an XML sitemap (most platforms make one automatically — turn it on), list it in robots.txt and submit it in Search Console.');
  } else {
    const problems = [];
    const pagesOut = [];
    const invalid = found.filter((f) => !f.valid);
    if (invalid.length) problems.push({ level: 'warn', text: `${plural(invalid.length, 'sitemap file')} do not look like valid XML (${invalid.map((f) => f.url).join(', ')}).` });
    const rightHosts = new Set(phase === 'post' ? [expectHost || mainHost.toLowerCase()] : [mainHost.toLowerCase(), expectHost].filter(Boolean));
    const onRightHost = (u) => rightHosts.has(safeHost(u)) || rightHosts.has(safeHostname(u));
    const wrongHost = sitemap.urls.filter((u) => !onRightHost(u));
    if (wrongHost.length) {
      const hosts = [...new Set(wrongHost.map(safeHost))].sort();
      problems.push({ level: sev('warn', 'fail'), text: `${wrongHost.length} of ${sitemap.urls.length} URLs are on another host (${hosts.join(', ')}).` });
      wrongHost.slice(0, 20).forEach((u) => pagesOut.push({ url: u, detail: 'wrong host' }));
    }
    const wrongScheme = isHttps ? sitemap.urls.filter((u) => /^http:/i.test(u)) : [];
    if (wrongScheme.length) {
      problems.push({ level: 'warn', text: `${wrongScheme.length} URLs use http:// on an https site.` });
      wrongScheme.slice(0, 10).forEach((u) => pagesOut.push({ url: u, detail: 'http:// URL' }));
    }
    if (!sitemap.urls.length) problems.push({ level: 'warn', text: 'The sitemap lists no page URLs.' });
    // Sample up to 20 URLs on this host.
    const toSample = [...new Set(sitemap.urls.filter(sameHost).map(normalizeUrl))].slice(0, 20);
    const results = await mapLimit(toSample, CONCURRENCY, (u) => fetchWithRedirects(u, { maxBytes: 600_000, timeoutMs: 15000 }), { delayMs: DELAY });
    results.forEach((r, i) => {
      const noindex = r.ok && r.isHtml && pageNoindex(r.body || '', r.headers || {});
      sample.push({ url: toSample[i], status: r.status, finalUrl: r.url, redirects: r.chain.length, noindex, error: r.error || null });
    });
    const broken = sample.filter((s) => !(s.status >= 200 && s.status < 300));
    const redirected = sample.filter((s) => s.redirects > 0 && s.status >= 200 && s.status < 300);
    if (broken.length) {
      problems.push({ level: sev('warn', 'fail'), text: `${broken.length} of ${sample.length} sampled URLs do not return 200.` });
      broken.forEach((s) => pagesOut.push({ url: s.url, detail: s.status ? `HTTP ${s.status}` : s.error }));
    }
    if (redirected.length) {
      problems.push({ level: 'warn', text: `${redirected.length} of ${sample.length} sampled URLs redirect (the sitemap should list final URLs).` });
      redirected.forEach((s) => pagesOut.push({ url: s.url, detail: `redirects to ${s.finalUrl}` }));
    }
    const noindexed = [...new Set([
      ...analyzed.filter((p) => p.inSitemap && p.noindexBy.length).map((p) => p.url),
      ...sample.filter((s) => s.noindex).map((s) => s.url),
    ])].sort();
    if (noindexed.length) {
      problems.push({ level: 'warn', text: `${plural(noindexed.length, 'noindex page')} listed in the sitemap.` });
      noindexed.forEach((u) => pagesOut.push({ url: u, detail: 'noindex but in sitemap' }));
    }
    const status = worst(problems.map((p) => p.level));
    const base = `${plural(sitemap.urls.length, 'URL')} in ${plural(found.length, 'sitemap file')} (${found.map((f) => f.url).join(', ')}); ${toSample.length ? `${sample.length} sampled` : 'no URLs on this host to sample'}.`;
    check('sitemap', status, problems.length ? `${base} ${problems.map((p) => p.text).join(' ')}` : `${base} All on the right host, all sampled URLs return 200 without redirects.`,
      problems.length ? 'Regenerate the sitemap on the live domain (platform SEO settings), list only final, indexable 200 URLs, then submit it in Search Console.' : null,
      { pages: pagesOut });
  }
}

// not found (soft 404) ----------------------------------------------------------
const probePath = `/powerup-launch-check-${Date.now().toString(36)}-missing`;
const notFound = await fetchWithRedirects(`${origin}${probePath}`, { maxBytes: 300_000, timeoutMs: 15000 });
const soft404 = notFound.status >= 200 && notFound.status < 300;
{
  const hops = notFound.chain.length ? ` after ${plural(notFound.chain.length, 'redirect')} to ${notFound.url}` : '';
  if (notFound.status === 404 || notFound.status === 410) {
    check('not-found', 'pass', `A random missing page (${probePath}) returns HTTP ${notFound.status}${hops}.`);
  } else if (soft404 && notFound.chain.length && normalizeUrl(notFound.url).replace(/\/$/, '') === startUrl.replace(/\/$/, '')) {
    check('not-found', 'warn', `A random missing page (${probePath}) redirects to the homepage instead of showing a 404.`,
      'Return a real 404 page (with links to the main pages) instead of sending visitors to the homepage. Google treats redirect-to-home as a soft 404.');
  } else if (soft404) {
    check('not-found', 'fail', `A random missing page (${probePath}) returns HTTP ${notFound.status}${hops} — a "soft 404". Google may index error pages and broken links are hidden.`,
      'Make unknown URLs return HTTP 404 with a helpful 404 page (check the hosting rewrite rules or the platform\'s 404 page setting).');
  } else if (notFound.status === 401 || notFound.status === 403) {
    check('not-found', 'info', `Not tested: missing pages answer HTTP ${notFound.status} (password protection).`);
  } else if (notFound.status === 0) {
    check('not-found', 'info', `Not tested: the request failed (${notFound.error}).`);
  } else {
    check('not-found', notFound.status >= 500 ? 'fail' : 'warn', `A random missing page (${probePath}) returns HTTP ${notFound.status}${hops}, not 404.`,
      'Make unknown URLs return HTTP 404 with a helpful 404 page.');
  }
}

// broken links ------------------------------------------------------------------
{
  const allowed = (u) => {
    if (!honorRobots) return true;
    try { const x = new URL(u); return robotsAllows(robots, USER_AGENT, x.pathname + x.search); } catch { return false; }
  };
  const brokenCrawled = [...pages.values()]
    .filter((p) => (p.status >= 400 || p.status === 0) && p.status !== 401 && p.status !== 403 && inlinks.has(p.url))
    .map((p) => ({ url: p.url, status: p.status || p.error }));
  const uncrawled = [...inlinks.keys()].filter((u) => !pages.has(u) && allowed(u)).sort().slice(0, 60);
  const extra = await mapLimit(uncrawled, CONCURRENCY, (u) => checkLink(u), { delayMs: DELAY });
  const brokenExtra = extra.filter((r) => (r.status >= 400 || r.status === 0) && r.status !== 401 && r.status !== 403)
    .map((r) => ({ url: r.url, status: r.status || r.error }));
  const broken = [...brokenCrawled, ...brokenExtra].sort((a, b) => a.url.localeCompare(b.url));
  const checkedCount = [...pages.values()].filter((p) => inlinks.has(p.url)).length + extra.length;
  const pagesOut = broken.map((b) => ({ url: b.url, detail: `HTTP ${b.status}; linked from ${[...(inlinks.get(b.url) || [])].sort().slice(0, 3).join(', ')}` }));
  if (!N) check('broken-links', 'info', NOT_LOADED);
  else if (broken.length) {
    check('broken-links', 'fail', `${plural(broken.length, 'broken internal link target')} (of ${checkedCount} checked).`,
      'Point each link at a working page, or add a 301 redirect from the old URL.', { pages: pagesOut });
  } else if (soft404) {
    check('broken-links', 'info', `Not reliable: this site answers 200 for missing pages, so broken links look fine. ${checkedCount} link targets answered 200. Fix the 404 first, then run again.`);
  } else {
    check('broken-links', 'pass', `${checkedCount} internal link targets checked, none broken${uncrawled.length === 60 ? ' (first 60 uncrawled targets checked)' : ''}.`);
  }
}

// placeholder content -------------------------------------------------------------
{
  const hits = analyzed.filter((p) => p.placeholders.length);
  if (!N) check('placeholder-content', 'info', NOT_LOADED);
  else if (!hits.length) check('placeholder-content', 'pass', `No placeholder text or default titles found on ${plural(N, 'page')}.`);
  else {
    const strong = hits.some((p) => p.placeholders.some((x) => x.level === 'strong'));
    const kinds = [...new Set(hits.flatMap((p) => p.placeholders.map((x) => x.found)))].sort();
    check('placeholder-content', strong ? 'fail' : 'warn', `${plural(hits.length, 'page')} with placeholder text or default titles: ${kinds.join(', ')}.`,
      'Replace every placeholder with final copy (check CMS items and page titles too), then run the check again.',
      { pages: hits.map((p) => ({ url: p.url, detail: p.placeholders.map((x) => `${x.found}${x.sample ? `: "${x.sample}"` : ''}`).join('; ') })) });
  }
}

// analytics -----------------------------------------------------------------------
const toolPages = new Map();
for (const p of analyzed) for (const t of p.analytics) {
  if (!toolPages.has(t)) toolPages.set(t, []);
  toolPages.get(t).push(p.url);
}
const tools = [...toolPages.keys()].sort();
{
  const ids = [...new Set(analyzed.flatMap((p) => p.analyticsIds))].sort();
  const withAny = analyzed.filter((p) => p.analytics.some((t) => t !== 'Universal Analytics (old)'));
  const without = analyzed.filter((p) => !p.analytics.some((t) => t !== 'Universal Analytics (old)'));
  if (!N) check('analytics', 'info', NOT_LOADED);
  else if (!withAny.length) {
    const onlyUa = tools.includes('Universal Analytics (old)');
    check('analytics', 'warn', onlyUa
      ? 'Only the old Universal Analytics was found — it stopped collecting data in 2023.'
      : `No analytics tag found in the HTML of ${plural(N, 'page')} (looked for GA4, Google Tag Manager, Plausible, Fathom, Matomo, Umami, Clarity, Meta Pixel, Hotjar, Simple Analytics, Vercel Analytics).`,
    'Add analytics before launch so launch-day data is not lost (for example GA4 through Google Tag Manager, or a cookieless tool such as Plausible or Fathom). If tags load only after consent or by a script, confirm in the tool\'s real-time view.');
  } else if (without.length) {
    check('analytics', 'warn', `${tools.join(', ')} found${ids.length ? ` (${ids.join(', ')})` : ''} on ${withAny.length} of ${plural(N, 'page')}, missing on ${without.length}${home && without.includes(home) ? ', including the homepage' : ''}.`,
      'Add the tag to the site-wide head code or the missing page templates.', { pages: without.map((p) => ({ url: p.url, detail: 'no analytics tag' })) });
  } else {
    check('analytics', 'pass', `${tools.join(', ')} found${ids.length ? ` (${ids.join(', ')})` : ''} on all ${plural(N, 'page')} checked. The tag is in the HTML; check data arrives in the tool's real-time view.`);
  }
}

// consent ---------------------------------------------------------------------------
{
  const consentTools = [...new Set(analyzed.flatMap((p) => p.consent))].sort();
  const tracking = tools.filter((t) => !COOKIELESS.has(t));
  const consentMode = analyzed.some((p) => p.consentMode);
  if (!N) check('consent', 'info', NOT_LOADED);
  else if (consentTools.length) {
    check('consent', 'info', `Consent tool found: ${consentTools.join(', ')}${consentMode ? '; Google consent mode is set' : ''}. Check the banner in a browser: tags must wait for consent where the law requires it.`);
  } else if (tracking.length) {
    check('consent', 'warn', `Tracking found (${tracking.join(', ')}) but no consent tool detected${consentMode ? ' (Google consent mode is set)' : ''}.`,
      'Check the legal rules for your markets (for example GDPR and ePrivacy in the EU and UK): you may need a consent banner before these tags load. Some banners load through a tag manager and are not visible in the HTML — check in a browser.');
  } else if (tools.length) {
    check('consent', 'info', `Only cookieless analytics found (${tools.join(', ')}) — often no banner is needed, but check the rules for your markets.`);
  } else {
    check('consent', 'info', 'No tracking tags and no consent tool found in the HTML.');
  }
}

// legal pages ------------------------------------------------------------------------
{
  const legal = {};
  for (const p of analyzed) for (const [k, v] of Object.entries(p.legal)) if (!legal[k]) legal[k] = v;
  const names = { privacy: 'privacy policy', terms: 'terms', cookies: 'cookie policy', imprint: 'imprint / legal notice' };
  const foundList = Object.keys(names).filter((k) => legal[k]).map((k) => `${names[k]} (${legal[k]})`);
  const missingList = Object.keys(names).filter((k) => !legal[k]).map((k) => names[k]);
  if (!N) check('legal-pages', 'info', NOT_LOADED);
  else if (!legal.privacy) {
    check('legal-pages', 'warn', `No link to a privacy policy found on ${plural(N, 'page')}.${foundList.length ? ` Found: ${foundList.join(', ')}.` : ''}`,
      'Add a privacy policy page and link it in the footer — most countries require one when a site collects personal data (forms, analytics, cookies).');
  } else {
    check('legal-pages', 'info', `Found: ${foundList.join(', ')}.${missingList.length ? ` Not found: ${missingList.join(', ')} — check whether your markets need them.` : ''}`);
  }
}

// favicon ----------------------------------------------------------------------------
if (!home) check('favicon', 'info', NOT_LOADED);
else if (home.favicon) {
  const r = await checkLink(home.favicon);
  if (r.status >= 200 && r.status < 400) check('favicon', 'pass', `Favicon ${home.favicon} (HTTP ${r.status}).`);
  else check('favicon', 'warn', `Favicon link ${home.favicon} is broken (HTTP ${r.status || r.error}).`, 'Upload the favicon in the platform settings (32×32 and 180×180 PNG) and re-publish.');
} else {
  const r = await fetchWithRedirects(`${origin}/favicon.ico`, { method: 'HEAD', timeoutMs: 12000 });
  if (r.status >= 200 && r.status < 300 && !/html/i.test(r.contentType || '')) check('favicon', 'pass', `No <link rel="icon"> tag, but ${origin}/favicon.ico exists.`);
  else check('favicon', 'warn', 'No favicon: no <link rel="icon"> on the homepage and no /favicon.ico.', 'Upload a favicon in the platform settings (32×32 and 180×180 PNG) and re-publish.');
}

// og:image ---------------------------------------------------------------------------
if (!home) check('og-image', 'info', NOT_LOADED);
else if (!home.ogImage) {
  check('og-image', 'warn', 'The homepage has no og:image — shared links show no picture or a random one.', 'Set a social sharing image (1200×630) for the homepage in the platform SEO/Open Graph settings.');
} else if (!/^https?:\/\//i.test(home.ogImage)) {
  check('og-image', 'warn', `og:image is not a full URL: "${truncate(home.ogImage, 120)}".`, 'Use a full https:// URL for og:image — social sites cannot resolve relative paths.');
} else if (isHttps && /^http:/i.test(home.ogImage)) {
  check('og-image', 'warn', `og:image uses http:// on an https site: ${home.ogImage}.`, 'Use the https:// address of the image.');
} else {
  const r = await checkLink(home.ogImage);
  if (r.status >= 200 && r.status < 400) check('og-image', 'pass', `og:image ${home.ogImage} (HTTP ${r.status}).`);
  else check('og-image', 'warn', `og:image ${home.ogImage} does not load (HTTP ${r.status || r.error}).`, 'Upload the sharing image again and update og:image.');
}

// home basics ------------------------------------------------------------------------
if (!home) check('home-basics', 'info', NOT_LOADED);
else {
  const problems = [];
  if (!home.title) problems.push({ level: 'fail', text: 'no <title>' });
  if (!home.viewport || !/width\s*=\s*device-width/i.test(home.viewport)) problems.push({ level: 'fail', text: 'no mobile viewport meta tag' });
  if (!home.metaDescription) problems.push({ level: 'warn', text: 'no meta description' });
  if (!home.lang) problems.push({ level: 'warn', text: 'no lang attribute on <html>' });
  const facts = `title "${truncate(home.title || '', 70)}", description ${home.metaDescription ? `${home.metaDescription.length} characters` : 'missing'}, lang ${home.lang || 'missing'}, viewport ${home.viewport ? `"${home.viewport}"` : 'missing'}`;
  check('home-basics', worst(problems.map((p) => p.level)),
    problems.length ? `Homepage: ${problems.map((p) => p.text).join(', ')} (${facts}).` : `Homepage: ${facts}.`,
    problems.length ? 'Fill in the homepage title and meta description in the page SEO settings, set the site language, and keep the default mobile viewport tag.' : null);
}

// mixed content ----------------------------------------------------------------------
if (!N) check('mixed-content', 'info', NOT_LOADED);
else if (!isHttps) check('mixed-content', 'info', 'Not tested: the site is not on https.');
else {
  const active = analyzed.filter((p) => p.mixedActive.length);
  const passive = analyzed.filter((p) => p.mixedPassive.length);
  if (!active.length && !passive.length) check('mixed-content', 'pass', `No http:// resources on ${plural(N, 'page')}.`);
  else {
    check('mixed-content', active.length ? 'fail' : 'warn',
      `${active.length ? `${plural(active.length, 'page')} load scripts, styles or frames over http:// (browsers block them)` : ''}${active.length && passive.length ? '; ' : ''}${passive.length ? `${plural(passive.length, 'page')} load images over http://` : ''}.`,
      'Change every http:// resource address to https:// (check custom code, CMS rich text and embeds).',
      { pages: [...active.map((p) => ({ url: p.url, detail: p.mixedActive.slice(0, 3).join(', ') })), ...passive.map((p) => ({ url: p.url, detail: p.mixedPassive.slice(0, 3).join(', ') }))] });
  }
}

// security headers -------------------------------------------------------------------
{
  const h = first.headers || {};
  const csp = h['content-security-policy'] || '';
  const items = [
    ['Strict-Transport-Security (HSTS)', !!h['strict-transport-security'], isHttps ? 'warn' : null],
    ['X-Content-Type-Options', /nosniff/i.test(h['x-content-type-options'] || ''), 'info'],
    ['frame protection (X-Frame-Options or CSP frame-ancestors)', !!h['x-frame-options'] || /frame-ancestors/i.test(csp), 'info'],
    ['Content-Security-Policy', !!csp, 'info'],
  ];
  const present = items.filter((i) => i[1]).map((i) => i[0]);
  const missing = items.filter((i) => !i[1] && i[2]);
  const status = protectedHome ? 'info' : worst(missing.map((i) => i[2]));
  check('security-headers', status,
    `${present.length ? `Present: ${present.join(', ')}.` : 'None of the common security headers found.'}${missing.length ? ` Missing: ${missing.map((i) => i[0]).join(', ')}.` : ''}${!isHttps ? ' HSTS not tested (site is not on https).' : ''}`,
    missing.length ? 'Ask the host or developer to add the missing headers (many platforms set HSTS automatically once https is on). Test a CSP carefully — it can break scripts.' : null);
}

// forms ------------------------------------------------------------------------------
{
  const list = analyzed.flatMap((p) => p.forms.map((f) => ({ ...f, page: p.url, captcha: p.captcha })));
  const real = list.filter((f) => f.kind !== 'search');
  if (!N) check('forms', 'info', NOT_LOADED);
  else if (!list.length) check('forms', 'info', `No forms found on ${plural(N, 'page')} (forms built by JavaScript may not show in the HTML).`);
  else {
    const captchas = [...new Set(real.flatMap((f) => f.captcha))].sort();
    check('forms', 'info',
      `${plural(real.length, 'form')} to test by hand on ${new Set(real.map((f) => f.page)).size} page(s)${list.length > real.length ? ` (plus ${list.length - real.length} search form(s))` : ''}. Captcha: ${captchas.length ? captchas.join(', ') : 'none detected'}.`,
      'Submit each form with test data on the live site: check the thank-you message, that the email arrives (not in spam) and that the data reaches the CRM or sheet.',
      { pages: list.map((f) => ({ url: f.page, detail: `${f.kind}${f.name ? ` "${f.name}"` : ''}${f.provider ? ` (${f.provider})` : ''}: ${f.method} → ${f.action}, ${plural(f.fields, 'field')}${f.captcha.length ? `, ${f.captcha.join(', ')}` : ''}` })) });
  }
}

// redirects --------------------------------------------------------------------------
let redirectRows = [];
if (redirectMap) {
  const rows = redirectMap.rows.slice(0, 500);
  redirectRows = await mapLimit(rows, CONCURRENCY, (row) => checkRedirect(row), { delayMs: DELAY });
  const bad = redirectRows.filter((r) => r.problems.length);
  const levels = bad.map((r) => r.level);
  if (redirectMap.invalid.length) levels.push('warn');
  const okCount = redirectRows.length - bad.length;
  const counts = {};
  for (const r of bad) for (const p of r.problems) counts[p] = (counts[p] || 0) + 1;
  const status = worst(levels);
  check('redirects', status,
    `${okCount} of ${plural(redirectRows.length, 'redirect')} from ${redirectMap.file} are correct (301/308, one hop, target returns 200).${bad.length ? ` Problems: ${Object.entries(counts).sort().map(([k, v]) => `${k} ×${v}`).join(', ')}.` : ''}${redirectMap.invalid.length ? ` ${plural(redirectMap.invalid.length, 'row')} could not be read (lines ${redirectMap.invalid.map((i) => i.line).join(', ')}).` : ''}${redirectMap.rows.length > 500 ? ' Only the first 500 rows were checked.' : ''}`,
    bad.length || redirectMap.invalid.length
      ? `Fix each listed row in the platform's redirect settings: a permanent (301) redirect, straight to the final URL, which must load.${phase === 'pre' ? ' Redirects are often added at launch — run again with --phase post.' : ''}`
      : null,
    { pages: bad.map((r) => ({ url: r.oldUrl, detail: r.detail })) });
}

// ---------------------------------------------------------------------------
// 4. Verdict and output
// ---------------------------------------------------------------------------
const counts = { fail: 0, warn: 0, info: 0, pass: 0 };
for (const c of checks) counts[c.status]++;
const verdict = counts.fail ? 'no-go' : counts.warn ? 'go-with-warnings' : 'go';

const notChecked = [
  'Forms: submitting each form and checking the email arrives (test by hand)',
  'Speed: run PageSpeed on the key pages (proof-check skill)',
  'Visual QA on desktop and mobile, and in Safari, Chrome and Firefox',
  'Payments, bookings and other integrations (test mode)',
  'Accessibility beyond the basics (keyboard, contrast, screen reader)',
  'Analytics events and conversions firing (only the tag in the HTML was detected)',
  'DNS, SSL certificate renewal, backups and admin passwords',
  'Search Console: sitemap submitted, pages indexed',
  'Content added by JavaScript after the page loads (this check reads the HTML)',
];
if (!redirectMap) notChecked.push('Redirects: no redirect map given (--redirects map.csv)');
if (discoveredNotCrawled > 0) notChecked.push(`${plural(discoveredNotCrawled, 'more page')} found but not crawled (--max ${MAX_PAGES})`);
if (skippedByRobots.length) notChecked.push(`${plural(skippedByRobots.length, 'page')} skipped because robots.txt disallows them`);
if (protectedHome) notChecked.push('Every page behind the password');

const report = {
  meta: {
    tool: 'power-up-kit/launch-check',
    version: VERSION,
    phase,
    inputUrl: input,
    startUrl,
    checkedAt: new Date().toISOString(),
    durationSeconds: Math.round((Date.now() - started) / 1000),
    maxPages: MAX_PAGES,
    pagesCrawled: pages.size,
    htmlPagesChecked: N,
    discoveredNotCrawled: discoveredNotCrawled || 0,
    skippedByRobots,
    robotsNote: blocksAllAgents ? 'robots.txt blocks the whole site (a staging lock), so the crawl went ahead to check the site; specific Disallow rules would be respected.' : 'robots.txt respected.',
    expectHost,
    stagingPatterns: STAGING_PATTERNS,
    userAgent: USER_AGENT,
  },
  verdict,
  counts,
  checks,
  sitemap: { files: sitemap.files, urlCount: sitemap.urls.length, sample },
  redirects: redirectRows,
  pages: [...pages.values()].sort((a, b) => a.url.localeCompare(b.url)).map((rec) => {
    const p = analyzed.find((x) => x.url === normalizeUrl(rec.finalUrl || rec.url) && !rec.duplicateOf);
    return {
      ...rec,
      ...(p ? {
        title: p.title, noindex: p.noindexBy, canonical: p.canonical, analytics: p.analytics, consent: p.consent,
        placeholders: p.placeholders.map((x) => x.found), forms: p.forms.length, stagingRefs: p.stagingRefs.length,
      } : {}),
    };
  }),
  notChecked,
};
for (const c of report.checks) if (c.pages && c.pages.length > 50) { c.morePages = c.pages.length - 50; c.pages = c.pages.slice(0, 50); }

const outPath = args.out || join('.powerup', 'reports', `launch-${slugify(siteKey(startUrl))}-${isoDate()}.json`);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

const compact = (c) => ({
  id: c.id,
  evidence: c.evidence,
  ...(c.fix ? { fix: c.fix } : {}),
  ...(c.pages && c.pages.length ? { pages: c.pages.slice(0, 5).map((p) => (p.detail ? `${p.url} — ${p.detail}` : p.url)) } : {}),
  ...(c.pages && c.pages.length > 5 ? { morePages: c.pages.length - 5 + (c.morePages || 0) } : {}),
});
process.stdout.write(`${JSON.stringify({
  tool: 'power-up-kit/launch-check',
  phase,
  startUrl,
  verdict,
  counts,
  fails: checks.filter((c) => c.status === 'fail').map(compact),
  warns: checks.filter((c) => c.status === 'warn').map(compact),
  info: checks.filter((c) => c.status === 'info').map((c) => ({ id: c.id, evidence: c.evidence })),
  pass: checks.filter((c) => c.status === 'pass').map((c) => c.id),
  pagesChecked: N,
  notChecked,
  fullReport: outPath,
}, null, 2)}\n`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isLocalHost(hn) {
  const h = hn.replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.test')
    || h === '0.0.0.0' || h.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(h);
}

function safeHost(u) {
  try { return new URL(u).host.toLowerCase(); } catch { return ''; }
}
function safeHostname(u) {
  try { return new URL(u).hostname.toLowerCase(); } catch { return ''; }
}

/** 'platform' | 'local' | 'subdomain' | 'custom' | 'shopify' | null for a URL. */
function stagingKindOf(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.host.toLowerCase();
  const hn = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (ignoreHosts.has(host)) return null;
  for (const s of extraStaging) if (host === s || hn === s || hn.endsWith(`.${s}`)) return 'custom';
  if (hn.endsWith('.myshopify.com')) return 'shopify';
  if (PLATFORM_RE.test(hn)) return 'platform';
  if (hn === 'localhost' || hn.endsWith('.localhost') || /^127\./.test(hn) || hn === '0.0.0.0' || hn === '::1') return 'local';
  const labels = hn.split('.');
  if (labels.length > 2 && labels.slice(0, -2).some((l) => /^(staging|stage|dev|test)$/.test(l))) return 'subdomain';
  return null;
}

function pageNoindex(html, headers) {
  const x = String(headers['x-robots-tag'] || '').toLowerCase();
  if (/\b(noindex|none)\b/.test(x)) return true;
  for (const tag of openingTags(html.replace(/<!--[\s\S]*?-->/g, ''))) {
    if (tag.name === 'meta' && /^(robots|googlebot)$/i.test(tag.attrs.name || '') && /\b(noindex|none)\b/i.test(tag.attrs.content || '')) return true;
    if (tag.name === 'body') break;
  }
  return false;
}

function snippet(text, index) {
  return truncate(text.slice(Math.max(0, index - 20), index + 50).trim(), 70);
}

function analyzePage(html, url, headers) {
  const a = analyzeHtml(html, url);
  const raw = html.replace(/<!--[\s\S]*?-->/g, '');
  const xRobots = String(headers['x-robots-tag'] || '').toLowerCase();
  const metaRobots = (a.metaRobots || '').toLowerCase();
  const noindexBy = [];
  if (/\b(noindex|none)\b/.test(metaRobots)) noindexBy.push(`meta robots "${metaRobots}"`);
  if (/\b(noindex|none)\b/.test(xRobots)) noindexBy.push(`X-Robots-Tag "${xRobots}"`);

  let canonicalRaw = null;
  let ogUrlRaw = null;
  for (const tag of openingTags(raw)) {
    if (tag.name === 'link' && canonicalRaw === null && (tag.attrs.rel || '').toLowerCase().split(/\s+/).includes('canonical')) canonicalRaw = (tag.attrs.href || '').trim();
    if (tag.name === 'meta' && ogUrlRaw === null && (tag.attrs.property || '').toLowerCase() === 'og:url') ogUrlRaw = (tag.attrs.content || '').trim();
  }

  // Visible text (no scripts, styles or code samples) for placeholder checks.
  const visible = raw
    .replace(/<(script|style|template|noscript|svg|pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  const bodyMatch = visible.match(/<body\b[^>]*>([\s\S]*)$/i);
  const text = cleanText(bodyMatch ? bodyMatch[1] : visible.replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, ' '));

  const placeholders = [];
  for (const [re, label, level] of PLACEHOLDER_TEXT) {
    const m = text.match(re);
    if (m) placeholders.push({ found: label, level, sample: snippet(text, m.index) });
  }
  if (!placeholders.some((p) => p.found === 'example.com email') && /mailto:[^"'\s>]*@example\.(com|org|net)\b/i.test(raw)) {
    placeholders.push({ found: 'example.com email', level: 'weak', sample: 'mailto link' });
  }
  if (a.title) {
    if (DEFAULT_TITLE_STRONG.some((re) => re.test(a.title))) placeholders.push({ found: 'default page title', level: 'strong', sample: a.title });
    else if (DEFAULT_TITLE_WEAK.some((re) => re.test(a.title))) placeholders.push({ found: 'generic page title', level: 'weak', sample: a.title });
  }

  const analytics = ANALYTICS.filter(([, re]) => re.test(raw)).map(([name]) => name);
  const analyticsIds = [];
  if (analytics.includes('Google Analytics 4')) analyticsIds.push(...new Set(raw.match(/\bG-[A-Z0-9]{6,12}\b/g) || []));
  if (analytics.includes('Google Tag Manager')) analyticsIds.push(...new Set(raw.match(/\bGTM-[A-Z0-9]{4,}\b/g) || []));
  const consent = CONSENT.filter(([, re]) => re.test(raw)).map(([name]) => name);
  const consentMode = /gtag\(\s*['"]consent['"]/i.test(raw);
  const captcha = CAPTCHA.filter(([, re]) => re.test(raw)).map(([name]) => name);

  const legal = {};
  for (const l of a.links) {
    let path = '';
    try { path = decodeURIComponent(new URL(l.href).pathname); } catch { /* ignore */ }
    const hay = `${path} ${l.text}`;
    for (const [k, re] of Object.entries(LEGAL)) if (!legal[k] && re.test(hay)) legal[k] = l.href;
  }

  const forms = [];
  for (const m of raw.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi)) {
    const fa = parseAttrs(m[1]);
    const fields = [...m[2].matchAll(/<(input|select|textarea)\b([^>]*)>/gi)]
      .map((x) => ({ tag: x[1].toLowerCase(), attrs: parseAttrs(x[2]) }))
      .filter((f) => !(f.tag === 'input' && /^(hidden|submit|button|image|reset)$/i.test(f.attrs.type || '')));
    const isSearch = (fa.role || '').toLowerCase() === 'search' || /search/i.test(fa.action || '')
      || (fields.length === 1 && /^(q|s|search|query)$/i.test(fields[0].attrs.name || ''));
    const provider = FORM_PROVIDERS.find(([, re]) => re.test(m[0]) || re.test(fa.action || ''));
    let action = '(same page)';
    if (fa.action) {
      try { action = truncate(new URL(fa.action, url).href, 120); } catch { action = truncate(fa.action, 120); }
    }
    forms.push({
      kind: isSearch ? 'search' : 'form',
      name: fa['data-name'] || fa.name || fa.id || fa['aria-label'] || null,
      method: (fa.method || 'get').toUpperCase(),
      action,
      fields: fields.length,
      provider: provider ? provider[0] : null,
    });
  }
  for (const src of a.iframes) {
    const embed = EMBED_FORMS.find(([, re]) => re.test(src));
    if (embed) forms.push({ kind: 'embedded form', name: null, method: 'iframe', action: truncate(src, 120), fields: 0, provider: embed[0] });
  }
  if (/hbspt\.forms\.create/i.test(raw) && !forms.some((f) => f.provider === 'HubSpot')) {
    forms.push({ kind: 'embedded form', name: null, method: 'script', action: 'HubSpot form built by JavaScript', fields: 0, provider: 'HubSpot' });
  }

  const stagingRefs = [];
  const seenRef = new Set();
  const addRef = (u, context) => {
    if (!u) return;
    let abs;
    try {
      const x = new URL(u, url);
      x.hash = '';
      abs = x.href;
    } catch { return; }
    const kind = stagingKindOf(abs);
    if (!kind || seenRef.has(`${context}|${abs}`)) return;
    // The raw text scan only adds URLs not already found in a tag.
    if (context.startsWith('other') && seenRef.has(abs)) return;
    seenRef.add(`${context}|${abs}`);
    seenRef.add(abs);
    stagingRefs.push({ host: safeHost(abs), kind, context, url: truncate(abs, 200) });
  };
  addRef(a.canonical, 'canonical');
  addRef(ogUrlRaw, 'og:url');
  addRef(a.og.image, 'og:image');
  for (const l of a.links) addRef(l.href, 'link');
  for (const u of [...a.images.map((i) => i.src), ...a.scripts, ...a.stylesheets, ...a.iframes]) addRef(u, 'asset');
  for (const m of raw.matchAll(/https?:(?:\\?\/){2}[a-z0-9.-]+(?::\d+)?[^\s"'<>)\\]*/gi)) addRef(m[0].replace(/\\\//g, '/').replace(/&quot;.*$/i, ''), 'other (code or text)');

  const resources = (list) => list.filter((u) => typeof u === 'string' && /^http:/i.test(u));
  const httpsPage = url.startsWith('https:');

  return {
    url,
    title: a.title,
    metaDescription: a.metaDescription,
    lang: a.lang,
    viewport: a.viewport,
    noindexBy,
    canonicalRaw,
    canonical: a.canonical,
    ogImage: a.og.image || null,
    favicon: a.favicon,
    internalLinks: a.links.filter((l) => sameHost(l.href)).map((l) => ({ href: normalizeUrl(l.href), nofollow: l.nofollow })),
    stagingRefs,
    placeholders,
    analytics,
    analyticsIds,
    consent,
    consentMode,
    captcha,
    legal,
    forms,
    mixedActive: httpsPage ? [...new Set(resources([...a.scripts, ...a.stylesheets, ...a.iframes]))] : [],
    mixedPassive: httpsPage ? [...new Set(resources(a.images.map((i) => i.src)))] : [],
  };
}

/** HEAD first (cheap), GET when the server refuses HEAD. */
async function probe(url, opts = {}) {
  let r = await fetchWithRedirects(url, { method: 'HEAD', timeoutMs: 15000, ...opts });
  if (r.status === 0 || [400, 403, 405, 406, 429, 501].includes(r.status)) {
    const g = await fetchWithRedirects(url, { method: 'GET', timeoutMs: 20000, maxBytes: 200_000, ...opts });
    if (g.status !== 0 || r.status === 0) r = g;
  }
  return r;
}

async function loadSitemaps(candidates, stopAtFirst) {
  const files = [];
  const urls = [];
  const queue = [...candidates];
  const seen = new Set();
  while (queue.length && files.length < 5 && urls.length < 5000) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    const isGz = /\.gz(\?|$)/i.test(sm);
    const r = await fetchWithRedirects(sm, { binary: isGz, timeoutMs: 20000, maxBytes: 20_000_000 });
    let xml = '';
    if (r.ok && r.body) {
      if (isGz) {
        try { xml = gunzipSync(r.body).toString('utf8'); } catch { xml = r.body.toString('utf8'); }
      } else {
        xml = r.body;
      }
    }
    const isXml = /<(urlset|sitemapindex)\b/i.test(xml);
    const trimmed = xml.trim();
    const count = (re) => (trimmed.match(re) || []).length;
    const valid = isXml && /<\/(urlset|sitemapindex)\s*>$/i.test(trimmed)
      && count(/<url\b/gi) === count(/<\/url\s*>/gi) && count(/<loc\b/gi) === count(/<\/loc\s*>/gi);
    const parsed = isXml ? parseSitemap(xml) : { urls: [], sitemaps: [] };
    files.push({ url: sm, status: r.status, finalUrl: r.url, redirects: r.chain.length, isXml, valid, urls: parsed.urls.length, childSitemaps: parsed.sitemaps.length, error: r.error || null });
    for (const child of parsed.sitemaps) if (!seen.has(child)) queue.push(child);
    for (const u of parsed.urls) if (urls.length < 5000) urls.push(u);
    if (stopAtFirst && isXml) {
      // Fallback candidates (/sitemap.xml, /sitemap_index.xml): stop once one works.
      for (let i = queue.length - 1; i >= 0; i--) if (candidates.includes(queue[i])) queue.splice(i, 1);
    }
  }
  return { files, urls };
}

function sameTarget(a, b) {
  const norm = (s) => {
    try {
      const u = new URL(s);
      const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
      return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
    } catch { return s; }
  };
  return norm(a) === norm(b);
}

async function checkRedirect(row) {
  let oldUrl;
  if (/^https?:\/\//i.test(row.old)) {
    const u = new URL(row.old);
    // Old URLs on this site are tested on this host; old URLs on another domain
    // (a domain move) are tested as written.
    oldUrl = siteKey(u.href) === siteKey(startUrl) ? `${origin}${u.pathname}${u.search}` : u.href;
  } else {
    oldUrl = new URL(row.old, origin).href;
  }
  const expected = new URL(row.new, origin).href;
  const r = await probe(oldUrl, { maxRedirects: 5 });
  const problems = [];
  const firstHop = r.chain[0];
  const firstTarget = r.chain[1] ? r.chain[1].url : r.url;
  if (r.status === 0 && !r.chain.length) problems.push('error');
  else if (!firstHop) problems.push(r.status >= 200 && r.status < 300 ? 'no-redirect' : 'missing');
  else {
    if (![301, 308].includes(firstHop.status)) problems.push('temporary');
    if (!sameTarget(firstTarget, expected)) problems.push(sameTarget(r.url, expected) ? 'chain' : 'wrong-target');
    else if (r.chain.length > 1) problems.push('chain');
    if (!(r.status >= 200 && r.status < 300)) problems.push('target-not-200');
  }
  const severe = problems.some((p) => ['error', 'missing', 'target-not-200'].includes(p));
  const level = problems.length ? (phase === 'post' && severe ? 'fail' : 'warn') : 'pass';
  const got = firstHop
    ? `${firstHop.status} → ${firstTarget}${r.chain.length > 1 ? ` (${r.chain.length} hops, ends at ${r.url})` : ''}, final HTTP ${r.status || r.error}`
    : r.status ? `HTTP ${r.status}, no redirect` : `request failed (${r.error})`;
  return {
    line: row.line,
    old: row.old,
    oldUrl,
    expected,
    firstStatus: firstHop ? firstHop.status : r.status,
    hops: r.chain.length,
    finalUrl: r.url,
    finalStatus: r.status,
    problems,
    level,
    detail: `${problems.length ? `${problems.join(', ')}: ` : ''}expected 301 → ${expected}; got ${got}`,
  };
}

function parseCsvLine(line, delim) {
  const cells = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { cells.push(cur.trim()); cur = ''; } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function readRedirectMap(file) {
  if (!existsSync(file)) fail(`Redirect map not found: ${file}`);
  const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).map((t, i) => ({ n: i + 1, t })).filter((l) => l.t.trim() && !l.t.trim().startsWith('#'));
  if (!lines.length) fail(`Redirect map ${file} is empty. Expected two columns: old,new (for example "/old-page,/new-page").`);
  const firstLine = lines[0].t;
  const delim = firstLine.includes(',') ? ',' : firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
  let rows = lines.map((l) => ({ line: l.n, cells: parseCsvLine(l.t, delim) }));
  const isTarget = (c) => /^(\/|https?:\/\/)/i.test(c || '');
  let oldCol = 0;
  let newCol = 1;
  if (!isTarget(rows[0].cells[0])) {
    const header = rows[0].cells.map((c) => c.toLowerCase().trim());
    const oi = header.findIndex((h) => /^(old|from|source|old[\s_-]?(url|path)|redirect[\s_-]?from)$/.test(h));
    const ni = header.findIndex((h) => /^(new|to|target|destination|new[\s_-]?(url|path)|redirect[\s_-]?to)$/.test(h));
    if (oi !== -1) oldCol = oi;
    if (ni !== -1) newCol = ni;
    rows = rows.slice(1);
  }
  const out = [];
  const invalid = [];
  for (const r of rows) {
    const oldV = r.cells[oldCol] || '';
    const newV = r.cells[newCol] || '';
    if (!isTarget(oldV) || !isTarget(newV)) invalid.push({ line: r.line, text: r.cells.join(delim) });
    else out.push({ line: r.line, old: oldV, new: newV });
  }
  if (!out.length) fail(`No usable rows in ${file}. Expected two columns, old and new, each a path such as /old-page or a full URL. A header row is optional.`);
  return { file, rows: out, invalid };
}
