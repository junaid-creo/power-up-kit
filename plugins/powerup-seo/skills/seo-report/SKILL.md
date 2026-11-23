---
name: seo-report
description: Write a monthly (or any period) client SEO report with real numbers only — Search Console clicks, impressions, CTR and position against the previous period, health score change, fixed and new issues, top movers, work done and next month's plan — as a branded printable page. Use for a monthly SEO report, client SEO report, results report, "how did SEO do this month?" or "what changed since last month?".
license: MIT
compatibility: Works in Claude Code and the Claude app. Scripts need Node.js 18+. PageSpeed needs internet access. Search Console, Ahrefs and Semrush are optional connectors; Search Console CSV exports work too.
allowed-tools: Bash(node "${CLAUDE_SKILL_DIR}/scripts/compare-crawls.mjs" *), Bash(node "${CLAUDE_SKILL_DIR}/scripts/search-diff.mjs" *), Bash(node "${CLAUDE_SKILL_DIR}/scripts/render-report.mjs" *), Bash(node "${CLAUDE_SKILL_DIR}/scripts/pagespeed.mjs" *)
metadata:
  kit: power-up-kit
  version: 0.2.1
---

# SEO report

A report the client reads in five minutes: what changed, why, what we did, what's next. **Every number comes from a script result, a connected tool, or a file or numbers the user gave.** If a number is missing, write "Not connected" and say which connector would add it — never estimate.

Read [reference/report-guide.md](reference/report-guide.md) before writing: fair comparisons, what counts as a real change, explaining drops, and credit rules.

## 1. Set up

- **Client:** if a client is active (`.powerup/active-client`, or client files in this Claude Project), read `seo.md` (keywords, data sources, the **Past audits** table), `profile.md` (goals), `decisions.md` (work done) and `voice.md` (how to talk to them).
- **Branding:** read `.powerup/agency.md` for the agency name, logo, primary colour and font. If it doesn't exist, offer the **agency-profile** skill, or continue without branding.
- **Period:** confirm it. Default: the last full calendar month, compared with the month before and, if the data exists, the same month last year. Full periods only — Search Console is usually 2–3 days behind.
- **Data:** check what you have, then ask for the gaps in **one** message (each one skippable): Search Console access or exports, Ahrefs/Semrush, the site's repository, and notes on work done this period. If the user already gave the data or wants the report now, don't wait — write it with what you have and list the gaps under **Not checked**.

## 2. Site health: compare crawls

Look in `.powerup/reports/` for `seo-crawl-<domain>-<date>.json` files: one from this period (or just after it) and the one used in the last report (see **Past audits**).

- **No crawl for this period?** Run the **seo-audit** skill's crawl first, with the same `--max` as last time. Use that skill; don't call its script from here.
- **No earlier crawl?** Report this period's score only and say it is the first report, so there is nothing to compare yet.

```bash
node "${CLAUDE_SKILL_DIR}/scripts/compare-crawls.mjs" <previous.json> <current.json> --out .powerup/reports/crawl-diff-<domain>-<YYYY-MM>.json
```

It prints the score change, issues fixed / new / better / worse, pages added or removed, pages whose status changed (e.g. 200 → 404), new redirects, pages that became noindex, title and description changes, and indexable and sitemap counts. **Read `warnings` first:** different crawl sizes or a page limit mean some "fixed" or "removed" items may only be pages that weren't crawled — say so in the report.

## 3. Search performance (Search Console)

**With a connector:** for each period (this, previous, same period last year), pull totals by date, the top queries and the top pages (up to 1,000 rows). Save each result as JSON in `.powerup/reports/gsc/`, keeping the API's `rows` and adding `startDate`, `endDate` and `dimensions`.

**Without one:** ask the user to export each period from Search Console → Performance → Search results → set the dates → Export → Download CSV. The ZIP has `Queries.csv`, `Pages.csv` and a daily file (usually `Dates.csv`). A compare-mode export (two periods in one file) also works as `--current` on its own.

