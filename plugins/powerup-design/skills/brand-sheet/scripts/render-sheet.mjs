#!/usr/bin/env node
// Power-Up Kit — render a printable one-page brand sheet (HTML) from a small JSON file.
//
// Usage: node render-sheet.mjs <brand.json> [--out brand-sheet.html]
//
// brand.json shape (only "name" and "colors" are required):
// {
//   "name": "Acme Bakery",
//   "source": "https://acme.example + client brand guide",
//   "date": "2026-11-20",
//   "colors": [ { "role": "Primary", "hex": "#C2410C", "use": "Buttons, links", "confirmed": false } ],
//   "fonts": { "headings": "Playfair Display", "body": "Inter", "notes": "Google Fonts" },
//   "logo": { "url": "https://…/logo.svg", "notes": "Min width 120 px" },
//   "voice": { "words": ["warm", "local", "honest"], "do": ["…"], "dont": ["…"] },
//   "notes": ["…"]
// }
//
// The page uses Google Fonts for the font preview when the families exist there.
// Contrast ratios are calculated here, so they are always correct for the hex values given.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { contrastRatio, parseArgs, parseColor, wcagRating, fail } from './powerup-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const input = args._[0];
if (!input) fail('Usage: node render-sheet.mjs <brand.json> [--out brand-sheet.html]');
let brand;
try {
  brand = JSON.parse(readFileSync(input, 'utf8'));
} catch (err) {
  fail(`Could not read ${input}: ${err.message}`);
}
if (!brand.name || !Array.isArray(brand.colors) || !brand.colors.length) fail('brand.json needs "name" and a non-empty "colors" list');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const colors = brand.colors.map((c) => ({ ...c, rgb: parseColor(c.hex) })).filter((c) => c.rgb);
if (!colors.length) fail('None of the colours are valid hex/rgb values');

const WHITE = parseColor('#ffffff');
const BLACK = parseColor('#111111');
const textOn = (rgb) => (contrastRatio(WHITE, rgb) >= contrastRatio(BLACK, rgb) ? '#ffffff' : '#111111');

// Contrast matrix: every colour as text on every light/neutral colour used as background.
const findRole = (re) => colors.find((c) => re.test(c.role || ''));
const bg = findRole(/background|surface|base/i) || { hex: '#ffffff', rgb: WHITE };
const pairs = [];
for (const fg of colors) {
  if (fg === bg) continue;
  const ratio = contrastRatio(fg.rgb, bg.rgb);
  pairs.push({ fg: fg.hex, bg: bg.hex, label: `${fg.role || fg.hex} on ${bg.role || 'background'}`, ratio, rating: wcagRating(ratio) });
}
for (const c of colors.filter((c) => /primary|secondary|accent|button/i.test(c.role || ''))) {
  const t = textOn(c.rgb);
  const ratio = contrastRatio(parseColor(t), c.rgb);
  pairs.push({ fg: t, bg: c.hex, label: `${t === '#ffffff' ? 'White' : 'Dark'} text on ${c.role}`, ratio, rating: wcagRating(ratio) });
}

const families = [brand.fonts?.headings, brand.fonts?.body].filter(Boolean);
const gf = families.length
  ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;700`).join('&')}&display=swap">`
  : '';
const headingFont = brand.fonts?.headings ? `'${esc(brand.fonts.headings)}', ` : '';
const bodyFont = brand.fonts?.body ? `'${esc(brand.fonts.body)}', ` : '';
const list = (items) => (items || []).map((i) => `<li>${esc(i)}</li>`).join('');

