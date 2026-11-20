#!/usr/bin/env node
// Power-Up Kit — check a proposal before it goes to a client.
//
// Finds: leftover template placeholders, [PRICE]/[DATE] gaps, pricing tables whose
// lines don't add up to the stated total, mixed currencies, quotes that have already
// expired, and very long paragraphs. Prints JSON. Exit code 1 if anything must be fixed.
//
// Usage: node check-proposal.mjs <proposal.md> [--today 2026-11-20]

import { readFileSync, existsSync } from 'node:fs';

const file = process.argv[2];
if (!file || !existsSync(file)) {
  process.stderr.write('Usage: node check-proposal.mjs <proposal.md> [--today YYYY-MM-DD]\n');
  process.exit(2);
}
const todayIdx = process.argv.indexOf('--today');
const today = todayIdx !== -1 ? new Date(process.argv[todayIdx + 1]) : new Date();
const text = readFileSync(file, 'utf8');
const lines = text.split(/\r?\n/);

const mustFix = [];
const toFill = [];
const warnings = [];

// 1. Template leftovers
lines.forEach((line, i) => {
  for (const m of line.matchAll(/\{\{[^}]+\}\}|<(?:client|agency|date|price|name|…|\.\.\.)[^>]*>|_Unknown_|\bTODO\b|\bTBD\b|lorem ipsum/gi)) {
    mustFix.push({ line: i + 1, problem: `Template text left in: "${m[0]}"` });
  }
  for (const m of line.matchAll(/\[(PRICE|DATE|AMOUNT|CLIENT|NAME|RATE)[^\]]*\]/g)) {
    toFill.push({ line: i + 1, placeholder: m[0] });
  }
});

// 2. Money tables
const MONEY = /(?:(AED|USD|EUR|GBP|SAR|QAR|KWD|OMR|BHD|INR|PKR|CAD|AUD|NZD|SGD|CHF|\$|€|£|₹|د\.إ)\s?([\d][\d,]*(?:\.\d+)?)|([\d][\d,]*(?:\.\d+)?)\s?(AED|USD|EUR|GBP|SAR|QAR|KWD|OMR|BHD|INR|PKR|CAD|AUD|NZD|SGD|CHF))/i;
const currencies = new Set();
function money(cell) {
  const m = cell.replace(/\*\*/g, '').match(MONEY);
  if (!m) return null;
  const cur = (m[1] || m[4] || '').toUpperCase();
  const num = Number((m[2] || m[3]).replace(/,/g, ''));
  return Number.isFinite(num) ? { cur, num } : null;
}

const tables = [];
let current = null;
lines.forEach((line, i) => {
  if (/^\s*\|.*\|\s*$/.test(line)) {
    const cells = line.trim().slice(1, -1).split('|').map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return; // separator row
    if (!current) {
      current = { startLine: i + 1, header: cells, rows: [] };
      tables.push(current);
    } else {
      current.rows.push({ line: i + 1, cells });
    }
  } else {
    current = null;
  }
});

const tableResults = [];
for (const t of tables) {
  const priceCol = t.header.findIndex((h) => /price|cost|amount|investment|fee|total/i.test(h));
  if (priceCol === -1) continue;
  let sum = 0;
  let stated = null;
  let statedLine = null;
  let items = 0;
  let placeholders = 0;
  for (const row of t.rows) {
    const cell = row.cells[priceCol] || '';
    const isTotal = /total/i.test(row.cells[0] || '') || /total/i.test(cell);
    if (/\[PRICE|\[AMOUNT|\[RATE/i.test(cell)) { placeholders++; continue; }
    if (/included|free|n\/a|—|^-$/i.test(cell) && !money(cell)) continue;
    const v = money(cell);
    if (!v) continue;
    if (v.cur) currencies.add(v.cur.replace('$', 'USD').replace('€', 'EUR').replace('£', 'GBP').replace('₹', 'INR').replace('د.إ', 'AED'));
    if (isTotal) { stated = v.num; statedLine = row.line; } else { sum += v.num; items++; }
  }
  const result = { table: t.header.join(' | '), line: t.startLine, items, sum, stated, placeholders };
  if (stated !== null && placeholders === 0 && Math.abs(sum - stated) > 0.5) {
    mustFix.push({ line: statedLine, problem: `Total says ${stated.toLocaleString('en')} but the lines add up to ${sum.toLocaleString('en')}` });
    result.ok = false;
  } else {
    result.ok = true;
  }
  tableResults.push(result);
}
if (currencies.size > 1) warnings.push({ problem: `More than one currency used: ${[...currencies].join(', ')}` });

// 3. Validity date
const valid = text.match(/valid (?:until|till|through)\s*:?\s*\**\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]+\s+\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
if (valid) {
  const d = new Date(valid[1]);
  if (!Number.isNaN(d.getTime()) && d < new Date(today.toDateString())) mustFix.push({ problem: `Quote validity date ${valid[1]} is in the past` });
} else {
  warnings.push({ problem: 'No "Valid until" date found — add one so the price can\'t be held forever' });
}

// 4. Readability
lines.forEach((line, i) => {
  const words = line.trim().split(/\s+/).length;
  if (!line.trim().startsWith('|') && words > 90) warnings.push({ line: i + 1, problem: `Very long paragraph (${words} words) — clients skim; split it` });
});

const out = {
  tool: 'power-up-kit/check-proposal',
  file,
  verdict: mustFix.length ? 'fix before sending' : toFill.length ? 'fill the placeholders before sending' : 'ready to review',
  mustFix,
  toFill,
  warnings,
  pricingTables: tableResults,
};
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
process.exitCode = mustFix.length ? 1 : 0;
