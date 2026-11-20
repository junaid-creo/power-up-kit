#!/usr/bin/env node
// Power-Up Kit — extract brand details from a website or local HTML/CSS.
//
// Finds colours (with likely roles), fonts, logo candidates, and copy samples for
// judging tone of voice. Prints JSON. Everything it guesses is marked as a guess.
//
// Usage:
//   node extract-brand.mjs <url | file.html> [--css extra.css] [--max-css 8] [--out brand-raw.json]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  COLOR_TOKEN_RE, analyzeHtml, chroma, cleanText, contrastRatio, deltaE, fetchWithRedirects, isSameSite,
  openingTags, parseArgs, parseColor, printJson, toHex, toInt, wcagRating, fail, VERSION,
} from './powerup-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const target = args._[0];
if (!target) fail('Usage: node extract-brand.mjs <url | file.html> [--css extra.css] [--max-css 8] [--out file.json]');
const MAX_CSS = toInt(args['max-css'], 8);

// ---------------------------------------------------------------------------
// Load HTML and CSS
// ---------------------------------------------------------------------------
let html;
let pageUrl;
const isUrl = /^https?:\/\//i.test(target);
if (isUrl) {
  const r = await fetchWithRedirects(target);
  if (!r.ok || !r.body) fail(`Could not load ${target}: ${r.error || `HTTP ${r.status}`}`);
  html = r.body;
  pageUrl = r.url;
} else {
  if (!existsSync(target)) fail(`File not found: ${target}`);
  html = readFileSync(target, 'utf8');
  pageUrl = pathToFileURL(resolve(target)).href;
}
const page = analyzeHtml(html, pageUrl);
const rawHtml = html.replace(/<!--[\s\S]*?-->/g, '');

const cssSources = [];
for (const m of rawHtml.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) cssSources.push({ from: 'inline <style>', css: m[1] });
const inlineStyleAttrs = [];
for (const tag of openingTags(rawHtml)) {
  if (tag.attrs.style) inlineStyleAttrs.push(`${tag.name}${tag.attrs.class ? `.${tag.attrs.class.split(/\s+/)[0]}` : ''}{${tag.attrs.style}}`);
}
if (inlineStyleAttrs.length) cssSources.push({ from: 'style="" attributes', css: inlineStyleAttrs.join('\n') });

const googleFontLinks = page.stylesheets.filter((h) => /fonts\.googleapis\.com/.test(h));
const sheetUrls = page.stylesheets.filter((h) => !/fonts\.googleapis\.com|use\.typekit\.net/.test(h));
const ordered = [...sheetUrls.filter((h) => isSameSite(h, pageUrl) || h.startsWith('file:')), ...sheetUrls.filter((h) => !(isSameSite(h, pageUrl) || h.startsWith('file:')))].slice(0, MAX_CSS);
const loadedSheets = [];
for (const href of ordered) {
  if (href.startsWith('file:')) {
    const p = fileURLToPath(href);
    if (existsSync(p)) {
      cssSources.push({ from: href, css: readFileSync(p, 'utf8') });
      loadedSheets.push(href);
    }
    continue;
  }
  const r = await fetchWithRedirects(href, { timeoutMs: 15000, headers: { accept: 'text/css,*/*;q=0.1' } });
  if (r.ok && r.body) {
    cssSources.push({ from: href, css: r.body });
    loadedSheets.push(href);
  }
}
const extraCss = Array.isArray(args.css) ? args.css : args.css ? [args.css] : [];
for (const f of extraCss) if (existsSync(f)) cssSources.push({ from: f, css: readFileSync(f, 'utf8') });

// ---------------------------------------------------------------------------
// Parse CSS
// ---------------------------------------------------------------------------
const GENERIC_FONTS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded', 'inherit', 'initial', 'unset', 'revert', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'roboto', 'helvetica neue', 'arial', 'noto sans', 'helvetica', 'apple color emoji', 'segoe ui emoji', 'segoe ui symbol', 'noto color emoji', 'emoji', 'math', 'fangsong']);
const ACTION_SEL = /(\bbtn\b|\bbutton\b|\bcta\b|primary|accent|brand|\.btn|-btn|button)/i;
const HEADING_SEL = /(^|[\s,>+~])(h[1-6])\b|title|heading|display|hero/i;
const BODY_SEL = /(^|[\s,])(html|body|:root|p)\b/i;

