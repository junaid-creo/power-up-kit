# SEO and QA audit — junaid-aj.vercel.app
Power-Up Kit 0.1 · 2026-11-20 · `seo-audit` + `proof-check`

> **Real site, real results.** An audit of a live portfolio site, published with the site owner's permission. Everything below was measured by the kit's scripts and a browser — nothing is estimated.

## Summary

**Crawl score: 100/100** · **Page check: ✅ pass (17/17)** · **Accessibility quick check: 2 small issues**

The technical SEO is excellent: correct title and description lengths, one H1, a canonical URL, structured data for a person profile, all images described, HTTPS, a sitemap and real 404 pages. All text is in the server HTML, which is ideal for search engines.

The biggest opportunity isn't a fix — it's **more pages that can rank**. The site is one page (about 400 words), so there is little for Google to match to searches like "Webflow developer Dubai".

## Top 5 recommendations

| # | Recommendation | Why | Effort |
|---|---|---|---|
| 1 | Add a case-study page for each key project (problem, approach, result, credits) | One page with ~400 words gives search engines little to rank; case studies target client and service searches and give the awards something to link to | M |
| 2 | Measure the intro animation's effect on speed with Google PageSpeed; if Largest Contentful Paint is over 2.5 s, show the name and hero text immediately and let the intro play over it | The homepage has a preloader (`.preloader`, `.intro-main`); intros often delay when Google counts the page as loaded | S |
| 3 | Make the "Close preview" button at least 24×24 px | It measures 35×9 px — hard to tap on a phone (WCAG 2.2 target size) | S |
| 4 | Give the email contact link 24 px of height (padding) | It measures 159×22 px, just under the 24 px minimum | S |
| 5 | Open the LinkedIn link by hand once | LinkedIn blocks automated checks (it answers "999"), so the kit can't confirm it works | S |

## What passed

| Check | Result | Evidence |
|---|---|---|
| Page loads | ✅ | HTTP 200 in 170 ms (from the audit machine) |
| HTTPS | ✅ | `http://` redirects to `https://` |
| Title | ✅ | 59 characters |
| Meta description | ✅ | 158 characters |
| Headings | ✅ | One H1, no skipped levels |
| Canonical | ✅ | Points to the page itself |
| Indexable | ✅ | No `noindex` |
| Structured data | ✅ | Valid JSON-LD: ProfilePage, WebSite, Person |
| Social sharing | ✅ | og:title and og:image present |
| Language and mobile viewport | ✅ | `lang="en"`, `width=device-width` |
| Image alt text | ✅ | 59 of 59 images |
| robots.txt and sitemap | ✅ | Both present (sitemap lists 1 URL) |
| Missing pages | ✅ | Unknown URLs return a real 404 |
| Links | ✅ | 3 of 3 checkable links work; LinkedIn needs a manual check |
| Mixed content | ✅ | None |
| Text contrast | ✅ | 148 text elements meet WCAG AA |
| Names and labels | ✅ | Every link, button and field has an accessible name |
| Mobile layout | ✅ | No sideways scrolling at 375 px wide |
| Console errors | ✅ | None |
| Page weight at first load | ✅ | 391 KB in 18 requests (160 KB scripts, 142 KB images, 56 KB fonts); server response 449 ms |

Note: the 59 images have no `width`/`height` attributes. That's normal for Next.js `fill` images inside sized containers, so it isn't listed as a problem — PageSpeed's layout-shift score will confirm it.

## Not checked

- **Google PageSpeed scores and real-user speed data** — Google's keyless quota was used up on the day. Re-run with a free `PAGESPEED_API_KEY`.
- **Speed timings from the browser** — the browser was in the background, which delays drawing, so paint timings weren't reliable and aren't reported.
- **The animated hero by eye** — animations pause in a background browser; the centre of the page looked empty in screenshots, which may just be the paused animation. Check by eye.
- **Search data** — no Search Console, Ahrefs or Semrush connected.

## How this was made

```bash
node seo-crawl.mjs https://junaid-aj.vercel.app/ --max 50
node page-check.mjs https://junaid-aj.vercel.app/ --external
node pagespeed.mjs https://junaid-aj.vercel.app/ --strategy both    # quota reached that day
```

Plus `a11y-snippet.js` and `vitals-snippet.js` run in a browser at 1024 px and 375 px wide.

This real-world run also improved the kit: it showed that LinkedIn's "999" answer was being reported as a broken link (now reported as "check by hand"), and that browser speed timings need a visible tab (now part of the proof-check instructions).
