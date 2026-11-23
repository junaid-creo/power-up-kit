# Site migration guide (redirects)

How to keep rankings when URLs change: a redesign, a new platform, a new domain, or a new URL structure. Based on Google's own guidance (sources at the end, checked 2026-11-20).

## 1. Collect every old URL — not just the sitemap

A sitemap misses pages. Merge these sources (the `match` script takes one `--old` source; add the rest with `--priority` or combine them into one `.txt` / `.csv` first):

| Source | Why it matters | How to get it |
|---|---|---|
| Old sitemap(s) | The pages the site says it has | `https://old-site/sitemap.xml` or the site URL (the script reads robots.txt) |
| A crawl | Pages not in the sitemap | Screaming Frog "Internal → HTML" export, or the **seo-audit** crawl CSV |
| Search Console → Performance → Pages | Pages that get clicks — use the longest range (up to 16 months) | Export CSV, or a Search Console connector |
| Ahrefs / Semrush top pages + pages with backlinks | Pages other sites link to (links are lost without a redirect) | Export CSV, or the connector (costs API units — say so first) |
| Analytics landing pages | Pages people enter the site on | Google Analytics → Landing page report → export |
| CMS export / server logs | Old campaign pages, PDFs, odd URLs still visited | Ask the developer |

Google also says images, videos, CSS and JavaScript files that move need redirects. The script leaves out images/CSS/JS by default — map image URLs separately if they get Image Search traffic.

## 2. Map 1:1 to the most relevant page

- Each old URL goes to **the new page with the same purpose and content**. Merged content → the merged page.
- **Never send pages to the homepage in bulk.** Google warns that redirecting many old URLs to one unrelated page "might be treated as a soft 404" — the old page's value is lost anyway.
- No good equivalent? Use the closest **parent section** (e.g. an old blog post → `/blog/`) only when it really serves the same visitor, or let the URL return **410** (or 404) if the content is gone on purpose. Google's guidance: if content isn't moving, old URLs should return 404 or 410.
- Decide unclear rows **with the user**. Don't guess silently.

## 3. Use the right redirect

- **Server-side permanent** redirects: **301** or **308**. Google treats both as permanent and moves the ranking signals to the target.
- **302 / 307** are temporary: the old URL may stay in Google. Avoid them for a migration.
- JavaScript and meta-refresh redirects are a last resort.
- **No chains:** redirect "to the final destination directly". Run `check` — it flattens chains.

## 4. Keep redirects a long time

Google: keep them "for as long as possible", generally **at least 1 year**. For a domain move, keep them at least 180 days and longer while the old URLs still get search traffic; keep the old domain registered for at least a year.

## 5. Don't rely on redirects alone

- Update **internal links** (menus, footer, body text) to the new URLs — every internal link through a redirect is an extra hop.
- Every new page has a **self-referencing canonical** tag with the new URL.
- Submit a **sitemap of the new URLs**; remove the old sitemap.
- Update links you control elsewhere: Google Business Profile, social profiles, ads, email footers. Ask important linking sites to update their links.

## 6. Host-level rules

- **http → https** and **www ↔ non-www**: one host-level rule on the server or platform (not one row per URL). Make sure they don't stack with page redirects into a chain — e.g. `http://old/page` → `https://old/page` → `https://new/page` is two hops.
- **Domain change:** page rules for URLs whose path changes, plus a host-level catch-all that keeps the path for everything else (`export` prints a `hostRule` for this). The rules must run on the server that answers for the **old** domain.

## 7. Domain move: Search Console Change of Address

Use it only for a domain or subdomain move (not for http→https, www changes or path changes). Prerequisites: 301s from the old homepage (and ideally all old pages) are live, and you own both properties in Search Console with the same Google account. Verify every variant of the old domain you use (www, non-www).

## 8. After launch

1. Run `verify` on the live site (or the **launch** skill if installed): every old URL → one 301/308 hop → the right page → 200.
2. Watch Search Console for 2–8 weeks: **Pages** (indexing) report for new 404s and "Page with redirect", the **Sitemaps** report, and Performance traffic moving from old to new URLs.
3. Check server logs or the hosting 404 report for old URLs you missed; add them to the map.
4. Expect some ranking movement for a few weeks. Big drops on specific pages usually mean a missing or wrong redirect — check those first.

## Sources

- Google — Site moves with URL changes: https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes
- Google — Redirects and Google Search: https://developers.google.com/search/docs/crawling-indexing/301-redirects
- Google — Change of Address tool: https://support.google.com/webmasters/answer/9370220
