# Power-Up Kit — Agency

| Skill | What it does |
|---|---|
| `proposal` | Turns call notes, a brief or an audit into a client proposal: the client's problem in their words, goals, approach, scope with an explicit "not included" list, timeline, three pricing options and next steps. Prices come only from you or your agency profile — unknown prices stay as `[PRICE]`. A checker catches leftover template text, totals that don't add up, mixed currencies and expired quotes, and a renderer makes a branded page you can print to PDF. |
| `launch` | A go-live pipeline. Checks staging, then the live site: noindex or robots.txt left on, staging URLs in links, canonicals and sitemaps, soft 404s, placeholder text, missing analytics, consent and legal pages, redirects. Gives a go / no-go with evidence, a client sign-off, platform launch-day steps (Webflow, Framer, WordPress, Shopify, Vercel, Netlify) and the week-1 and month-1 follow-ups. |

Requires Node.js 18+ and installs **powerup-core** automatically. Set up your details first with the `agency-profile` skill. `launch` works on its own; with the SEO pack installed it also uses `meta-schema` and `redirect-map`.

Docs: https://github.com/junaid-creo/power-up-kit
