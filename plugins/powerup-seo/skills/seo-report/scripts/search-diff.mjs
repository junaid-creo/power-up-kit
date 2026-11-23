#!/usr/bin/env node
// Power-Up Kit — seo-report: compare two periods of Google Search Console data
//
// Inputs (any mix):
//   • Search Console CSV exports (Performance → Export → Download CSV): Queries.csv,
//     Pages.csv or the daily file (usually Dates.csv). Headers like "Top queries"/"Query",
//     "Top pages"/"Page", "Date", "Clicks", "Impressions", "CTR" ("3.2%"), "Position".
//     Handles a byte-order mark, quoted fields, "1,234" numbers and ";" or tab separators.
//     A compare-mode export (two periods side by side) can be passed alone as --current.
//   • JSON saved from a Search Console connector: API rows {keys:[…], clicks, impressions,
//     ctr, position} (optionally wrapped in {startDate, endDate, dimensions, rows}) or flat
//     objects like {query, clicks, impressions, ctr, position}.
//
// Computes totals (clicks and impressions summed; CTR = clicks ÷ impressions; position =
// impression-weighted average of the rows), % changes, top gainers and losers by clicks,
// new and lost queries/pages, and "striking distance" items (position 8–20 with enough
// impressions). Warns when the periods differ in length or the data may be incomplete.
//
// Usage:
//   node search-diff.mjs --current <file> --previous <file> [--by query|page] [--top 10]
//        [--last-year <file>] [--min-impressions 50] [--out file.json]
//        [--current-range 2026-10-01..2026-10-31] [--previous-range 2026-09-01..2026-09-30]
//        [--today YYYY-MM-DD]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { fail, isoDate, parseArgs, toInt } from './powerup-lib.mjs';

const USAGE = 'Usage: node search-diff.mjs --current <file> --previous <file> [--by query|page] [--top 10] [--last-year <file>] [--min-impressions 50] [--out file.json] [--current-range YYYY-MM-DD..YYYY-MM-DD] [--previous-range YYYY-MM-DD..YYYY-MM-DD]';
const args = parseArgs(process.argv.slice(2));
const opt = (k) => (typeof args[k] === 'string' ? args[k] : null);
if (!opt('current')) fail(USAGE);
const by = opt('by');
if (by && !['query', 'page'].includes(by)) fail('--by must be "query" or "page"');
const TOP = Math.min(toInt(args.top, 10), 100);
const MIN_IMPRESSIONS = args['min-impressions'] === undefined ? 50 : Math.max(0, Number(args['min-impressions']) || 0);
const STRIKING = { min: 8, max: 20 };
const EXPORT_ROW_CAP = 1000;
const warnings = [];

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------
const ALIASES = {
  query: ['top queries', 'top query', 'query', 'queries', 'search query', 'search queries', 'keyword', 'keywords'],
  page: ['top pages', 'top page', 'page', 'pages', 'url', 'landing page', 'address'],
  date: ['date', 'day'],
  clicks: ['clicks', 'url clicks'],
  impressions: ['impressions'],
  ctr: ['ctr', 'url ctr', 'click-through rate', 'click through rate'],
  position: ['position', 'average position', 'avg. position', 'avg position'],
};
const METRICS = ['clicks', 'impressions', 'ctr', 'position'];
const normHeader = (h) => String(h).replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, ' ');
const fieldFor = (h) => Object.keys(ALIASES).find((f) => ALIASES[f].includes(normHeader(h))) || null;

