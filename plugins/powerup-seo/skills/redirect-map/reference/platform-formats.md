# Export formats by platform

`export` writes one file per platform. It only exports rows that need a redirect: unchanged URLs are skipped, rows with no target are skipped (decide them first), and things the platform can't do are listed under `skipped` with the reason. Checked against each vendor's docs on 2026-11-20 — platforms change; if an import fails, follow the source link.

| `--format` | File | Where it goes | 410 rows | Old URLs with `?query` |
|---|---|---|---|---|
| `netlify` | `_redirects` | Site publish folder | Comment only (missing pages answer 404) | Comment — add by hand |
| `vercel` | `vercel-redirects.json` | Merge `redirects` into `vercel.json` | Skipped (will 404) | `has: [{type: "query"}]` |
| `next` | `next-redirects.js` | `redirects()` in `next.config.js` | Skipped (will 404) | `has: [{type: "query"}]` |
| `apache` | `htaccess-redirects.txt` | Top of `.htaccess` | `[G]` (410) | `RewriteCond %{QUERY_STRING}` |
| `nginx` | `nginx-redirects.conf` | Inside the old site's `server { }` | `return 410;` | `if ($request_uri = "…")` |
| `cloudflare` | `cloudflare-bulk-redirects.csv` | Bulk Redirects list | Skipped | Skipped — use a Single Redirect |
| `shopify` | `shopify-redirects.csv` | Content → Menus → URL redirects → Import | Skipped (404) | Skipped |
| `wordpress` | `redirection-import.csv` | Tools → Redirection → Import/Export | Skipped — add by hand | Exported as written |
| `webflow` | `webflow-redirects.csv` | Site settings → Publishing → 301 redirects → Import | Skipped (404) | Skipped |
| `framer` | `framer-redirects.csv` | Site Settings → Hosting → Redirects (by hand) | Skipped (404) | Skipped |
| `csv` | `redirects.csv` | Any other platform / a developer | Included | Included |

## Netlify — `_redirects`
- One rule per line: `/old  /new  301`. Comments start with `#`. **The first matching rule wins**, so exact rules go above wildcard rules (`/news/*  /blog/:splat  301`).
- Special characters must be URL-encoded (the export does this).
- **Shadowing:** if a file still exists at the old path, Netlify serves the file and ignores the rule. Add `!` to force it (`301!`, or `export --force`).
- Netlify treats `/old` and `/old/` the same; a rule that only adds/removes a slash loops.
- Status codes: 301 (default), 302, 404, 200. 307 is not supported (use 302). The export writes 410 rows as comments — a missing page already answers 404.
- Query strings need their own syntax (`/store id=:id /blog/:id 301`) — set those up by hand.
- Domain move: sources are full URLs (`https://old.example/page`) so they only fire on the old domain; the old domain must be added to the site. HTTP and HTTPS need separate rules unless HTTPS is forced.
- Limits: no hard number in the docs; for 10,000+ redirects Netlify suggests wildcards/placeholders, and very large rule sets can fail the deploy.
- Docs: https://docs.netlify.com/manage/routing/redirects/overview/ and https://docs.netlify.com/manage/routing/redirects/redirect-options/

## Vercel — `vercel.json`
- `{ "source": "/old", "destination": "/new", "permanent": true }`. `permanent: true` sends **308** (Google treats it like 301); `false` sends 307. Use `statusCode: 301` instead of `permanent` if a 301 is required.
- `source` matches the path only. Query strings are matched with `has: [{ "type": "query", "key": "id", "value": "7" }]`; the request's query string passes through.
- Path-pattern characters `( ) { } : * + ?` are escaped with `\\` in `source` (the export does this).
- **Limit: 2,048 redirects** in the array, 4,096 characters per source/destination. Above that use **bulk redirects** (`bulkRedirectsPath`, CSV/JSON — Pro and Enterprise only; Pro includes 1,000, more can be bought; no wildcards) or a function/middleware.
- www → apex and other domain redirects: Project → Domains in the dashboard.
- Docs: https://vercel.com/docs/routing/redirects/configuration-redirects and https://vercel.com/docs/routing/redirects/bulk-redirects

## Next.js — `next.config.js`
- `async redirects() { return [{ source, destination, permanent: true }] }` — same syntax and escaping as Vercel; `permanent: true` = 308. Query values pass through to the destination.
- Redirects run before pages and `/public` files. On Vercel the 2,048 limit above applies.
- If the project has a `basePath`, sources are prefixed automatically.
- Docs: https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects

