---
name: redirect-map
description: Build, check and verify a 301 redirect map so a redesign, migration, platform move or domain change keeps its Google rankings. Matches old URLs to new ones, flags pages with no match instead of sending them to the homepage, finds chains and loops, and exports for Netlify, Vercel, Apache, nginx, Cloudflare, Shopify, WordPress, Webflow and more. Use for "redirect map", "301 redirects", "we're changing URLs", "site migration" or "domain change".
license: MIT
compatibility: Works in Claude Code and the Claude app. The script needs Node.js 18+. It reads sitemaps and URL lists from files, or from the web when internet access is available. Search Console, Ahrefs and Semrush connectors are optional.
allowed-tools: Bash(node "${CLAUDE_SKILL_DIR}/scripts/redirect-map.mjs" *)
metadata:
  kit: power-up-kit
  version: 0.2.0
---

# Redirect map

When URLs change, every old URL must lead to the most relevant new page with **one** permanent (301/308) redirect. Otherwise rankings, backlinks and bookmarks are lost. Two rules you never break:

- **Never send unmatched pages to the homepage in bulk.** Google may treat that as a soft 404. Use the closest relevant page, or 410 if the content is gone on purpose — and let the user decide.
- **Never invent numbers.** Clicks, traffic and backlinks come only from a file the user gave or a connected tool. Otherwise say "Not checked".

Background for every step: [reference/migration-guide.md](reference/migration-guide.md). Platform details and limits: [reference/platform-formats.md](reference/platform-formats.md).

## 1. Set up

Ask, in **one** message (each skippable):
- **What is changing?** Redesign (same domain), new platform, new domain, or new URL structure.
- **Old and new domain** (and a staging URL for the new site, if there is one).
- **Platform** the new site runs on (Netlify, Vercel, Next.js, Apache/WordPress, nginx, Cloudflare, Shopify, Webflow, Framer, other).
- **Launch date.**

**Client memory:** if a client is active (`.powerup/active-client`, or client files in this Claude Project), read `profile.md` (platform, domains), `seo.md` (key pages, data sources, rules like "never change URLs without a redirect map") and `decisions.md` (pages the client already decided to drop or merge).

**Collect old URLs from more than the sitemap.** Ask for the files you don't have:
- Search Console → Performance → Pages, longest date range (up to 16 months), exported as CSV.
- Ahrefs or Semrush "Top pages" and "Best by links" / pages with backlinks, as CSV.
- A crawl export (Screaming Frog "Internal → HTML", or the **seo-audit** crawl CSV).

If a Search Console, Ahrefs or Semrush connector is connected, you can pull top pages and pages with backlinks yourself. Ahrefs and Semrush calls use the user's paid API units: say roughly what you will pull (e.g. "2 calls: top 500 pages and pages with backlinks") and wait for a yes. Save the results as CSV and use them like an export.

## 2. Match old to new

```bash
node "${CLAUDE_SKILL_DIR}/scripts/redirect-map.mjs" match --old <old source> --new <new source> --priority <clicks-or-links.csv> --out .powerup/redirects/<domain>-<YYYY-MM-DD>.csv
```

- **Sources:** a sitemap URL, a site URL (finds sitemaps via robots.txt), a local `.xml` sitemap, a `.txt` list (one URL or path per line) or a `.csv` export (Search Console, Ahrefs, Semrush, Screaming Frog, Analytics — the URL column is found by name).
- `--priority`: a CSV with URL + clicks or referring domains. Its value becomes the `priority` column, unmatched pages are sorted by it, and valuable URLs missing from the old list are added.
- Domain change: add `--new-domain new.com` (and `--old-domain old.com` if the old list has only paths). Both columns then hold full URLs.
- `--fetch-titles`: compares page titles/H1s to confirm word matches and find matches for unmatched pages. It fetches pages politely and respects robots.txt — only use it on sites the user owns or may check. Use `--new-base https://staging…` when the new list has only paths.

Each row gets a `type`: `same-path` (same URL after cleanup — no redirect unless the domain or URL form changed), `slug` (same page name in another folder, high confidence), `similar` (word overlap, medium, score in the note), `title` (title/H1 match), `review` (no good match — target left empty, with a suggested parent section in the note).

**Network error in the Claude app?** The sandbox often can't reach websites. Ask the user to download the old and new sitemaps (or export URL lists) and upload them, or fetch the sitemaps with your web tool, save them as `.xml` files and run the script on the files.

## 3. Review uncertain rows with the user

Read the `review` and `uncertain` lists in the summary (or the CSV). Never fill them in silently. Show a short table, most valuable first (example — use the real values from the map):