function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/** Parse "1,234", "1.234", "3.2%", "3,2", "~" (Search Console writes ~ or - for "not available" = 0). */
function parseNumber(raw, { integer = false } = {}) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  let s = String(raw).trim().replace(/[\s  ']/g, '').replace(/%$/, '');
  if (s === '' || s === '~' || s === '-' || s === '—' || s === '–') return 0;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    s = s.lastIndexOf('.') > s.lastIndexOf(',') ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    s = integer || /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (hasDot && integer && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function metricValue(raw, metric, file, line) {
  const n = parseNumber(raw, { integer: metric === 'clicks' || metric === 'impressions' });
  if (Number.isNaN(n)) fail(`${file}${line ? ` line ${line}` : ''}: "${raw}" is not a number in the ${metric} column.`);
  return n;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function loadCsv(file, text, role) {
  const table = parseCsv(text);
  if (table.length < 1) fail(`${file} is empty.`);
  const header = table[0];
  // Compare-mode export: "<period label> Clicks", "<other period label> Clicks", …
  const groups = new Map();
  header.forEach((h, idx) => {
    const n = normHeader(h);
    for (const m of METRICS) {
      const alias = ALIASES[m].find((a) => n.endsWith(` ${a}`));
      if (alias && !fieldFor(h)) {
        const prefix = n.slice(0, -alias.length - 1).trim();
        if (!groups.has(prefix)) groups.set(prefix, {});
        groups.get(prefix)[m] = idx;
      }
    }
  });
  const dimCols = {};
  const metricCols = {};
  header.forEach((h, idx) => {
    const f = fieldFor(h);
    if (!f) return;
    if (METRICS.includes(f)) { if (metricCols[f] === undefined) metricCols[f] = idx; } else if (dimCols[f] === undefined) dimCols[f] = idx;
  });
  const compareGroups = [...groups.entries()].filter(([, g]) => g.clicks !== undefined);
  let periods;
  if (metricCols.clicks === undefined && compareGroups.length >= 2) {
    if (role !== 'current' || opt('previous')) {
      fail(`${file} has two periods side by side (Search Console compare mode). Pass it alone as --current (without --previous), or export each period on its own.`);
    }
    const isPrev = ([prefix]) => /previous|prior|earlier|before|last year|year ago/.test(prefix);
    const prevGroups = compareGroups.filter(isPrev);
    const curGroups = compareGroups.filter((g) => !isPrev(g));
    if (compareGroups.length !== 2 || prevGroups.length !== 1 || curGroups.length !== 1) {
      fail(`${file} has compare-mode columns (${compareGroups.map(([p]) => `"${p}"`).join(', ')}) but it is not clear which period is the earlier one. Export each period on its own and pass them as --current and --previous.`);
    }
    periods = [
      { label: curGroups[0][0], cols: curGroups[0][1] },
      { label: prevGroups[0][0], cols: prevGroups[0][1] },
    ];
  } else {
    if (metricCols.clicks === undefined || metricCols.impressions === undefined) {
      fail(`${file} needs "Clicks" and "Impressions" columns (found: ${header.map((h) => `"${h.replace(/^﻿/, '')}"`).join(', ')}). Use a Search Console Performance export (Queries.csv, Pages.csv or Dates.csv).`);
    }
    periods = [{ label: null, cols: metricCols }];
  }
  const sets = periods.map(({ label, cols }) => {
    const rows = [];
    for (let i = 1; i < table.length; i++) {
      const r = table[i];
      const line = i + 1;
      const row = {
        clicks: metricValue(r[cols.clicks], 'clicks', file, line) ?? 0,
        impressions: metricValue(r[cols.impressions], 'impressions', file, line) ?? 0,
        position: cols.position === undefined ? null : metricValue(r[cols.position], 'position', file, line),
      };
      if (dimCols.query !== undefined) row.query = (r[dimCols.query] ?? '').trim();
      if (dimCols.page !== undefined) row.page = (r[dimCols.page] ?? '').trim();
      if (dimCols.date !== undefined) {
        const d = (r[dimCols.date] ?? '').trim();
        if (DATE_RE.test(d)) row.date = d;
      }
      rows.push(row);
    }
    return { file, label, rows, range: null, format: 'csv' };
  });
  return sets;
}

function inferKeyField(key) {
  if (DATE_RE.test(key)) return 'date';
  if (/^https?:\/\//i.test(key)) return 'page';
  return 'query';
}

function loadJson(file, text) {
  let data;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    fail(`${file} is not valid JSON: ${e.message}`);
  }
  let rows = data;
  let dims = null;
  let range = null;
  if (data && !Array.isArray(data) && typeof data === 'object') {
    rows = data.rows ?? data.data ?? data.results ?? data.items;
    const d = data.dimensions ?? data.request?.dimensions;
    if (Array.isArray(d)) dims = d.map((x) => String(x).toLowerCase());
    const start = data.startDate ?? data.start_date ?? data.request?.startDate ?? data.dateRange?.startDate ?? data.dateRange?.start;
    const end = data.endDate ?? data.end_date ?? data.request?.endDate ?? data.dateRange?.endDate ?? data.dateRange?.end;
    if (start && end) range = makeRange(String(start), String(end), file);
  }
  if (!Array.isArray(rows)) fail(`${file} has no rows. Save the connector's result as JSON with a "rows" list, e.g. {"startDate":"2026-10-01","endDate":"2026-10-31","rows":[{"keys":["cakes dubai"],"clicks":12,"impressions":340,"ctr":0.035,"position":7.2}]}.`);
  let multiKeyWarned = false;
  const out = rows.map((raw, idx) => {
    if (!raw || typeof raw !== 'object') fail(`${file} row ${idx + 1} is not an object.`);
    const lower = {};
    for (const [k, v] of Object.entries(raw)) {
      const f = fieldFor(k) || k.toLowerCase();
      if (lower[f] === undefined) lower[f] = v;
    }
    if (lower.clicks === undefined || lower.impressions === undefined) {
      fail(`${file} row ${idx + 1} has no clicks or impressions.`);
    }
    const row = {
      clicks: metricValue(lower.clicks, 'clicks', file) ?? 0,
      impressions: metricValue(lower.impressions, 'impressions', file) ?? 0,
      position: lower.position === undefined || lower.position === null ? null : metricValue(lower.position, 'position', file),
    };
    if (Array.isArray(raw.keys)) {
      if (!dims && raw.keys.length > 1 && !multiKeyWarned) {
        warnings.push(`${basename(file)}: rows have ${raw.keys.length} keys but no "dimensions" list — guessed which key is the date, page and query. Save the request's dimensions with the rows to be sure.`);
        multiKeyWarned = true;
      }
      raw.keys.forEach((k, i) => {
        const f = dims ? dims[i] : inferKeyField(String(k));
        if (['query', 'page', 'date'].includes(f) && row[f] === undefined) row[f] = String(k).trim();
      });
    }
    for (const f of ['query', 'page', 'date']) {
      if (row[f] === undefined && typeof lower[f] === 'string') row[f] = lower[f].trim();
    }
    if (row.date !== undefined && !DATE_RE.test(row.date)) delete row.date;
    return row;
  });
  return [{ file, label: null, rows: out, range, format: 'json' }];
}

function loadFile(file, role) {
  if (!existsSync(file)) fail(`The ${role} file was not found: ${file}`);
  const text = readFileSync(file, 'utf8');
  if (!text.trim()) fail(`${file} is empty.`);
  const looksJson = /\.json$/i.test(file) || /^\s*[[{]/.test(text.replace(/^﻿/, ''));
  return looksJson ? loadJson(file, text) : loadCsv(file, text, role);
}

// ---------------------------------------------------------------------------
// Date ranges
// ---------------------------------------------------------------------------
const DAY = 86400000;
function makeRange(start, end, where) {
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
    fail(`${where}: dates must look like 2026-10-01 (got "${start}" and "${end}").`);
  }
  const days = Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1;
  if (days < 1) fail(`${where}: the start date ${start} is after the end date ${end}.`);
  return { start, end, days };
}
function parseRangeFlag(name) {
  const v = opt(name);
  if (!v) return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})\s*(?:\.\.|:|\/|_| to )\s*(\d{4}-\d{2}-\d{2})$/);
  if (!m) fail(`--${name} must look like 2026-10-01..2026-10-31`);
  return makeRange(m[1], m[2], `--${name}`);
}
function rangeFromRows(rows) {
  const dates = [...new Set(rows.map((r) => r.date).filter(Boolean))].sort();
  if (!dates.length) return null;
  const range = makeRange(dates[0], dates[dates.length - 1], 'dates in file');
  return { ...range, daysWithData: dates.length };
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------
const curSets = loadFile(opt('current'), 'current');
let current = curSets[0];
let previous;
if (curSets.length === 2) {
  previous = curSets[1];
  warnings.push(`${basename(current.file)} is a compare-mode export: used the "${current.label}" columns as this period and "${previous.label}" as the previous one. Check that is right.`);
} else {
  if (!opt('previous')) fail(`${USAGE}\n--previous is required (unless --current is a Search Console compare-mode export).`);
  previous = loadFile(opt('previous'), 'previous')[0];
}
const lastYear = opt('last-year') ? loadFile(opt('last-year'), 'last-year')[0] : null;

current = { ...current, range: parseRangeFlag('current-range') || current.range || rangeFromRows(current.rows) };
previous = { ...previous, range: parseRangeFlag('previous-range') || previous.range || rangeFromRows(previous.rows) };
const lastYearSet = lastYear ? { ...lastYear, range: parseRangeFlag('last-year-range') || lastYear.range || rangeFromRows(lastYear.rows) } : null;

function kindOf(set) {
  const rows = set.rows;
  if (by) {
    if (!rows.some((r) => r[by])) {
      fail(`--by ${by}, but ${set.file} has no ${by === 'query' ? 'query ("Top queries"/"Query")' : 'page ("Top pages"/"Page")'} column or key.`);
    }
    return by;
  }
  if (rows.some((r) => r.query)) return 'query';
  if (rows.some((r) => r.page)) return 'page';
  if (rows.some((r) => r.date)) return 'date';
  return 'total';
}
const kind = kindOf(current);
const prevKind = kindOf(previous);
if (kind !== prevKind) {
  fail(`Compare like with like: ${current.file} is a ${kind} export but ${previous.file} is a ${prevKind} export. Use the same kind of export for both periods.`);
}
if (lastYearSet && kindOf(lastYearSet) !== kind) {
  warnings.push(`The last-year file is a ${kindOf(lastYearSet)} export but the others are ${kind} exports — its totals are not directly comparable.`);
}

// ---------------------------------------------------------------------------
// Maths
// ---------------------------------------------------------------------------
function round(n, d = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const f = 10 ** d;
  const v = Math.round(n * f) / f;
  return Object.is(v, -0) ? 0 : v;
}

function aggregate(rows) {
  let clicks = 0;
  let impressions = 0;
  let posWeight = 0;
  let posImpr = 0;
  for (const r of rows) {
    clicks += r.clicks;
    impressions += r.impressions;
    if (r.position !== null && r.position > 0 && r.impressions > 0) {
      posWeight += r.position * r.impressions;
      posImpr += r.impressions;
    }
  }
  return {
    clicks,
    impressions,
    ctr: impressions ? round((clicks / impressions) * 100, 2) : null,
    position: posImpr ? round(posWeight / posImpr, 2) : null,
  };
}

function pctChange(cur, prev) {
  if (cur === null || prev === null) return null;
  if (prev === 0) return cur === 0 ? 0 : null;
  return round(((cur - prev) / prev) * 100, 1);
}
function pctLabel(cur, prev) {
  if (cur === null || prev === null) return null;
  if (prev === 0 && cur > 0) return '▲ new';
  const p = pctChange(cur, prev);
  if (p === 0) return 'no change';
  return p > 0 ? `▲ ${p}%` : `▼ ${Math.abs(p)}%`;
}

function compareTotals(cur, prev) {
  const ctrPoints = cur.ctr === null || prev.ctr === null ? null : round(cur.ctr - prev.ctr, 2);
  const posChange = cur.position === null || prev.position === null ? null : round(cur.position - prev.position, 2);
  return {
    clicks: { current: cur.clicks, previous: prev.clicks, change: cur.clicks - prev.clicks, changePct: pctChange(cur.clicks, prev.clicks), label: pctLabel(cur.clicks, prev.clicks) },
    impressions: { current: cur.impressions, previous: prev.impressions, change: cur.impressions - prev.impressions, changePct: pctChange(cur.impressions, prev.impressions), label: pctLabel(cur.impressions, prev.impressions) },
    ctr: {
      current: cur.ctr, previous: prev.ctr, unit: '%', changePoints: ctrPoints, changePct: pctChange(cur.ctr, prev.ctr),
      label: ctrPoints === null ? null : ctrPoints === 0 ? 'no change' : `${ctrPoints > 0 ? '▲' : '▼'} ${round(Math.abs(ctrPoints), 2)} pts`,
    },
    position: {
      current: cur.position, previous: prev.position, change: posChange, lowerIsBetter: true,
      label: posChange === null ? null : round(posChange, 1) === 0 ? 'no change' : posChange < 0 ? `▲ ${round(Math.abs(posChange), 1)} (better)` : `▼ ${round(posChange, 1)} (worse)`,
    },
  };
}

function perDay(totals, range) {
  if (!range) return null;
  return { days: range.days, clicks: round(totals.clicks / range.days, 1), impressions: round(totals.impressions / range.days, 1) };
}

function itemMap(rows, field) {
  const m = new Map();
  for (const r of rows) {
    const key = r[field];
    if (!key) continue;
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(r);
  }
  const out = new Map();
  for (const [k, list] of m) {
    const agg = aggregate(list);
    // No clicks and no impressions = not shown in Google that period (compare-mode exports write 0s).
    if (agg.clicks || agg.impressions) out.set(k, agg);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------
const curTotals = aggregate(current.rows);
const prevTotals = aggregate(previous.rows);
const totals = compareTotals(curTotals, prevTotals);

let items = null;
if (kind === 'query' || kind === 'page') {
  const cm = itemMap(current.rows, kind);
  const pm = itemMap(previous.rows, kind);
  const keys = [...new Set([...cm.keys(), ...pm.keys()])];
  const all = keys.map((k) => {
    const c = cm.get(k);
    const p = pm.get(k);
    return {
      [kind]: k,
      clicks: c ? c.clicks : 0,
      clicksPrev: p ? p.clicks : 0,
      clicksChange: (c ? c.clicks : 0) - (p ? p.clicks : 0),
      impressions: c ? c.impressions : 0,
      impressionsPrev: p ? p.impressions : 0,
      ctr: c ? c.ctr : null,
      position: c ? c.position : null,
      positionPrev: p ? p.position : null,
      positionChange: c && p && c.position !== null && p.position !== null ? round(c.position - p.position, 1) : null,
      status: !p ? 'new' : !c ? 'lost' : 'both',
    };
  });
  const byKey = (a, b) => a[kind].localeCompare(b[kind]);
  const both = all.filter((x) => x.status === 'both');
  const strip = ({ status, ...rest }) => rest;
  items = {
    top: all.filter((x) => x.status !== 'lost').sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || byKey(a, b)).slice(0, TOP).map(strip),
    gainers: both.filter((x) => x.clicksChange > 0).sort((a, b) => b.clicksChange - a.clicksChange || byKey(a, b)).slice(0, TOP).map(strip),
    losers: both.filter((x) => x.clicksChange < 0).sort((a, b) => a.clicksChange - b.clicksChange || byKey(a, b)).slice(0, TOP).map(strip),
    new: all.filter((x) => x.status === 'new').sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || byKey(a, b)).slice(0, TOP).map(strip),
    lost: all.filter((x) => x.status === 'lost').sort((a, b) => b.clicksPrev - a.clicksPrev || b.impressionsPrev - a.impressionsPrev || byKey(a, b)).slice(0, TOP).map(strip),
    strikingDistance: all
      .filter((x) => x.status !== 'lost' && x.position !== null && x.position >= STRIKING.min && x.position <= STRIKING.max && x.impressions >= MIN_IMPRESSIONS)
      .sort((a, b) => b.impressions - a.impressions || byKey(a, b))
      .slice(0, TOP)
      .map(strip),
    counts: {
      current: cm.size,
      previous: pm.size,
      new: all.filter((x) => x.status === 'new').length,
      lost: all.filter((x) => x.status === 'lost').length,
      gainers: both.filter((x) => x.clicksChange > 0).length,
      losers: both.filter((x) => x.clicksChange < 0).length,
    },
    all: all.sort((a, b) => b.clicks - a.clicks || b.clicksPrev - a.clicksPrev || byKey(a, b)).map(strip),
  };
}

let yearOverYear = null;
if (lastYearSet) {
  const ly = aggregate(lastYearSet.rows);
  const t = compareTotals(curTotals, ly);
  const rename = (o) => {
    const { previous: lastYearValue, ...rest } = o;
    return { ...rest, lastYear: lastYearValue };
  };
  yearOverYear = { file: lastYearSet.file, range: lastYearSet.range, totals: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, rename(v)])) };
}

