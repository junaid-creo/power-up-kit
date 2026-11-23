# Examples

## A real website

[real-audit-junaid-aj.md](real-audit-junaid-aj.md) — `seo-audit` + `proof-check` on a live portfolio site (published with the owner's permission): crawl score, 17 page checks, accessibility and mobile checks in a real browser, page weight, and an honest "not checked" list.

[real-launch-junaid-aj.md](real-launch-junaid-aj.md) — `launch` (post-launch check) + `meta-schema` (scan) on the same site with 0.2: go / no-go verdict, 20 launch checks with evidence, title and description pixel widths, schema validation.

## Demo site

Real output from Power-Up Kit, made by running its scripts on the kit's demo website (`tests/fixtures/site` — a fictional bakery, **Crumb & Co**, with SEO problems planted on purpose). The local address was replaced with `crumb.example`. The agency "Demo Studio", its prices and case studies are fictional too.

| File | Made by | Shows |
|---|---|---|
| [seo-audit-crumb-co.md](seo-audit-crumb-co.md) | `seo-audit` (from a real `seo-crawl.mjs` run) | Score, top 5 fixes, findings with URLs, what wasn't checked |
| [brand-sheet-crumb-co.html](brand-sheet-crumb-co.html) | `brand-sheet` (`extract-brand.mjs` → [brand-crumb-co.json](brand-crumb-co.json) → `render-sheet.mjs`) | Colour roles, WCAG contrast, fonts, voice — marked "not confirmed" |
| [proposal-crumb-co.md](proposal-crumb-co.md) / [.html](proposal-crumb-co.html) | `proposal` (checked with `check-proposal.mjs`, rendered with `render-proposal.mjs`) | Three options with totals that add up, scope, timeline |

Open the `.html` files in a browser (download them first on GitHub) — use **Print → Save as PDF** to see the client-ready version.

Run it yourself:

```bash
npm test
```

The tests start the demo site and run every script against it.
