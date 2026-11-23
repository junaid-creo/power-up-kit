# Power-Up Kit — SEO

Five skills for SEO teams, agencies and developers. Every number comes from a script result or a connected tool (Search Console, Ahrefs, Semrush) — never invented.

| Skill | What it does |
|---|---|
| `seo-audit` | Crawls a website politely (respects robots.txt), runs 30 technical and on-page checks, measures mobile speed with Google PageSpeed Insights, scores the site out of 100 and writes a prioritised fix list with the affected URLs. |
| `content-brief` | Studies the pages that rank for a keyword (outline, length, questions, schema, dates) and writes a brief a writer can follow: intent, outline, titles, questions to answer, internal links and the angle competitors miss. Checks Search Console for pages that already compete for the keyword. |
| `meta-schema` | Scans current titles, meta descriptions, Open Graph tags and JSON-LD, writes better ones, checks them (length, estimated pixel width, duplicates, required schema fields, no fake reviews) and gives paste-ready code or exact steps for WordPress, Webflow, Framer, Shopify, Next.js and plain HTML. |
| `redirect-map` | For redesigns and migrations: matches old URLs to new ones, flags the unsure ones (never dumps them on the homepage), checks for chains and loops, exports for Netlify, Vercel, Next.js, Apache, Nginx, Cloudflare, Shopify, WordPress, Webflow and Framer, and verifies the redirects on the live site. |
| `seo-report` | Monthly client report: Search Console and health-score changes, fixed and new issues, top movers, "striking distance" keywords, work done and next steps — as Markdown and a branded, printable page. |

Reports are saved to `.powerup/` and linked in the active client's `seo.md`. Requires Node.js 18+ and installs **powerup-core** automatically.

Docs: https://github.com/junaid-creo/power-up-kit
