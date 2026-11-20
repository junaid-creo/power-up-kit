// Power-Up Kit — measure page speed INSIDE a real browser (one visit, from this machine).
//
// Use it when Google PageSpeed can't run: local dev sites, preview links behind a login,
// or when the PageSpeed quota is used up. Load (or reload) the page first, wait ~5 seconds,
// then run this the same way as a11y-snippet.js. It changes nothing on the page.
//
// It reads the browser's own Performance API: time to first byte, first and largest
// contentful paint, layout shift, page weight by type, the heaviest files, and long tasks.
// It is a lab measurement on your machine and network — not real-user (field) data.

async () => {
  const round = (n) => (typeof n === 'number' ? Math.round(n) : null);
  const kb = (b) => Math.round(b / 1024);
  const buffered = (type) => new Promise((resolve) => {
    const entries = [];
    try {
      const po = new PerformanceObserver((list) => entries.push(...list.getEntries()));
      po.observe({ type, buffered: true });
      setTimeout(() => { po.disconnect(); resolve(entries); }, 300);
    } catch {
      resolve(entries);
    }
  });

  const nav = performance.getEntriesByType('navigation')[0] || {};
  const paints = performance.getEntriesByType('paint');
  const fcp = paints.find((p) => p.name === 'first-contentful-paint');
  const lcpEntries = await buffered('largest-contentful-paint');
  const lcp = lcpEntries[lcpEntries.length - 1];
  const shifts = await buffered('layout-shift');
  const longTasks = await buffered('longtask');

  // CLS: largest session window (gap < 1 s, window < 5 s), ignoring shifts after user input.
  let cls = 0;
  let windowValue = 0;
  let windowStart = 0;
  let last = 0;
  for (const s of shifts) {
    if (s.hadRecentInput) continue;
    if (s.startTime - last > 1000 || s.startTime - windowStart > 5000) {
      windowValue = 0;
      windowStart = s.startTime;
    }
    windowValue += s.value;
    last = s.startTime;
    cls = Math.max(cls, windowValue);
  }

  const resources = performance.getEntriesByType('resource');
  const byType = {};
  let total = nav.transferSize || 0;
  for (const r of resources) {
    const t = r.initiatorType === 'img' || /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(r.name) ? 'image'
      : r.initiatorType === 'script' ? 'script'
      : r.initiatorType === 'css' || /\.css(\?|$)/.test(r.name) ? 'css'
      : /\.(woff2?|ttf|otf)(\?|$)/i.test(r.name) ? 'font'
      : r.initiatorType === 'video' || /\.(mp4|webm)(\?|$)/i.test(r.name) ? 'video'
      : 'other';
    const size = r.transferSize || r.encodedBodySize || 0;
    byType[t] = byType[t] || { requests: 0, kb: 0 };
    byType[t].requests += 1;
    byType[t].kb += size / 1024;
    total += size;
  }
  for (const t of Object.keys(byType)) byType[t].kb = Math.round(byType[t].kb);

  const heaviest = resources
    .map((r) => ({ url: r.name.slice(0, 140), kb: kb(r.transferSize || r.encodedBodySize || 0), type: r.initiatorType }))
    .sort((a, b) => b.kb - a.kb)
    .slice(0, 6);

  const lcpMs = round(lcp?.startTime);
  const rate = (v, good, poor) => (v == null ? 'not measured' : v <= good ? 'good' : v <= poor ? 'needs improvement' : 'poor');

  return {
    url: location.href,
    measuredAt: new Date().toISOString(),
    kind: 'lab — one page load in this browser, on this machine and network',
    viewport: `${innerWidth}×${innerHeight}`,
    ttfbMs: round(nav.responseStart),
    fcpMs: round(fcp?.startTime),
    lcpMs,
    lcpElement: lcp?.element ? `${lcp.element.tagName.toLowerCase()}${lcp.element.id ? `#${lcp.element.id}` : ''}${lcp.url ? ` (${lcp.url.slice(0, 100)})` : ''}` : null,
    cls: Math.round(cls * 1000) / 1000,
    longTasks: { count: longTasks.length, totalMs: round(longTasks.reduce((s, t) => s + t.duration, 0)) },
    domContentLoadedMs: round(nav.domContentLoadedEventEnd),
    loadMs: round(nav.loadEventEnd),
    requests: resources.length + 1,
    totalKb: kb(total),
    byType,
    heaviest,
    ratings: {
      lcp: rate(lcpMs, 2500, 4000),
      cls: rate(cls, 0.1, 0.25),
      ttfb: rate(round(nav.responseStart), 800, 1800),
    },
    note: 'INP needs real interactions and is not measured here. Cross-origin files may report 0 KB when the server hides timing details.',
  };
}
