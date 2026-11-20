// Power-Up Kit — quick accessibility & layout check that runs INSIDE a browser page.
//
// How to use it:
// - Playwright MCP (browser_evaluate): pass the whole file as the `function` argument.
// - Claude in Chrome / built-in browser (javascript tool): paste the file and add `()` at the end,
//   or wrap it: `(<file contents>)()`.
// It returns a JSON-friendly object. It changes nothing on the page.
//
// It is a quick check, not a full WCAG audit. It catches the most common problems:
// missing alt text, unnamed links/buttons, unlabeled form fields, low text contrast,
// tiny tap targets, duplicate ids, sideways scrolling on mobile, missing lang.

() => {
  const MAX = 15;
  const out = {
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight },
    checkedAt: new Date().toISOString(),
    issues: {},
    counts: {},
    notes: [],
  };
  const add = (key, item) => {
    out.counts[key] = (out.counts[key] || 0) + 1;
    if (!out.issues[key]) out.issues[key] = [];
    if (out.issues[key].length < MAX) out.issues[key].push(item);
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  const describe = (el) => {
    let d = el.tagName.toLowerCase();
    if (el.id) d += `#${el.id}`;
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (cls.length) d += `.${cls.join('.')}`;
    const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('src') || '').trim().replace(/\s+/g, ' ');
    return text ? `${d} "${text.slice(0, 60)}"` : d;
  };
  const accessibleName = (el) => {
    const label = el.getAttribute('aria-label');
    if (label && label.trim()) return label.trim();
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' ').trim();
      if (t) return t;
    }
    const text = (el.innerText || '').trim();
    if (text) return text;
    const img = el.querySelector('img[alt]');
    if (img && img.getAttribute('alt').trim()) return img.getAttribute('alt').trim();
    const svgTitle = el.querySelector('svg title');
    if (svgTitle && svgTitle.textContent.trim()) return svgTitle.textContent.trim();
    return el.getAttribute('title') || '';
  };

  // 1. Page language
  if (!document.documentElement.getAttribute('lang')) add('missingLang', 'html element has no lang attribute');

  // 2. Images without alt
  document.querySelectorAll('img').forEach((img) => {
    if (!img.hasAttribute('alt') && img.getAttribute('role') !== 'presentation' && visible(img)) add('imageNoAlt', describe(img));
  });

  // 3. Links and buttons without a name
  document.querySelectorAll('a[href], button, [role="button"]').forEach((el) => {
    if (visible(el) && !accessibleName(el)) add('unnamedControl', describe(el));
  });

  // 4. Form fields without a label
  document.querySelectorAll('input, select, textarea').forEach((el) => {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type) || !visible(el)) return;
    const id = el.id;
    const hasLabel = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) || el.closest('label') ||
      el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title');
    if (!hasLabel) add('unlabeledField', describe(el) + (el.placeholder ? ` (placeholder "${el.placeholder}" is not a label)` : ''));
  });

  // 5. Duplicate ids
  const ids = {};
  document.querySelectorAll('[id]').forEach((el) => { ids[el.id] = (ids[el.id] || 0) + 1; });
  Object.entries(ids).filter(([, n]) => n > 1).forEach(([id, n]) => add('duplicateId', `#${id} used ${n} times`));

  // 6. Heading order
  let prev = 0;
  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
    const level = Number(h.tagName[1]);
    if (prev && level > prev + 1) add('headingSkip', `h${prev} → h${level}: ${describe(h)}`);
    prev = level;
  });
  if (!document.querySelector('h1')) add('noH1', 'No h1 on the page');

  // 7. Text contrast (WCAG 2 AA). Skips text over images/gradients, which needs a human look.
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const backgroundOf = (el) => {
    let node = el;
    while (node && node.nodeType === 1) {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = parse(s.backgroundColor);
      if (c && c.a > 0.95) return c;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  let checkedText = 0;
  let skippedText = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode() && checkedText < 400) {
    const node = walker.currentNode;
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    if (!el || seen.has(el) || !visible(el)) continue;
    seen.add(el);
    const s = getComputedStyle(el);
    const fg = parse(s.color);
    const bg = backgroundOf(el);
    if (!fg || !bg) { skippedText++; continue; }
    checkedText++;
    const size = parseFloat(s.fontSize);
    const bold = Number(s.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const need = large ? 3 : 4.5;
    const r = ratio(fg, bg);
    if (r < need) add('lowContrast', `${describe(el)} — ratio ${r.toFixed(2)}:1, needs ${need}:1 (${s.color} on rgb(${bg.r}, ${bg.g}, ${bg.b}))`);
  }
  out.notes.push(`Contrast checked on ${checkedText} text elements; ${skippedText} skipped (text over images or gradients — check by eye).`);

  // 8. Tap targets smaller than 24×24 px (WCAG 2.2 minimum), ignoring inline text links.
  document.querySelectorAll('a[href], button, [role="button"], input[type="checkbox"], input[type="radio"]').forEach((el) => {
    if (!visible(el)) return;
    const s = getComputedStyle(el);
    if (el.tagName === 'A' && s.display === 'inline') return;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) add('smallTapTarget', `${describe(el)} — ${Math.round(r.width)}×${Math.round(r.height)} px`);
  });

  // 9. Sideways scrolling (common on mobile layouts)
  const docWidth = document.documentElement.scrollWidth;
  if (docWidth > innerWidth + 1) {
    add('horizontalScroll', `Page is ${docWidth}px wide in a ${innerWidth}px window`);
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > innerWidth + 1 && r.width > 0 && visible(el)) add('wideElement', `${describe(el)} — right edge at ${Math.round(r.right)}px`);
    });
  }

  out.total = Object.values(out.counts).reduce((a, b) => a + b, 0);
  out.verdict = out.total === 0 ? 'no common problems found' : `${out.total} issue(s) found`;
  return out;
}
