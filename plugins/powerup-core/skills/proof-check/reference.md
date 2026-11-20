# Proof check — reference

Load this only when you need to explain a result or decide how serious it is.

## What page-check.mjs checks

| id | Check | Pass | Warn | Fail |
|---|---|---|---|---|
| http-status | Page loads | 2xx | — | 4xx, 5xx, no response |
| redirects | Redirects | 0–1 hop (info) | 2+ hops | — |
| https | Uses HTTPS | final URL https | http (OK on localhost) | — |
| response-time | Server response + download | < 800 ms | 800–2000 ms | > 2000 ms |
| title | Title tag | 15–60 chars | too long/short | missing |
| meta-description | Meta description | 70–160 chars | missing or length | — |
| h1 | One H1 | exactly 1 | 2+ | none |
| heading-order | Heading order | no skipped levels | skipped levels | — |
| canonical | Canonical URL | points to itself | missing | — |
| robots-meta | Indexable | no noindex | noindex found | — |
| open-graph | Social preview | og:title + og:image | missing one | — |
| structured-data | JSON-LD | valid JSON | — | invalid JSON |
| lang | Page language | `<html lang>` set | missing | — |
| viewport | Mobile viewport | width=device-width | — | missing |
| zoom | Zoom allowed | — | user-scalable=no / maximum-scale=1 | — |
| img-alt | Alt text | every `<img>` has alt | some missing | — |
| link-names | Links have names | — | empty links | — |
| favicon | Favicon | present | missing | — |
| mixed-content | No http resources on https | none | — | any |
| broken-links | Links work | all OK | — | any 4xx/5xx/error |

`alt=""` counts as present: it is correct for decorative images.

Response time is measured from the machine running the script, so it is a rough signal only. Use PageSpeed for real speed numbers.

## PageSpeed numbers

- **Scores (0–100):** 90+ good, 50–89 needs work, under 50 poor.
- **Lab data** = one simulated mobile visit. **Field data** = real Chrome users over 28 days (only for sites with enough traffic).
- Core Web Vitals "good" targets (75th percentile): **LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1**.
- Prefer field data when it exists. Say which one you are quoting.

## vitals-snippet.js results (speed measured in the browser)

| Field | Good | Needs work | Poor |
|---|---|---|---|
| `lcpMs` (largest content shown) | ≤ 2500 | ≤ 4000 | > 4000 |
| `cls` (layout shift) | ≤ 0.1 | ≤ 0.25 | > 0.25 |
| `ttfbMs` (server response) | ≤ 800 | ≤ 1800 | > 1800 |

- One page load on this machine and network: a lab number, not real-user data. Say so.
- Only valid when the tab was **visible** during the load. Background tabs delay painting, so FCP/LCP come out far too high.
- `heaviest` lists the biggest files — usually the quickest speed win (compress images, split big scripts).
- INP (responsiveness) needs real interaction; use PageSpeed field data for it.

## a11y-snippet.js results

| key | Meaning | Typical fix |
|---|---|---|
| missingLang | `<html>` has no lang | add `lang="en"` (or the right language) |
| imageNoAlt | `<img>` without alt | describe the image, or `alt=""` if decorative |
| unnamedControl | link/button with no text or label | add text or `aria-label` |
| unlabeledField | form field with no label | add `<label for>` — a placeholder is not a label |
| duplicateId | same id used twice | make ids unique |
| headingSkip / noH1 | heading structure problems | use h1 → h2 → h3 in order |
| lowContrast | text fails WCAG AA contrast | darken text or lighten background (4.5:1, or 3:1 for large text) |
| smallTapTarget | control under 24×24 px | add padding |
| horizontalScroll / wideElement | page scrolls sideways | find the wide element and constrain it (`max-width: 100%`) |

The snippet is a quick check, not a full WCAG audit. Say so in reports.

## Severity guide for the verdict

- **❌ Not ready:** page doesn't load, broken links in the changed area, missing viewport, invalid structured data, mixed content, layout broken on mobile, console errors that break features, anything the user asked for that doesn't work.
- **⚠️ Ready with warnings:** SEO length issues, missing alt text, small contrast problems, slow-ish response, missing social tags.
- **✅ Ready:** everything you checked passed and the changed features work in the browser.
