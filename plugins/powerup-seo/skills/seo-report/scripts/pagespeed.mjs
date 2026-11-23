#!/usr/bin/env node
// Power-Up Kit — PageSpeed Insights (Google Lighthouse, run by Google).
//
// Usage:
//   node pagespeed.mjs <public-url> [--strategy mobile|desktop|both]
//
// Works only for public URLs (Google must be able to reach the page).
// Without a key Google allows a small number of requests; set PAGESPEED_API_KEY
// for reliable use. See docs/connectors.md in the Power-Up Kit repo.

import { pageSpeed, parseArgs, printJson, fail } from './powerup-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const url = args._[0];
if (!url || !/^https?:\/\//i.test(url)) fail('Usage: node pagespeed.mjs <public-url> [--strategy mobile|desktop|both]');
if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\]|[^/]*\.local\b|[^/]*\.test\b)/i.test(url)) {
  fail('PageSpeed Insights cannot reach local URLs. Deploy a preview, or use a browser tool for local speed checks.');
}

const strategy = String(args.strategy || 'mobile').toLowerCase();
const strategies = strategy === 'both' ? ['mobile', 'desktop'] : [strategy];
if (!strategies.every((s) => s === 'mobile' || s === 'desktop')) fail('--strategy must be mobile, desktop or both');

const results = [];
for (const s of strategies) {
  results.push(await pageSpeed(url, { strategy: s }));
}
printJson({ tool: 'power-up-kit/pagespeed', results });
if (results.every((r) => !r.ok)) process.exitCode = 2;