const vars = new Map(); // --name -> raw value
const declarations = []; // { selector, prop, value }
const fontFaces = new Set();
for (const { css } of cssSources) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of text.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const fam = m[1].match(/font-family\s*:\s*([^;]+)/i);
    if (fam) fontFaces.add(fam[1].trim().replace(/^["']|["']$/g, ''));
  }
  for (const m of text.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    if (/^(from|to|\d+%)/.test(selector)) continue; // keyframes
    if (/^(font-face|page|property|counter-style)\b/i.test(selector)) continue; // at-rule bodies, not real rules
    for (const decl of m[2].split(';')) {
      const idx = decl.indexOf(':');
      if (idx === -1) continue;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      const value = decl.slice(idx + 1).replace(/!important/i, '').trim();
      if (!prop || !value) continue;
      if (prop.startsWith('--')) vars.set(prop, value);
      else declarations.push({ selector, prop, value });
    }
  }
}

function resolveVars(value, depth = 0) {
  if (depth > 5) return value;
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_, name, fallback) => {
    const v = vars.get(name);
    return v !== undefined ? resolveVars(v, depth + 1) : (fallback || '');
  });
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------
const colorStats = new Map(); // hex -> stats
function addColor(token, role, weight, varName) {
  const c = parseColor(token);
  if (!c || c.a < 0.9) return;
  const hex = toHex(c);
  if (!colorStats.has(hex)) colorStats.set(hex, { hex, rgb: c, weight: 0, uses: 0, roles: {}, vars: new Set() });
  const s = colorStats.get(hex);
  s.weight += weight;
  s.uses += 1;
  s.roles[role] = (s.roles[role] || 0) + weight;
  if (varName) s.vars.add(varName);
}
function roleFor(prop) {
  if (prop === 'color') return 'text';
  if (prop === 'background' || prop === 'background-color') return 'background';
  if (prop.startsWith('border') || prop === 'outline-color' || prop === 'outline') return 'border';
  if (prop === 'fill' || prop === 'stroke') return 'graphic';
  return null;
}
for (const d of declarations) {
  const role = roleFor(d.prop);
  if (!role) continue;
  const varNames = [...d.value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
  const value = resolveVars(d.value);
  let weight = 1;
  const isAction = ACTION_SEL.test(d.selector);
  if (isAction) weight = 3;
  if (BODY_SEL.test(d.selector) && (role === 'background' || role === 'text')) weight = Math.max(weight, 4);
  for (const token of value.match(COLOR_TOKEN_RE) || []) {
    addColor(token, isAction && role === 'background' ? 'action' : role, weight, varNames[0]);
  }
}
for (const [name, value] of vars) {
  for (const token of resolveVars(value).match(COLOR_TOKEN_RE) || []) addColor(token, 'variable', 0.5, name);
}
if (page.themeColor) addColor(page.themeColor, 'theme-color', 3, 'meta theme-color');

// Merge colours that look the same (CIE76 ΔE < 5)
const merged = [];
for (const s of [...colorStats.values()].sort((a, b) => b.weight - a.weight)) {
  const near = merged.find((m) => deltaE(m.rgb, s.rgb) < 5);
  if (near) {
    near.weight += s.weight;
    near.uses += s.uses;
    for (const [r, w] of Object.entries(s.roles)) near.roles[r] = (near.roles[r] || 0) + w;
    s.vars.forEach((v) => near.vars.add(v));
    near.similar.push(s.hex);
  } else {
    merged.push({ ...s, similar: [] });
  }
}
const totalWeight = merged.reduce((t, c) => t + c.weight, 0) || 1;
const palette = merged.slice(0, 14).map((c) => ({
  hex: c.hex,
  share: `${Math.round((c.weight / totalWeight) * 100)}%`,
  neutral: chroma(c.rgb) < 12,
  mainRole: Object.entries(c.roles).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
  roles: Object.fromEntries(Object.entries(c.roles).map(([k, v]) => [k, Math.round(v * 10) / 10])),
  cssVariables: [...c.vars].slice(0, 5),
  similarShades: c.similar.slice(0, 5),
}));

const byRole = (role, filter = () => true) => merged
  .filter((c) => (c.roles[role] || 0) > 0 && filter(c))
  .sort((a, b) => (b.roles[role] || 0) - (a.roles[role] || 0))[0];

const background = byRole('background', (c) => chroma(c.rgb) < 12) || { hex: '#ffffff', rgb: { r: 255, g: 255, b: 255 } };
const text = merged
  .filter((c) => (c.roles.text || 0) > 0 && contrastRatio(c.rgb, background.rgb) >= 3)
  .sort((a, b) => (b.roles.text || 0) - (a.roles.text || 0))[0] || null;
const brandCandidates = merged
  .filter((c) => chroma(c.rgb) >= 12)
  .map((c) => ({ c, score: (c.roles.action || 0) * 2 + (c.roles['theme-color'] || 0) * 2 + c.weight }))
  .sort((a, b) => b.score - a.score)
  .map((x) => x.c);
const primary = brandCandidates[0] || null;
const secondary = brandCandidates.find((c) => primary && deltaE(c.rgb, primary.rgb) > 15) || null;
const accent = brandCandidates.find((c) => primary && secondary && deltaE(c.rgb, primary.rgb) > 15 && deltaE(c.rgb, secondary.rgb) > 15) || null;

const white = { r: 255, g: 255, b: 255 };
const contrast = [];
const pair = (label, fg, bg) => {
  if (!fg || !bg) return;
  const ratio = contrastRatio(fg.rgb || fg, bg.rgb || bg);
  contrast.push({ pair: label, foreground: fg.hex || toHex(fg), background: bg.hex || toHex(bg), ratio, rating: wcagRating(ratio) });
};
pair('Body text on background', text, background);
if (primary) {
  const onPrimary = contrastRatio(white, primary.rgb) >= contrastRatio({ r: 17, g: 17, b: 17 }, primary.rgb) ? { hex: '#ffffff', rgb: white } : { hex: '#111111', rgb: { r: 17, g: 17, b: 17 } };
  pair('Button text on primary', onPrimary, primary);
  pair('Primary (links) on background', primary, background);
}
if (secondary) pair('Secondary on background', secondary, background);

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------
const fontStats = new Map();
function firstFamily(value) {
  const resolved = resolveVars(value);
  for (const raw of resolved.split(',')) {
    const fam = raw.trim().replace(/^["']|["']$/g, '').trim();
    if (fam && !GENERIC_FONTS.has(fam.toLowerCase()) && !fam.startsWith('var(')) return fam;
  }
  return null;
}
// `font: italic 700 16px/1.5 "Inter", sans-serif` — the families come after the size.
function familiesFromShorthand(value) {
  // The size always has a unit or is a keyword; a bare number like 400 is the weight.
  const m = resolveVars(value).match(/(?:^|\s)(?:\d*\.?\d+(?:px|em|rem|%|pt|vw|vh|ch|ex)|(?:xx?-)?(?:small|large)|medium|smaller|larger)(?:\s*\/\s*[\d.]+[a-z%]*)?\s+([^\s/].*)$/i);
  return m ? m[1] : null;
}
for (const d of declarations) {
  if (d.prop !== 'font-family' && d.prop !== 'font') continue;
  const familyList = d.prop === 'font' ? familiesFromShorthand(d.value) : d.value;
  if (!familyList) continue;
  const fam = firstFamily(familyList);
  if (!fam) continue;
  if (!fontStats.has(fam)) fontStats.set(fam, { family: fam, uses: 0, headings: 0, body: 0 });
  const s = fontStats.get(fam);
  s.uses++;
  if (HEADING_SEL.test(d.selector)) s.headings++;
  if (BODY_SEL.test(d.selector)) s.body++;
}
for (const [name, value] of vars) {
  if (!/font|family|heading|body|display/.test(name)) continue;
  const fam = firstFamily(value);
  if (!fam || /^\d/.test(fam)) continue;
  if (!fontStats.has(fam)) fontStats.set(fam, { family: fam, uses: 0, headings: 0, body: 0 });
  const s = fontStats.get(fam);
  s.uses++;
  if (/head|display|title/.test(name)) s.headings++;
  if (/body|base|text|sans/.test(name)) s.body++;
}
const googleFamilies = new Set();
for (const href of [...googleFontLinks, ...cssSources.flatMap((s) => [...s.css.matchAll(/@import\s+url\(["']?([^"')]+)/g)].map((m) => m[1]))]) {
  if (!/fonts\.googleapis\.com/.test(href)) continue;
  try {
    const u = new URL(href.replace(/&amp;/g, '&'));
    for (const fam of u.searchParams.getAll('family')) {
      for (const part of fam.split('|')) googleFamilies.add(part.split(':')[0].replace(/\+/g, ' ').trim());
    }
  } catch { /* ignore */ }
}
const fonts = [...fontStats.values()].sort((a, b) => b.uses - a.uses).slice(0, 8);
const headingFont = [...fonts].sort((a, b) => b.headings - a.headings)[0];
const bodyFont = [...fonts].sort((a, b) => b.body - a.body)[0];

// ---------------------------------------------------------------------------
// Logo candidates
// ---------------------------------------------------------------------------
const logos = [];
const pushLogo = (url, why) => { if (url && !logos.some((l) => l.url === url)) logos.push({ url, why }); };
for (const tag of openingTags(rawHtml)) {
  if (tag.name !== 'img') continue;
  const hay = `${tag.attrs.src || ''} ${tag.attrs.alt || ''} ${tag.attrs.class || ''} ${tag.attrs.id || ''}`.toLowerCase();
  if (hay.includes('logo')) {
    try { pushLogo(new URL(tag.attrs.src, page.base).href, `img mentioning "logo" (alt: "${tag.attrs.alt || ''}")`); } catch { /* ignore */ }
  }
}
const header = rawHtml.match(/<header\b[\s\S]*?<\/header\s*>/i)?.[0] || '';
const headerImg = header.match(/<img\b([^>]*)>/i);
if (headerImg) {
  const src = (headerImg[1].match(/\ssrc\s*=\s*["']([^"']+)/i) || [])[1];
  if (src) { try { pushLogo(new URL(src, page.base).href, 'first image in <header>'); } catch { /* ignore */ } }
} else if (/<svg\b/i.test(header)) {
  logos.push({ url: null, why: 'inline SVG in <header> — export it from the page or the design files' });
}
for (const block of page.jsonLd.filter((j) => j.valid)) {
  const stack = [block.data];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) { stack.push(...node); continue; }
    if (node.logo) pushLogo(typeof node.logo === 'string' ? node.logo : node.logo.url, 'structured data (Organization logo)');
    if (node['@graph']) stack.push(node['@graph']);
  }
}
pushLogo(page.appleTouchIcon, 'apple-touch-icon (square app icon)');
pushLogo(page.favicon, 'favicon');
pushLogo(page.og.image, 'og:image (social share image — may not be the logo)');

// ---------------------------------------------------------------------------
// Copy samples for tone of voice
// ---------------------------------------------------------------------------
const body = rawHtml.replace(/<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>/gi, ' ');
const ctas = [];
for (const m of body.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)) {
  if (!/(btn|button|cta)/i.test(m[2]) && m[1].toLowerCase() !== 'button') continue;
  const t = cleanText(m[3]);
  if (t && t.length <= 40 && !ctas.includes(t)) ctas.push(t);
  if (ctas.length >= 10) break;
}
const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)].map((m) => cleanText(m[1])).filter((t) => t.length > 40).slice(0, 4);

const result = {
  tool: 'power-up-kit/extract-brand',
  version: VERSION,
  source: isUrl ? pageUrl : target,
  extractedAt: new Date().toISOString(),
  note: 'Roles are GUESSES from how often and where each colour/font is used. Confirm with the client or their brand guide before treating them as rules.',
  site: {
    name: page.og.site_name || null,
    title: page.title,
    description: page.metaDescription,
    themeColor: page.themeColor,
  },
  suggested: {
    background: background?.hex || null,
    text: text?.hex || null,
    primary: primary?.hex || null,
    secondary: secondary?.hex || null,
    accent: accent?.hex || null,
    headingFont: headingFont?.headings ? headingFont.family : fonts[0]?.family || null,
    bodyFont: bodyFont?.body ? bodyFont.family : fonts[0]?.family || null,
  },
  palette,
  contrast,
  fonts,
  fontSources: {
    googleFonts: [...googleFamilies],
    fontFace: [...fontFaces],
    adobeFonts: page.stylesheets.some((h) => /use\.typekit\.net/.test(h)),
  },
  logoCandidates: logos.slice(0, 8),
  copy: {
    h1: page.h1.slice(0, 3),
    headings: page.headings.filter((h) => h.level === 2).map((h) => h.text).slice(0, 8),
    callsToAction: ctas,
    paragraphs,
  },
  cssRead: { stylesheets: loadedSheets, inlineBlocks: cssSources.filter((s) => s.from.startsWith('inline')).length, cssVariables: vars.size },
};

if (args.out) {
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`);
}
printJson(result);
