# Writing an honest SEO report

A monthly report has one job: help the client understand what happened, why, and what comes next. Real numbers, plain words, no spin.

## 1. Compare periods fairly

- **Full periods only.** Report a month after it has ended. Search Console data is usually **2–3 days behind**, so wait until about the 3rd of the next month. If the period ended less than 3 days ago, say the last days may be incomplete.
- **Same length.** Calendar months differ (31 vs 30 days, 28 in February). For month over month, also look at clicks per day (`perDay` in the search-diff result). For custom ranges, use periods of equal length.
- **Two comparisons:**
  - **Month over month** shows the direction.
  - **Year over year** (same month last year) shows whether a change is just the **season**. A bakery always gets more searches in December, so a drop in January is normal. Use it whenever last year's data exists.
- **Same settings each month.** Crawl with the same `--max` page limit. Export the same Search Console report with the same filters (web search, same countries). Use the same Ahrefs/Semrush project and location. Never mix tools between periods (Ahrefs one month, Semrush the next).

## 2. How the numbers work

| Number | How it's calculated | Watch out |
|---|---|---|
| % change | (this − previous) ÷ previous × 100, one decimal | From 0 to anything is "new", not a % |
| Clicks, impressions | Sum of the rows | Query exports leave out anonymised searches, so their totals are lower than Search Console's chart. Use the daily file (usually Dates.csv) or the connector's totals for the headline. |
| CTR | clicks ÷ impressions × 100 | Report the change in **points** (5.3% → 5.9% = ▲ 0.6 pts) |
| Average position | Each row's position, weighted by its impressions | **Lower is better.** It can look "worse" just because the site started to appear for many new searches lower down — check impressions before calling it bad. |
| Health score | From the seo-audit crawl | Compare only crawls with the same page limit |
| Ahrefs / Semrush traffic | A **model** (estimated rankings × search volume × expected CTR) | Always write "Ahrefs estimate" / "Semrush estimate". Never add it to Search Console clicks. |
| Referring domains, backlinks | From the Ahrefs / Semrush link index | Each tool counts differently; compare within one tool only |

Search Console exports stop at **1,000 rows**. On a big site, a "new" or "lost" search term may only have crossed that cut-off.

If you only have numbers the user pasted (no scripts), calculate the same way and check each one twice. Round percentages and positions to one decimal.

## 3. What counts as a real change

Small numbers jump around. A change is worth reporting when it is **big enough and has enough volume**. Rules of thumb (not Google rules):

- **Site totals:** under about ±5% month over month is usually normal variation — call it "steady".
- **One search term or page:** report it if clicks changed by about 20% or more **and** it has real volume (roughly 20+ clicks or 500+ impressions in one of the two periods). "From 2 to 4 clicks (+100%)" is noise.
- **Average position:** for the whole site, a change under about 1 place is usually noise. For one search term, a move of 3+ places with 100+ impressions is worth a line.
- **Health score:** report any change with a clear cause (issues fixed or new). Explain the cause, not the points.
- When in doubt, write "small change, too early to tell". That is honest and useful.

## 4. Explaining drops without jargon

Look for evidence before naming a cause. Say "likely" or "possibly" unless you can show it. Common causes:

| Cause | How to check | Plain words |
|---|---|---|
| Season | Same month last year | "Fewer people search for cakes in September every year — last year it dropped by a similar amount." |
| Google update | Dates on the Google Search Status Dashboard (status.search.google.com) match the drop | "Google changed how it ranks sites around 12 October, and many sites moved." |
| Tracking or data change | Property changed, site moved to https or www, a data note in Search Console, different filters | "The way the numbers are collected changed, so part of the drop is not real." |
| Site change | Crawl diff (pages removed, now 404, noindex, new redirects, title changes) and git history | "The cupcakes page was removed, and it used to bring about 120 visits a month." |
| Lost links | Lost backlinks or referring domains in Ahrefs/Semrush | "Two websites that linked to you removed the link." |
| Google answers on its own page | Impressions steady, CTR down | "As many people saw you in Google, but fewer clicked — Google now answers more questions on its own page." |
| Competitors | Positions for target keywords in Ahrefs/Semrush | "A competitor published a stronger page about wedding cakes." |

Avoid words like "SERP", "crawl budget" or "canonical" in the main text. If you must use a term, explain it once in brackets.

## 5. Credit: only what you can connect

- **Claim credit only when you can connect the result to work done:** the work touched those pages or search terms, **and** the change came after the work. Say "likely helped", not "caused".
- If clicks went up but nothing you did is related, say so: "Clicks rose 8%. Part of this is the season (last year +6%)."
- **Never hide bad news.** Put problems in **Needs attention**, with a plan.
- Never fill a gap with a guess. Missing data is **Not connected** in the table and a line under **Not checked** that names the connector that would add it (Search Console, Ahrefs, Semrush, Google Analytics).

## 6. Plan for next period

Each item: an action that starts with a verb, the evidence behind it (crawl issue, search term, lost page), and effort (S/M/L). Order by expected effect on visits, then effort. Three to five items is enough.

Good sources for plan items:
- **New or worse crawl issues** — especially pages that broke (200 → 404) and broken links.
- **Striking-distance search terms** (position 8–20 with real impressions) — a better page section or title can move them up. Offer the **content-brief** skill.
- **Lost pages or search terms** — redirect a removed page that still had visits.
- **Pages with many impressions but low CTR** — rewrite the title and meta description.