## Apache — `.htaccess`
- Uses mod_rewrite: `RewriteRule ^old-page/?$ /new-page [R=301,L]`. In `.htaccess` the pattern has **no leading slash**. Folder-style paths also match with a trailing slash; file-like paths (`.html`) match exactly.
- 410: `RewriteRule ^old/?$ - [G,L]`. Query strings: a `RewriteCond %{QUERY_STRING} ^id=7$` line before the rule, and `QSD` (Apache 2.4+) so the old query isn't copied to the new URL.
- Put the block **above** WordPress/CMS rules. A syntax error in `.htaccess` gives a 500 error for the whole site — test on staging and keep a backup.
- Targets that contain `$` or `%` are skipped (mod_rewrite reads them as back-references) — write those by hand.
- Docs: https://httpd.apache.org/docs/2.4/rewrite/flags.html

## nginx
- `location = /old-page { return 301 /new-page; }` (exact match). 410: `return 410;`. Old URLs with a query string use `if ($request_uri = "/old.php?id=7") { return 301 /new; }` in the `server` block.
- Paste into the `server { }` block that serves the old URLs, then `nginx -t` and reload. For thousands of rows a `map` block is faster — ask a developer.
- Docs: https://nginx.org/en/docs/http/ngx_http_rewrite_module.html#return

## Cloudflare — Bulk Redirects CSV
- **No header row.** Columns: source URL, target URL, status (default 301; 301/302/307/308), preserve query string, include subdomains, subpath matching, preserve path suffix. Booleans `TRUE`/`FALSE`; quote URLs that contain commas.
- Source URLs need the host (`example.com/old`) — use `--old-domain` when the map has paths only. Without a scheme they match http and https.
- Can't return 410 and are static (no regex). Query-string sources: use a Single Redirect rule.
- Limits (URL redirects across lists): Free 10,000 · Pro 25,000 · Business 50,000 · Enterprise 1,000,000 (default).
- Docs: https://developers.cloudflare.com/rules/url-forwarding/bulk-redirects/reference/csv-file-format/ and https://developers.cloudflare.com/rules/url-forwarding/

## Shopify — URL redirects CSV
- Header `Redirect from,Redirect to`; "from" is a path like `/pages/old`, "to" a path or full URL.
- Import: Shopify admin → **Content → Menus → URL redirects → Import** (a sample template is offered there).
- Redirects **only work when nothing is live at the old path** (they act on broken URLs). Shopify answers 404 for removed pages, so 410 rows are skipped.
- Limit: 100,000 redirects (Plus: 20,000,000). No status column — every row is a permanent redirect.
- Docs: https://help.shopify.com/en/manual/online-store/menus-and-links/url-redirect

## WordPress — Redirection plugin CSV
- **No header row.** `source,target,regex,code` — regex `0` = plain match. Columns are comma-separated; quotes may wrap a value.
- Import: WordPress admin → **Tools → Redirection → Import/Export**.
- The CSV import takes redirect codes (301–308) only: add 410 rows by hand in the plugin. For old URLs with a query string, check the plugin's query parameter option after import.
- Docs: https://redirection.me/support/import-export-redirects/

## Webflow
- Site settings → **Publishing → 301 redirects**: "Old path" and "Redirect to page". CSV **Import** is there too (two columns: old path, new path; max 16 MB). **An import replaces all existing redirects** — export the current ones first and add them to the file. Webflow does not publish the header names; if its export uses different ones, copy them.
- Wildcards use regex capture groups: old path `/blog/(.*)` → `/articles/%1`. Characters like `?`, `=`, `&` are escaped with `%` (e.g. `/%?category%=(.*)`), so rows with special characters are left for a hand-made rule.
- Redirects need a paid site plan and work after you publish (not on the webflow.io staging domain).
- Docs: https://help.webflow.com/hc/en-us/articles/33961211526291 (import/export)

## Framer
- Site Settings → **Hosting → Redirects**: add the old URL and the new URL, one at a time, then publish. No CSV import in the settings — the export is a clean list to copy from (a Framer Marketplace redirects plugin may help for long lists).
- Wildcards: `*` matches any path, and `:1`, `:2` insert the matched parts (`/blog/*` → `/articles/:1`).
- Docs: https://www.framer.com/help/articles/how-to-setup-redirects-to-maintain-seo-ranking/

## Turning many rows into one rule
`check` suggests a pattern when many rows only swap a folder (e.g. `/news/*` → `/blog/*`). Use a wildcard rule only if **every** page in that folder follows the pattern, and keep exact rules above it:

| Platform | Wildcard rule |
|---|---|
| Netlify | `/news/*  /blog/:splat  301` |
| Vercel / Next.js | `{ "source": "/news/:path*", "destination": "/blog/:path*", "permanent": true }` |
| Apache | `RewriteRule ^news/(.*)$ /blog/$1 [R=301,L]` |
| nginx | `location ^~ /news/ { rewrite ^/news/(.*)$ /blog/$1 permanent; }` |
| Webflow | `/news/(.*)` → `/blog/%1` |
| Framer | `/news/*` → `/blog/:1` |
| Shopify / Cloudflare bulk | No wildcards — list every URL (Cloudflare: subpath matching can cover a folder) |
