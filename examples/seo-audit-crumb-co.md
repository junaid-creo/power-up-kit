# SEO audit — Crumb & Co (demo)
Demo Studio · 2026-11-20 · 7 URLs crawled (5 pages)

> **Demo.** Crumb & Co is a fictional bakery. This report was written from a real run of `seo-crawl.mjs` against the kit's test website (`tests/fixtures/site`), served locally; the address was replaced with `crumb.example`. PageSpeed and Search Console weren't run because the demo site isn't public.

## Summary
**SEO health score: 36/100** — the site is small and mostly well built, but one broken link, two pages sharing a title, a blog post hidden from Google and broken product data are holding it back.

Fixing the top five items below is about a day of work and removes the critical and high issues.

| | Result |
|---|---|
| Pages crawled | 5 HTML pages (4 indexable), 1 skipped by robots.txt |
| Critical issues | 1 |
| Mobile speed (homepage) | Not checked — demo site isn't public |
| Search Console clicks (3 months) | Not connected |

## Top 5 fixes
| # | Fix | Why it matters | Pages | Effort |
|---|---|---|---|---|
| 1 | Fix or redirect the "Our old menu" link to `/old-page` | Visitors and Google hit a 404 from the homepage | 1 link | S |
| 2 | Give the cakes page its own title | `/services.html` uses "About us \| Crumb & Co" — Google can't tell it from the About page | 1 | S |
| 3 | Decide on the sourdough blog post: remove `noindex` or take it out of the sitemap | The sitemap asks Google to index a page the page itself forbids | 1 | S |
| 4 | Repair the product structured data on `/services.html` | The JSON is cut off, so cakes can't show rich results | 1 | S |
| 5 | Link to the Corporate orders page from the menu or homepage | It's in the sitemap but no page links to it | 1 | S |

## Findings

### Critical
#### Broken internal link
- **What we found:** `/old-page` returns **404** — 1 link
- **Found on:** https://crumb.example/ ("Our old menu")
- **Fix:** link to the current menu page, or add a 301 redirect from `/old-page` in the site's redirect settings.

### High
#### Duplicate titles
- **What we found:** "About us | Crumb & Co" on 2 pages — `/about.html`, `/services.html`
- **Fix:** title the cakes page e.g. "Celebration Cakes in Dubai Marina | Crumb & Co" (50–60 characters).

#### Sitemap lists a noindex page
- **What we found:** `/blog/post-1.html` is in `sitemap.xml` but has `<meta name="robots" content="noindex">`
- **Fix:** if the post should rank, remove `noindex`; otherwise remove it from the sitemap.

#### Broken structured data (JSON-LD)
- **What we found:** the `Product` block on `/services.html` is not valid JSON (it ends after `"@type": "Product",`)
- **Fix:** complete the block (name, image, offers) and test it in Google's Rich Results Test.

### Medium
- **Thin pages:** 4 of 5 pages have under 200 words (homepage 67, About 36). Expand the homepage and cakes page with sizes, flavours, prices and ordering details.
- **Missing meta description:** `/about.html`.
- **Image without alt text:** `/cake.jpg` on the homepage — describe it ("Three-layer chocolate birthday cake").
- **Orphan page:** `/orphan.html` (Corporate orders) — no internal links point to it.
- **Redirect chain:** the "Offers" link `/chain` → `/chain2` → `/about.html` (2 hops). Link straight to the final page.

### Low
- Social sharing tags missing on 4 of 5 pages · structured data missing on 4 of 5 pages · meta description of 6 characters on `/services.html` · two H1s on `/about.html` · heading jumps from H2 to H4 on `/services.html`.

## What we checked
Crawl of 7 URLs (robots.txt respected — `/private/` skipped), 30 technical and on-page checks, manual review of the homepage.

## Not checked
- Speed (Google PageSpeed) — the demo site isn't public
- Search data — no Search Console, Ahrefs or Semrush connected
- HTTPS and www redirects — skipped for a local address

## Appendix
- Raw crawl data: `seo-crawl` JSON (kept in `.powerup/reports/` in a real project)
- Scoring: starts at 100; each issue type removes points by severity (critical 15, high 8, medium 4, low 2), scaled by how many pages it affects.
