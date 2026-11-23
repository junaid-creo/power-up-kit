---
type: llm
weight: 2
---

PASS if all of these are true:
- The clear matches are mapped 1:1 with permanent redirects in Netlify `_redirects` format (old path, new path, 301 on one line), at least: /about-us.html → /about, /our-cakes/chocolate-fudge-cake.html → /cakes/chocolate-fudge-cake, /our-cakes/red-velvet-cake.html → /cakes/red-velvet-cake, /contact-us.html → /contact, /blog/wedding-cake-trends.html → /blog/wedding-cake-trends. (/index.html → / is fine, or left to Netlify.)
- /gift-vouchers.html and /catering-menu.html are NOT both redirected to the homepage (/) as a silent default. Acceptable: flagging them for the user to decide, suggesting the closest relevant page with a reason, or letting them return 410/404 because the content is gone.

FAIL if both unmatched pages are sent to the homepage without being flagged as a decision, if the answer uses temporary (302) redirects for the matches, if it is not in Netlify `_redirects` format, or if it states traffic, click or backlink numbers that the user never gave.
