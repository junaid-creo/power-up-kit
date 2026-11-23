---
name: meta-schema
description: Write, fix and check page titles, meta descriptions, Open Graph tags and JSON-LD schema for one page or a whole site, then give paste-ready code or steps for WordPress, Webflow, Framer, Shopify, Next.js or HTML. Checks length, pixel width, duplicates and required schema fields, and never invents reviews or prices. Use for meta titles and descriptions, title tags, social previews, schema markup, structured data, rich results, "fix our titles" or "add schema".
license: MIT
compatibility: Works in Claude Code and the Claude app. Scripts need Node.js 18+; scanning live pages needs internet access to the website (saved HTML files work too). Webflow and Framer connectors are optional.
allowed-tools: Bash(node "${CLAUDE_SKILL_DIR}/scripts/meta-schema.mjs" *)
metadata:
  kit: power-up-kit
  version: 0.2.1
---

# Meta and schema

Titles and descriptions sell the click. Structured data tells Google exactly what a page is. Write both from facts — the page, the user and client memory. **Never invent** reviews, ratings, prices, opening hours, addresses, coordinates, authors or dates. Mark up only what a visitor can see on the page.

## 1. Set up

- **Pages:** one page, a list, or the whole site from its sitemap (default up to 50 pages — ask before more). Confirm the user owns the site or may change it.
- **Platform:** plain HTML, WordPress (Yoast or Rank Math), Webflow, Framer, Shopify, Next.js, Astro/static or other. Check `profile.md` → Website platform; otherwise ask. If the site's code is in this project, look at it.
- **Client memory** — if a client is active (`.powerup/active-client`, or client files in this Claude Project), read:
  - `seo.md` — keywords and their target pages, locations, languages;
  - `voice.md` — tone, words to use and avoid;
  - `profile.md` and `brand.md` — the brand name exactly as written, business details;
  - `decisions.md` — past rules (e.g. "titles end with | Crumb & Co").
- **Facts for schema:** name, address, phone, hours, prices and authors come from the page or the user. Anything you can't find goes on a **To confirm** list — never fill the gap with a guess.

## 2. Scan what is there now

```bash
node "${CLAUDE_SKILL_DIR}/scripts/meta-schema.mjs" scan https://site.com/ --sitemap --max 50 --draft .powerup/reports/meta-draft-<domain>-<date>.json
```

- For a few pages, list the URLs instead of `--sitemap`.
- For local files or a built site folder (`dist/`, `out/`): `scan ./dist --base-url https://site.com/`.
- It prints, per page: title and description length with estimated pixel width, schema types, and every `fail`/`warn` (missing, duplicate, too short or long, ALL CAPS, keyword stuffing, relative og:image, missing canonical, schema errors). Full data goes to `.powerup/reports/meta-scan-<domain>-<date>.json`. `--draft` saves today's values as a starting proposals file.
- It respects robots.txt and crawls slowly. Only scan sites the user owns or may check.
- **Claude app:** if the script fails with a network error, fetch each page with your web tool, save the HTML as files, and run `scan` on the files with `--base-url`. Say the scan used saved copies. If you can't save files, check a sample by hand with [reference/schema-guide.md](reference/schema-guide.md) and say it was sampled.

## 3. Write proposals.json

Start from the draft, or write it:

```json
{ "site": { "name": "Crumb & Co", "url": "https://crumb.example/" },
  "pages": [ { "url": "https://crumb.example/",
    "title": "Celebration Cakes in Dubai Marina | Crumb & Co",
    "description": "Family bakery in Dubai Marina …",
    "canonical": "https://crumb.example/",
    "og": { "image": "https://crumb.example/og-home.jpg", "type": "website" },
    "twitter": { "card": "summary_large_image" },
    "schema": [ { "@context": "https://schema.org", "@type": "Bakery", "name": "Crumb & Co" } ] } ] }
```

`canonical`, `og`, `twitter` and `schema` are optional. The snippet fills sensible defaults (canonical = url, og:title = title, og:site_name = site name).

**Titles**
- Main keyword from `seo.md` near the start. Brand at the end if it fits (`Topic | Brand`), with the same separator on every page.
- 30–60 characters and no wider than ~580 px (the script estimates it). Unique for every page.
- No ALL CAPS, no repeated keywords, no clickbait. Promise only what the page delivers.
- Local pages name the place naturally ("Wedding Cakes in Dubai Marina"), not a list of areas.

