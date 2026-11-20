# SEO audit report template

Copy this structure. Replace everything in `<…>`. Delete sections that don't apply — never leave placeholders in a client report.

```markdown
# SEO audit — <Client or domain>
<Agency name> · <YYYY-MM-DD> · <N> pages crawled

## Summary
**SEO health score: <score>/100** (<one-line meaning: e.g. "solid base, 3 problems are costing you traffic">)

<2–4 sentences for the business owner: the biggest problem, what it costs them, what fixing it will do.>

| | Result |
|---|---|
| Pages crawled | <n> (<n indexable>) |
| Critical issues | <n> |
| Mobile speed (homepage) | <score>/100 — LCP <x> s (<field/lab>) |
| Search Console clicks (3 months) | <n> or "not connected" |

## Top 5 fixes
| # | Fix | Why it matters | Pages | Effort |
|---|---|---|---|---|
| 1 | <action, starting with a verb> | <business impact> | <n> | <S/M/L> |

## Findings
### Critical
#### <Issue title>
- **What we found:** <measured fact> — <count> of <total> pages
- **Examples:** <url>, <url>, <url>
- **Fix:** <specific steps; platform-specific if known (Webflow/WordPress/Shopify/Framer)>

### High
…
### Medium
…
### Low
…

## Speed (Google PageSpeed, mobile)
| Page | Performance | LCP | INP | CLS | Data |
|---|---|---|---|---|---|
| <url> | <score> | <x s> | <x ms> | <x> | field / lab |

Biggest speed opportunities: <top 3 from PageSpeed with estimated savings>

## Search performance (<source>, <date range>)
<Only if a connector was used. Quick wins and low-CTR pages first.>

## What we checked
Crawl of <n> pages (robots.txt respected), technical and on-page checks, PageSpeed on <n> pages, manual review of <n> key pages.

## Not checked
- <e.g. Search Console data — not connected>
- <e.g. pages beyond the first 50>

## Appendix
- Full page data: `<csv path>`
- Raw crawl data: `<json path>`
- Scoring: starts at 100; each issue type removes points by severity, scaled by how many pages it affects.
```
