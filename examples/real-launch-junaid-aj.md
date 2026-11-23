# Launch check and meta scan — junaid-aj.vercel.app
Power-Up Kit 0.2 · 2026-11-20 · `launch` (post-launch check) + `meta-schema` (scan)

> **Real site, real results.** The same live portfolio site as the [0.1 audit](real-audit-junaid-aj.md), published with the owner's permission. Everything below comes from the kit's scripts — nothing is estimated except the pixel widths, which are labelled.

```bash
node launch-check.mjs https://junaid-aj.vercel.app/ --phase post --max 20
node meta-schema.mjs scan https://junaid-aj.vercel.app/ --sitemap --max 10
```

## Verdict: ⚠️ Go with warnings

**0 fails · 3 warnings · 14 passes · 3 notes** — 1 page checked (the sitemap lists exactly one page). Run time: about 4 seconds.

Nothing blocks the site: search engines can crawl and index it, there are no staging leftovers, and a missing page returns a real 404.

## Warnings

| Check | What the script found | Fix |
|---|---|---|
| Host | `junaid-aj.vercel.app` is a platform address, not a custom domain | Connect your own domain, redirect the Vercel address to it, then run the check again on the real domain |
| Analytics | No analytics tag in the HTML (looked for GA4, Tag Manager, Plausible, Fathom, Matomo, Umami, Clarity, Meta Pixel, Hotjar, Simple Analytics, Vercel Analytics) | Add analytics so you can see who visits after sharing the site. Vercel Web Analytics or a cookieless tool keeps it simple |
| Legal pages | No link to a privacy policy | Add a short privacy page and link it in the footer — needed once the site collects data (analytics, a contact form) |

## Passed

| Check | Evidence |
|---|---|
| Reachable | HTTP 200 in 170 ms |
| HTTPS | `http://` → `https://` in one hop (308) |
| robots.txt | Allows crawling, lists 1 sitemap |
| No noindex | Meta robots and `X-Robots-Tag` both clean |
| No staging leftovers | Links, canonical, og:url, assets and sitemap URLs all on the live host |
| Canonical | Absolute, self-referencing |
| Sitemap | 1 URL, right host, returns 200 without redirects |
| Real 404 | A random missing page returns HTTP 404 (not a soft 404) |
| No placeholder text | No "lorem ipsum", TODOs or default titles |
| Favicon and social image | Both return HTTP 200 |
| Homepage basics | Title, 158-character description, `lang="en"`, mobile viewport |
| No mixed content | No `http://` resources |

**Notes (not problems):** HSTS is on; `X-Content-Type-Options`, frame protection and a Content-Security-Policy are not set (worth adding on a site with logins or forms, optional here). No consent banner is needed while there is no tracking. No forms in the HTML.

## Titles, meta and schema (`meta-schema scan`)

| Item | Result |
|---|---|
| Title | "Mohammed Junaid (Junaid AJ) — Senior UI/UX Developer, Dubai" — 59 characters, **about 585 px** (estimate). Google cuts titles at roughly 580–600 px, so the end may be cut on some screens |
| Description | 158 characters, **about 1,046 px** (estimate). Google often cuts descriptions near 920 px, so the last few words may not show |
| Structured data | `Person`, `ProfilePage`, `WebSite` — valid, no errors |

**Suggested fix:** shorten the title by a few characters (e.g. "Junaid AJ — Senior UI/UX Developer in Dubai", about 411 px) and move the most important words to the start of the description. `meta-schema check` confirms new versions before you paste them.

## Not checked

The script reads the HTML. It did **not** check: speed (run `proof-check` / PageSpeed), how the page looks on desktop and mobile, form submissions and email delivery, analytics events, accessibility beyond the basics, DNS and SSL renewal, backups, or whether the page is indexed in Search Console. Redirects weren't checked because this launch didn't change any URLs.
