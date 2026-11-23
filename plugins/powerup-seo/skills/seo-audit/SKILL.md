---
name: seo-audit
description: Run a full SEO audit of a website — crawls the pages, checks technical and on-page SEO, measures speed with Google PageSpeed, scores the site out of 100 and writes a prioritised fix list with evidence. Uses Google Search Console, Ahrefs or Semrush data when those connectors are available. Use when the user asks for an SEO audit, site audit, SEO check, "why don't we rank?", a pre-launch or post-migration SEO check, or a one-off audit report for a client. For a monthly or recurring client report, use seo-report.
license: MIT
compatibility: Works in Claude Code and the Claude app. Scripts need Node.js 18+ and internet access to the website. Search Console, Ahrefs and Semrush are optional connectors.
allowed-tools: Bash(node "${CLAUDE_SKILL_DIR}/scripts/seo-crawl.mjs" *), Bash(node "${CLAUDE_SKILL_DIR}/scripts/pagespeed.mjs" *)
metadata:
  kit: power-up-kit
  version: 0.2.1
---

# SEO audit

Produce an audit a client can act on: real numbers, real URLs, fixes in priority order. Never invent rankings, traffic or backlink numbers — only report data you measured or got from a connected tool.

## 1. Set up

- **Site:** get the URL. Confirm the user owns the site or has permission to audit it.
- **Client memory:** if a client is active (`.powerup/active-client`, or client files in this Claude Project), read `seo.md` (keywords, locations, competitors, data sources) and `profile.md` (goals). Use them to judge what matters.
- **Size:** default 50 pages. For bigger sites ask whether to crawl more (`--max 200`); more pages take longer.

## 2. Crawl

```bash
node "${CLAUDE_SKILL_DIR}/scripts/seo-crawl.mjs" <url> --max 50 --csv .powerup/reports/<domain>-pages-<date>.csv
```

It respects robots.txt, crawls slowly, and prints a short summary (score, issue counts, path to the full JSON report). Read the full JSON only for the issues you are writing up — it can be large.

In the Claude app the sandbox often can't reach websites. If the script fails with a network error there, use your web fetch tool to read the homepage and 5–10 key pages, and apply the checks in [reference/checklist.md](reference/checklist.md) by hand. Say in the report that it was a sampled audit.

## 3. Speed

Run PageSpeed (mobile) on the homepage and 1–2 key templates (e.g. a service page and a blog post):

```bash
node "${CLAUDE_SKILL_DIR}/scripts/pagespeed.mjs" <url> --strategy mobile
```

Quote **field data** (real visitors) when it exists, otherwise lab data — and say which. If the quota is hit, note it and suggest a free `PAGESPEED_API_KEY`.

## 4. Search data (only if connected)

Look at your tools. If any of these are available, pull the data in [reference/data-sources.md](reference/data-sources.md):

- **Google Search Console:** top queries and pages (last 3 months), pages not indexed and why.
- **Ahrefs / Semrush:** organic keywords and positions, top pages, referring domains, competitors.

Ahrefs and Semrush calls use the user's paid API units — tell the user roughly what you'll pull before you pull it. If none are connected, write *"Connect Search Console / Ahrefs / Semrush for traffic and ranking data"* under **Not checked**.

## 5. Look beyond the script

The script checks structure, not meaning. Read the homepage and the top pages yourself and judge (details in [reference/checklist.md](reference/checklist.md)):

- Does each key page target a clear topic or keyword from `seo.md`? Any two pages fighting for the same one?
- Is there a page for each main service × location the client wants to rank for?
- Local business? Check name, address and phone are consistent and there is LocalBusiness structured data.
- Trust signals: about page, real photos, reviews, contact details, author names on articles.

## 6. Write the report

Use [reference/report-template.md](reference/report-template.md). Save it as `.powerup/reports/seo-audit-<domain>-<YYYY-MM-DD>.md` (in the Claude app, as a downloadable file). If `.powerup/agency.md` exists, put the agency name in the header.

Rules:
- Lead with the **top 5 fixes**, ordered by impact on traffic, then effort.
- Every finding names the affected URLs (up to 5 examples + total count) and the measured value.
- Write for a business owner: say what it costs them, then the fix. Put technical detail in the appendix.
- List what you didn't check under **Not checked**.

## 7. Remember it

If a client is active, add the audit to the **Past audits** table in their `seo.md` (date, score, report path, top 3 issues), and add a line to `decisions.md` if the user agreed on priorities.

Offer next steps: fix the top issues now (for sites you can edit), a redirect map for a migration, or a re-audit after fixes to show the score change.
