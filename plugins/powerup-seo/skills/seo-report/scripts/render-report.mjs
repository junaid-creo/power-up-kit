#!/usr/bin/env node
// Power-Up Kit — seo-report: turn the SEO report written in Markdown into a branded,
// printable HTML page. Open it in a browser and use Print → Save as PDF to send it.
//
// Usage:
//   node render-report.mjs <report.md> [--out report.html]
//        [--agency "Studio Name"] [--primary "#C2410C"] [--logo https://…/logo.svg] [--font "Inter"]
//
// Supports the Markdown the report template uses: headings, paragraphs, bold, italic,
// links, code, bullet and numbered lists, tables, quotes and horizontal rules.
// Change cells are coloured: "▲ 12%" green, "▼ 5%" red. For metrics where lower is
// better (average position), write "▲ 2.1 (better)" or "▼ 0.4 (worse)" — the words in
// brackets decide the colour, so it never has to guess. Leftover {{placeholders}} are
// highlighted in yellow and listed in the output.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fail, parseArgs, printJson } from './powerup-lib.mjs';

const USAGE = 'Usage: node render-report.mjs <report.md> [--out report.html] [--agency NAME] [--primary #hex] [--logo URL] [--font NAME]';
const args = parseArgs(process.argv.slice(2));
const opt = (k) => (typeof args[k] === 'string' ? args[k] : '');
const input = args._[0];
if (!input) fail(USAGE);
if (!existsSync(input)) fail(`Report file not found: ${input}\n${USAGE}`);
const md = readFileSync(input, 'utf8').replace(/^﻿/, '');
if (!md.trim()) fail(`${input} is empty.`);

const primary = /^#[0-9a-f]{3,8}$/i.test(opt('primary')) ? opt('primary') : '#1f4fd1';
const agency = opt('agency');
const logo = opt('logo');
const font = opt('font').replace(/[^\w \-]/g, '').trim();

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const counts = { good: 0, bad: 0, flat: 0, notConnected: 0 };
const DELTA_RE = /([▲▼])\s?([+\-−]?(?:new\b|\d+(?:[.,]\d+)*(?:\s?(?:%|pts?\b|points?\b|places?\b|positions?\b))?))(\s?\((?:better|worse)\))?/g;

function inline(text) {
  let s = esc(text);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\{\{[^}]*\}\}/g, '<mark>$&</mark>');
  s = s.replace(DELTA_RE, (m, arrow, _value, verdict) => {
    let cls;
    if (verdict) cls = /better/.test(verdict) ? 'good' : 'bad';
    else cls = arrow === '▲' ? 'good' : 'bad';
    counts[cls]++;
    return `<span class="delta ${cls}">${m}</span>`;
  });
  s = s.replace(/\bno change\b/gi, (m) => { counts.flat++; return `<span class="delta flat">${m}</span>`; });
  s = s.replace(/\b(Not connected|Not checked)\b/g, (m) => { counts.notConnected++; return `<span class="na">${m}</span>`; });
  return s;
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function render(markdown) {
  const lines = markdown.split(/\r?\n/);
  const out = [];
  let i = 0;
  let title = '';
  const BLOCK_START = /^(#{1,4}\s|\s*\||\s*([-*]|\d+\.)\s+|\s*(---|\*\*\*)\s*$|\s*>)/;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      if (level === 1 && !title) title = h[2].trim();
      out.push(`<h${level}>${inline(h[2].trim())}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const cells = splitRow(lines[i]);
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(`<div class="table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, '').trim());
        i++;
      }
      out.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return { html: out.join('\n'), title };
}

const { html, title } = render(md);
const leftoverPlaceholders = [];
md.split(/\r?\n/).forEach((line, idx) => {
  for (const m of line.matchAll(/\{\{[^}]*\}\}/g)) leftoverPlaceholders.push({ line: idx + 1, text: m[0] });
});

const fontLink = font ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, '+')}:wght@400;600;700&display=swap">` : '';
const brandbar = agency || logo
  ? `<div class="brandbar">${logo ? `<img src="${esc(logo)}" alt="${esc(agency || 'Agency')} logo">` : `<span>${esc(agency)}</span>`}<span>${logo && agency ? esc(agency) : 'SEO report'}</span></div>`
  : '';
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title || 'SEO report')}</title>
${fontLink}
<style>
  :root { --brand: ${primary}; --ink: #17191e; --muted: #5d6472; --line: #e4e6eb; --good: #15803d; --good-bg: #e7f6ec; --bad: #b91c1c; --bad-bg: #fdecec; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f3f4f6; color: var(--ink); font: 16px/1.6 ${font ? `'${font}', ` : ''}system-ui, -apple-system, 'Segoe UI', sans-serif; }
  main { max-width: 860px; margin: 32px auto; background: #fff; padding: 56px 64px; border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .brandbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-bottom: 4px solid var(--brand); padding-bottom: 18px; margin-bottom: 28px; }
  .brandbar img { max-height: 48px; max-width: 200px; }
  .brandbar span { font-weight: 700; color: var(--brand); letter-spacing: .02em; }
  h1 { font-size: 34px; line-height: 1.15; margin: 0 0 10px; }
  h2 { font-size: 21px; margin: 40px 0 10px; padding-top: 6px; color: var(--brand); }
  h3 { font-size: 17px; margin: 26px 0 8px; }
  p, li { color: #2b2f37; }
  .table { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 18px; font-size: 15px; font-variant-numeric: tabular-nums; }
  th { text-align: left; background: #f6f7f9; color: var(--muted); font-weight: 600; }
  th, td { padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .delta { font-weight: 600; white-space: nowrap; padding: 1px 6px; border-radius: 6px; }
  .delta.good { color: var(--good); background: var(--good-bg); }
  .delta.bad { color: var(--bad); background: var(--bad-bg); }
  .delta.flat { color: var(--muted); }
  .na { color: var(--muted); font-style: italic; }
  blockquote { margin: 16px 0; padding: 10px 16px; border-left: 4px solid var(--brand); background: #f6f7f9; color: #2b2f37; }
  mark { background: #fff1c2; padding: 0 4px; border-radius: 4px; }
  code { font-size: 14px; background: #f3f4f6; padding: 1px 5px; border-radius: 4px; }
  a { color: var(--brand); }
  hr { border: 0; border-top: 1px solid var(--line); margin: 32px 0; }
  @media (max-width: 640px) { main { padding: 28px 20px; margin: 0; border-radius: 0; } h1 { font-size: 28px; } }
  @media print {
    @page { margin: 16mm; }
    body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    main { box-shadow: none; margin: 0; max-width: none; padding: 0; border-radius: 0; }
    h2, h3 { break-after: avoid; }
    table, tr, blockquote { break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
  }
</style>
</head>
<body>
<main>
${brandbar}
${html}
</main>
</body>
</html>
`;
const out = opt('out') || `${input.replace(/\.(md|markdown)$/i, '')}.html`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
printJson({
  written: out,
  title,
  deltas: { good: counts.good, bad: counts.bad, noChange: counts.flat },
  notConnectedOrChecked: counts.notConnected,
  leftoverPlaceholders,
});