Run the script three times — totals, queries, pages:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/search-diff.mjs" --current <oct/Dates.csv> --previous <sep/Dates.csv> --current-range 2026-10-01..2026-10-31 --previous-range 2026-09-01..2026-09-30 [--last-year <oct-2025/Dates.csv>] --out .powerup/reports/gsc/totals-<YYYY-MM>.json
node "${CLAUDE_SKILL_DIR}/scripts/search-diff.mjs" --current <oct/Queries.csv> --previous <sep/Queries.csv> --by query --top 10 --out .powerup/reports/gsc/queries-<YYYY-MM>.json
node "${CLAUDE_SKILL_DIR}/scripts/search-diff.mjs" --current <oct/Pages.csv> --previous <sep/Pages.csv> --by page --top 10 --out .powerup/reports/gsc/pages-<YYYY-MM>.json
```

- **Headline numbers** come from the daily file or the connector's totals. Query exports leave out anonymised searches, so their totals are lower.
- Use the `label` fields (e.g. `▲ 8.3%`, `▲ 0.6 (better)`) for the Change column — they already handle "lower is better" for average position.
- Use `gainers`, `losers`, `new`, `lost` and `strikingDistance` for the movers and the plan. Read `warnings` (different period lengths, incomplete recent days) and copy the important ones into **Data sources and notes**.
- Search Console not available at all? Put "Not connected" in the table and add it to **Not checked**.

## 4. Optional data

**Ahrefs / Semrush (paid API units).** Only if connected. First tell the user what you'll pull and that it uses their API units, e.g. "about 4 calls: referring domains now and a month ago, new and lost backlinks this month, organic keyword count". Pull only after they agree. Label estimated traffic "Ahrefs estimate" / "Semrush estimate" and keep it apart from Search Console clicks. Not connected → "Not connected" for referring domains, and a line under **Not checked**.

**PageSpeed (homepage, mobile):**

```bash
node "${CLAUDE_SKILL_DIR}/scripts/pagespeed.mjs" <homepage-url> --strategy mobile
```

Quote field data (real visitors) when it exists, otherwise lab data, and say which. It is a snapshot from today, not a monthly average. If the quota is reached, suggest a free `PAGESPEED_API_KEY`. In the Claude app the sandbox often can't reach the internet: if the script fails with a network error, open `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=<homepage>&strategy=mobile` with your web fetch tool and read the scores from it, or list speed under **Not checked**.

## 5. Work done this period

Collect only work that really happened, with dates:
- `decisions.md` entries dated in the period;
- if the site's repository is in this project: `git log --since=<start> --until=<end> --oneline`;
- the user's notes (content published, links built, fixes made outside the repository).

## 6. Write the report

Copy [templates/report.md](templates/report.md). Fill every `{{…}}` or delete the line — never leave a placeholder.

- **Numbers:** only from script results, connectors or the user's files and pasted numbers. Copy them; don't round them again or retype them from memory.
- **Pasted numbers only (no scripts):** calculate change = (this − previous) ÷ previous × 100, one decimal; CTR change in points; for average position, lower is better. Check every number twice.
- **Summary:** three bullets in plain words — the biggest result, the biggest problem, what's next.
- **Explain, don't just list:** for each big change, give the likely cause with its evidence (crawl diff, work done, season). Follow the credit rules in the guide: claim credit only for changes you can connect to work done.
- **Plan for next period:** 3–5 actions, highest impact first, each with its evidence and effort.
- **Data sources and notes:** date ranges, estimates labelled, the Search Console delay, how average position is calculated.
- **Not checked:** everything missing, with the connector that would add it.

Save as `.powerup/reports/seo-report-<domain>-<YYYY-MM>.md`. If you can't write files, or the user asked for it in the chat, give the full report in the chat.

## 7. Make it client-ready

```bash
node "${CLAUDE_SKILL_DIR}/scripts/render-report.mjs" .powerup/reports/seo-report-<domain>-<YYYY-MM>.md --agency "<Agency name>" --primary "<hex>" --logo "<logo url>" --font "<font>"
```

This writes the `.html` next to the Markdown file: branded, with green ▲ and red ▼ change cells, ready for **Print → Save as PDF**. If `leftoverPlaceholders` is not empty, fix the Markdown and run it again. In the Claude app, give both files as downloads.

## 8. Remember it

If a client is active, add a row to the **Past audits** table in `seo.md`:

`| <YYYY-MM-DD> | <score>/100 | .powerup/reports/seo-report-<domain>-<YYYY-MM>.md (monthly report) | <top 3 open issues> |`

If the user agrees on next month's plan, add a line to `decisions.md` (or use the **client-note** skill).

## 9. Offer next steps

- Fix the top issues now (for sites you can edit), then check the result with **proof-check**.
- A **content-brief** for the best striking-distance search terms.
- A **redirect-map** if pages were removed or now return 404.
- Schedule next month's report for around the 3rd, when Search Console data is complete, with a fresh **seo-audit** crawl first.