| Old URL | Clicks / links | Suggestion | Your call? |
|---|---|---|---|
| /careers/pastry-chef | 12 ref. domains | none — 410? | |
| /blog/our-news | 3 ref. domains | /blog/ (parent section) | |
| /cakes/red-velvet-cakes | – | /shop/red-velvet-cake (similar 0.75) | ✓? |

Offer for each: the most relevant new page, the parent section (only if it truly serves the same visitor), or **410** if the content is gone on purpose. Write the decisions into the CSV (`new` column, or `status` 410 with an empty `new`). For big maps, review the top 20–50 by priority with the user and agree a rule for the rest.

## 4. Check until clean

```bash
node "${CLAUDE_SKILL_DIR}/scripts/redirect-map.mjs" check <map.csv> --new <new source>
```

It finds: empty targets, duplicate sources with different targets, self-redirects, **chains** (with the flattened final target) and **loops**, targets missing from the new site, external targets, many redirects to the homepage, 302/307 rows, old URLs with query strings, case-only and trailing-slash problems, and wildcard pattern suggestions (e.g. `/news/*` → `/blog/*`). Add `--fix` to flatten chains and remove duplicate rows (`--out` writes a copy instead of changing the map).

Fix every `fail`, explain the `warn`s to the user, and run `check` again until `"clean": true`.

## 5. Export for the platform

```bash
node "${CLAUDE_SKILL_DIR}/scripts/redirect-map.mjs" export <map.csv> --format <netlify|vercel|next|apache|nginx|cloudflare|shopify|wordpress|webflow|framer|csv>
```

- The summary says **where the file goes** (`whereToUse`), what was **skipped** and why (e.g. 410 rows on platforms that can't return 410, query-string URLs), and platform **limits**.
- Cloudflare needs `--old-domain` when the map has paths only. Netlify: `--force` adds `!` when old files still exist in the new build.
- **Domain change:** the export also gives a `hostRule` — a domain-level catch-all that keeps the path. Tell the user to add it (after the page rules) and to use Search Console's **Change of Address** tool after launch.
- If you can edit the new site's code, add the rules to the right file yourself (e.g. `_redirects`, `vercel.json`, `next.config.js`). For Shopify, Webflow and WordPress, give the import steps from [reference/platform-formats.md](reference/platform-formats.md).

## 6. Save and hand over

- Keep the map at `.powerup/redirects/<domain>-<YYYY-MM-DD>.csv` and the export file next to it (the script's default). In the Claude app, give both as downloadable files.
- Tell the user in a few lines: how many redirects, how many pages they decided to retire (410), what was skipped and needs a hand-made rule, where to put the file, and the host-level rules (http→https, www, domain).
- Remind them: update internal links, canonicals and the sitemap to the new URLs (don't rely on redirects), and **keep the redirects for at least a year**.

## 7. After launch: verify

```bash
node "${CLAUDE_SKILL_DIR}/scripts/redirect-map.mjs" verify <map.csv> --base https://<live-site> --concurrency 3
```

It requests every old URL (relative paths are joined to `--base`) and checks: the first hop is 301/308 (302/307 → warn), it ends at the expected page (normalised), at most one hop (2 → warn, more → fail), the final page answers 200, and 410 rows answer 410 or 404. Fix the `problems` list, then run it again. For a full go-live check, hand over to the **launch** skill, which runs this too. Without network access, check 10–20 of the most valuable URLs by hand with your web tool and say it was a sample.

## 8. Remember it

If a client is active, add a line to `decisions.md`: `<date> — Redirect map: <n> redirects, <n> pages retired (410), exported for <platform>; file .powerup/redirects/<file> (agreed with <who>)`. Add the rule "keep redirects at least until <date + 1 year>" to `seo.md` → Rules.

## Report format

```markdown
## Redirect map — <old domain> → <new domain or "same domain"> — <date>
**Status:** ✅ Clean and exported / ⚠️ Waiting for decisions / ❌ Problems on the live site
| | Count | Source |
|---|---|---|
| Old URLs (sitemap + exports) | … | match summary |
| Redirects (301) / retired (410) / unchanged | … | check stats |
| Still to decide | … | review rows |
| Live check | … pass / … warn / … fail | verify (date) |
**Files:** map CSV, export file
**Not checked:** … (e.g. no Search Console data — pages with clicks may be missing; live redirects not verified yet)
```

Offer next steps: run the **launch** skill for the go-live check, **proof-check** on the key new pages, an **seo-audit** of the new site after launch (and again after 4–6 weeks to compare), and **client-note** to save decisions.