**Descriptions**
- Benefit + proof + call to action. Use proof only if it is true and on the page (years in business, a guarantee, delivery times).
- 70–160 characters, no wider than ~920 px. Matches what the page really says. Unique. Not a copy of the title.
- In the client's voice (`voice.md`) and the page's language.

**Schema** — choose types with [reference/schema-guide.md](reference/schema-guide.md):
- Home → Organization, or LocalBusiness with the most specific subtype (Bakery, Dentist…), + WebSite. Service page → Service. Blog post → BlogPosting + BreadcrumbList. Product → Product with Offer. Contact → LocalBusiness. Event → Event.
- **No reviews or ratings you can't see on the page.** Google shows no stars for reviews a business publishes about itself, and invented reviews can bring a manual penalty. If the user asks for "5-star review stars", explain this kindly, leave them out, and offer honest options (ask customers for Google reviews; show real testimonials as text; product reviews from a real review platform).
- **FAQPage:** Google no longer shows FAQ rich results (since 7 May 2026). The markup is harmless and other search and AI tools may still read it. Don't add it expecting stars or dropdowns.
- Leave out any property you don't have a real value for — a warning for a missing *recommended* property is fine.

## 4. Check and fix

```bash
node "${CLAUDE_SKILL_DIR}/scripts/meta-schema.mjs" check proposals.json --snippets .powerup/reports/meta-<domain>-<date>-snippets.html --compare .powerup/reports/meta-scan-<domain>-<date>.json
```

- Fix every `fail` and run it again until there are none (exit code 1 means at least one fail).
- Judge each `warn`. Leave it only with a reason (e.g. "no priceRange — the client doesn't publish one").
- Pixel widths come from an Arial character table. Always call them **estimates**; Google decides the final snippet.
- To measure one line while drafting: `node "${CLAUDE_SKILL_DIR}/scripts/meta-schema.mjs" width "Your title here"` (add `--font-size 14` for descriptions).

## 5. Get approval

Before you change anything live, show an old → new table (the `--compare` data is in the full report under `changes`):

| Page | Field | Now | New |
|---|---|---|---|
| / | Title | Home | Celebration Cakes in Dubai Marina \| Crumb & Co (46 chars, ~436 px) |
| / | Description | — (missing) | Family bakery in Dubai Marina … (136 chars) |
| / | Schema | none | Bakery + WebSite |

Add the **To confirm** list (hours, prices, phone — anything you took from a single source) and wait for a clear yes.

## 6. Deliver

- **Site code in this project** (HTML, Next.js, Astro, a theme): edit it directly, following [reference/platforms.md](reference/platforms.md). Replace existing tags — never leave two titles or two canonicals. Then offer the **proof-check** skill on the changed pages.
- **Webflow or Framer connector in this session:** only after the user approved the table, set the fields page by page with the connector and read them back. Don't publish unless the user says so.
- **Anything else:** give the snippets file and the exact steps for their platform from [reference/platforms.md](reference/platforms.md).
- After it is live: suggest testing a URL in Google's Rich Results Test (https://search.google.com/test/rich-results) and the Schema Markup Validator (https://validator.schema.org/). Valid markup makes a page *eligible* — Google never guarantees a rich result.

## 7. Save and report

- Files: `.powerup/reports/meta-<domain>-<YYYY-MM-DD>.json` (from `check --out`, or the default name) and the snippets HTML next to it. In the Claude app, offer both as downloads.
- If the user approved: add a line to the client's `decisions.md`, e.g. `2026-11-20 — New titles, descriptions and Bakery schema approved for 12 pages (meta-crumb-example-2026-11-20.json)`. Save a new title pattern there too.
- Report in this order: the old → new table, the check result (name the script as the source), **To confirm**, and **Not checked** — e.g. how Google will really show the snippet, rich result eligibility (Rich Results Test), pages beyond `--max`, and any click or ranking effect (needs Search Console).

Offer next steps: **proof-check** after the changes go live, **seo-audit** for the wider site, **content-brief** for thin pages, **redirect-map** if URLs are changing, **client-note** to save the title pattern.
