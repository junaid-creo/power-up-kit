# Search data sources (optional connectors)

Use only what is connected in this session. Never fill gaps with estimates presented as data.

## Google Search Console
There is no official Google connector for Search Console; teams usually use a community MCP server (see the kit's docs/connectors.md). If one is connected, pull for the **last 3 months** (compare with the 3 months before if possible):

- Totals: clicks, impressions, average CTR, average position.
- Top 20 queries by clicks, with position and CTR.
- Top 20 pages by clicks.
- **Quick wins:** queries in positions 5–15 with high impressions (small improvements move them to page 1).
- **Low CTR:** pages with many impressions but CTR below ~2% — rewrite their titles/descriptions.
- Indexing: pages "Crawled – currently not indexed", "Discovered – not indexed", and any errors.

## Ahrefs (official connector; uses the user's API units — Lite plan or higher)
- Domain Rating and referring domains (and the trend).
- Organic keywords and estimated traffic — label them "Ahrefs estimate".
- Top pages by organic traffic.
- Top 3–5 organic competitors and **keyword gaps** (keywords they rank for, the client doesn't).
- Broken backlinks pointing to 404 pages (easy wins with 301 redirects).

## Semrush (official connector; uses the user's API units)
- Authority Score, organic keywords, estimated traffic — label them "Semrush estimate".
- Positions for the client's target keywords from `seo.md`.
- Competitors and keyword gap.
- Backlink overview and toxic-link signals (report, don't disavow without a human decision).

## How to present it
- Put connector data in its own section: **"Search performance (source: …, date range …)"**.
- Estimates from Ahrefs/Semrush are not real traffic — say so.
- Before pulling large reports from Ahrefs/Semrush, tell the user roughly how many calls you'll make, because they cost API units.