// ---------------------------------------------------------------------------
// Warnings and notes
// ---------------------------------------------------------------------------
if (current.range && previous.range && current.range.days !== previous.range.days) {
  warnings.push(`This period covers ${current.range.days} days and the previous one ${previous.range.days} days — compare the per-day numbers (perDay) or use periods of equal length.`);
}
if (current.range && !previous.range) {
  warnings.push('No dates found for the previous period — check it is as long as this one (add --previous-range).');
}
if (lastYearSet?.range && current.range && lastYearSet.range.days !== current.range.days) {
  warnings.push(`The last-year period covers ${lastYearSet.range.days} days, this period ${current.range.days} days.`);
}
for (const s of [current, previous, lastYearSet].filter(Boolean)) {
  if (s.range?.daysWithData && s.range.daysWithData < s.range.days) {
    warnings.push(`${basename(s.file)} has data for ${s.range.daysWithData} of ${s.range.days} days (${s.range.start} to ${s.range.end}) — some days are missing.`);
  }
}
const today = opt('today') && DATE_RE.test(opt('today')) ? opt('today') : isoDate();
if (current.range) {
  const lag = Math.round((Date.parse(today) - Date.parse(current.range.end)) / DAY);
  if (lag < 3) warnings.push(`This period ends ${current.range.end}, ${lag < 0 ? 'after' : `${lag} day(s) before`} today (${today}). Search Console is usually 2–3 days behind, so the last days are probably incomplete — wait or say so in the report.`);
} else {
  warnings.push('No dates found for this period — say the date range in the report yourself (add --current-range and --previous-range to check the lengths).');
}
for (const s of [current, previous]) {
  if ((kind === 'query' || kind === 'page') && s.format === 'csv' && s.rows.length >= EXPORT_ROW_CAP) {
    warnings.push(`${basename(s.file)} has ${s.rows.length} rows — the Search Console export limit. "New" and "lost" items may only have crossed that cut-off, and totals leave out the rest.`);
  }
}