const htmlOut = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(brand.name)} — brand sheet</title>
${gf}
<style>
  :root { --ink: #16181d; --muted: #5b6270; --line: #e3e5ea; --paper: #ffffff; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f5f7; color: var(--ink); font: 15px/1.5 ${bodyFont}system-ui, -apple-system, 'Segoe UI', sans-serif; }
  main { max-width: 960px; margin: 32px auto; background: var(--paper); padding: 48px; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  header { display: flex; justify-content: space-between; align-items: center; gap: 24px; border-bottom: 1px solid var(--line); padding-bottom: 24px; }
  h1 { font: 700 34px/1.15 ${headingFont}Georgia, serif; margin: 0; }
  h2 { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 36px 0 14px; }
  .meta { color: var(--muted); font-size: 13px; margin-top: 6px; }
  .logo { max-height: 72px; max-width: 220px; object-fit: contain; }
  .swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
  .swatch { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  .chip { height: 92px; display: flex; align-items: flex-end; padding: 10px; font-weight: 600; font-size: 13px; }
  .info { padding: 10px 12px; font-size: 13px; }
  .info b { display: block; font-size: 14px; }
  .tag { display: inline-block; font-size: 11px; padding: 1px 7px; border-radius: 99px; background: #fff4e5; color: #8a4b00; margin-top: 4px; }
  .tag.ok { background: #e7f6ec; color: #136c34; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td, th { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  .sample { padding: 4px 10px; border-radius: 6px; font-weight: 600; }
  .fail { color: #b42318; font-weight: 600; }
  .type-h { font: 700 40px/1.1 ${headingFont}Georgia, serif; margin: 0 0 8px; }
  .type-b { font: 16px/1.6 ${bodyFont}system-ui, sans-serif; color: var(--muted); max-width: 60ch; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  ul { padding-left: 18px; margin: 6px 0; }
  .words span { display: inline-block; border: 1px solid var(--line); border-radius: 99px; padding: 3px 12px; margin: 0 6px 6px 0; }
  footer { margin-top: 40px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--line); padding-top: 14px; }
  @media (max-width: 640px) { main { padding: 24px; margin: 0; border-radius: 0; } .cols { grid-template-columns: 1fr; } header { flex-direction: column; align-items: flex-start; } }
  @media print { body { background: #fff; } main { box-shadow: none; margin: 0; max-width: none; } }
</style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>${esc(brand.name)}</h1>
      <div class="meta">Brand sheet · ${esc(brand.date || new Date().toISOString().slice(0, 10))}${brand.source ? ` · Source: ${esc(brand.source)}` : ''}</div>
    </div>
    ${brand.logo?.url ? `<img class="logo" src="${esc(brand.logo.url)}" alt="${esc(brand.name)} logo">` : ''}
  </header>

  <h2>Colours</h2>
  <div class="swatches">
    ${colors.map((c) => `<div class="swatch"><div class="chip" style="background:${esc(c.hex)};color:${textOn(c.rgb)}">${esc(c.hex.toUpperCase())}</div><div class="info"><b>${esc(c.role || 'Colour')}</b>${esc(c.use || '')}<br><span class="tag${c.confirmed ? ' ok' : ''}">${c.confirmed ? 'Confirmed' : 'Not confirmed'}</span></div></div>`).join('\n    ')}
  </div>

  <h2>Contrast (WCAG 2)</h2>
  <table>
    <tr><th>Pair</th><th>Sample</th><th>Ratio</th><th>Rating</th></tr>
    ${pairs.map((p) => `<tr><td>${esc(p.label)}</td><td><span class="sample" style="color:${esc(p.fg)};background:${esc(p.bg)}">Aa Sample</span></td><td>${p.ratio}:1</td><td class="${p.rating === 'fail' ? 'fail' : ''}">${esc(p.rating)}</td></tr>`).join('\n    ')}
  </table>

  <h2>Typography</h2>
  <p class="type-h">${esc(brand.fonts?.headings || 'Heading font not set')}</p>
  <p class="type-b">${esc(brand.fonts?.body || 'Body font not set')} — The quick brown fox jumps over the lazy dog. 0123456789</p>
  ${brand.fonts?.notes ? `<p class="meta">${esc(brand.fonts.notes)}</p>` : ''}

  ${brand.logo ? `<h2>Logo</h2><p>${esc(brand.logo.notes || '')}</p>` : ''}

  ${brand.voice ? `<h2>Tone of voice</h2>
  <div class="words">${(brand.voice.words || []).map((w) => `<span>${esc(w)}</span>`).join('')}</div>
  <div class="cols"><div><b>Do</b><ul>${list(brand.voice.do)}</ul></div><div><b>Don't</b><ul>${list(brand.voice.dont)}</ul></div></div>` : ''}

  ${brand.notes?.length ? `<h2>Notes</h2><ul>${list(brand.notes)}</ul>` : ''}

  <footer>Made with Power-Up Kit. Colours marked "Not confirmed" were read from the website and need the client's OK.</footer>
</main>
</body>
</html>
`;

const out = args.out || 'brand-sheet.html';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, htmlOut);
process.stdout.write(`${JSON.stringify({ written: out, colors: colors.length, contrastPairs: pairs.length, failingPairs: pairs.filter((p) => p.rating === 'fail').map((p) => p.label) })}\n`);