const notes = [
  'Search Console data is usually 2–3 days behind; report only full periods that ended at least 3 days ago.',
  'CTR = clicks ÷ impressions, calculated from the totals (not an average of row CTRs).',
  `Average position is the impression-weighted average of the ${kind === 'date' ? 'daily' : kind === 'total' ? '' : kind} rows, so it is close to, but not always exactly, the number Search Console shows. Lower is better.`,
];
if (kind === 'query') notes.push('Totals from a query export leave out anonymised queries, so they are lower than Search Console\'s chart totals. Use the daily file (Dates.csv) or the connector\'s totals for the headline numbers.');
if (kind === 'page') notes.push('Totals from a page export can differ from Search Console\'s chart totals (row limits and how Google counts pages). Use the daily file (Dates.csv) or the connector\'s totals for the headline numbers.');
notes.push(`Striking distance = position ${STRIKING.min}–${STRIKING.max} with at least ${MIN_IMPRESSIONS} impressions this period.`);

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
const describe = (s) => ({ file: s.file, ...(s.label ? { columns: s.label } : {}), rows: s.rows.length, range: s.range });
const full = {
  tool: 'power-up-kit/search-diff',
  by: kind,
  current: describe(current),
  previous: describe(previous),
  totals,
  perDay: current.range && previous.range ? { current: perDay(curTotals, current.range), previous: perDay(prevTotals, previous.range) } : null,
  yearOverYear,
  ...(items ? { items } : {}),
  warnings,
  notes,
};

const outPath = opt('out') || `.powerup/reports/search-diff-${kind}-${isoDate()}.json`;
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(full, null, 2)}\n`);

// Same JSON as printJson, but each row of a list goes on one line to keep the summary short.
function compactJson(v, ind = '') {
  const inner = `${ind}  `;
  const flatObject = (x) => x && typeof x === 'object' && !Array.isArray(x) && Object.values(x).every((y) => y === null || typeof y !== 'object');
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return `[\n${v.map((x) => inner + (flatObject(x) ? JSON.stringify(x) : compactJson(x, inner))).join(',\n')}\n${ind}]`;
  }
  if (v && typeof v === 'object') {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    if (!entries.length) return '{}';
    return `{\n${entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${compactJson(x, inner)}`).join(',\n')}\n${ind}}`;
  }
  return JSON.stringify(v);
}

const { all: _all, ...itemSummary } = items || {};
process.stdout.write(`${compactJson({
  ...full,
  ...(items ? { items: itemSummary } : {}),
  fullDiff: outPath,
})}\n`);
