# Changelog

## 0.2.1 — 2026-11-23

Installing is now one question: paste the repository link into Claude, say who you are, done.

### Added
- **Role bundles:** `power-up-designers` (core, design, agency), `power-up-developers` (core, SEO, agency) and `power-up-seo-team` (core, SEO), next to `power-up-kit` for agencies and everything. Each installs its packs with one command in Claude Code.
- **"Install — just ask Claude"** in the README: Claude asks one question (designer, developer, SEO team, agency, all) and runs the install itself in Claude Code. In the Claude app, where Claude can't add plugins, it gives the two clicks instead of making ZIP files.

### Changed
- Release ZIPs leave out the bundles. An uploaded ZIP doesn't install dependencies in the Claude app, so a bundle ZIP installed nothing.
- Install guide, Claude app guide and troubleshooting start with the role table.

## 0.2.0 — 2026-11-23

Five new skills: the SEO pack grows from one skill to five, and the agency pack gets a launch pipeline.

### Added
- **`content-brief`** (SEO): compares the pages that rank for a keyword — length, headings, shared subtopics, questions, schema, dates — and writes a brief with title, H1 and meta options, an outline, the angle competitors miss, internal links and trust notes. Checks Search Console for a page that already competes for the keyword. Never invents search volume or difficulty.
- **`meta-schema`** (SEO): scans current titles, meta descriptions, Open Graph tags and JSON-LD; writes new ones and checks them (length, estimated pixel width, duplicates, placeholders, required schema fields, self-serving review stars); outputs paste-ready code and steps for WordPress, Webflow, Framer, Shopify, Next.js and plain HTML.
- **`redirect-map`** (SEO): matches old URLs to new ones for redesigns and migrations (exact path, same slug, similar words, optional title check), flags unsure rows instead of sending them to the homepage, checks for chains and loops, exports for Netlify, Vercel, Next.js, Apache, Nginx, Cloudflare, Shopify, WordPress, Webflow and Framer, and verifies redirects on the live site.
- **`seo-report`** (SEO): monthly client report — compares two crawls and two Search Console periods (CSV exports or the connector), finds top movers and striking-distance keywords, adds work done and next steps, and renders a branded, printable page. Missing data is marked "Not connected".
- **`launch`** (agency): go-live pipeline — `launch-check.mjs` catches noindex and robots.txt blocks, staging URLs in links, canonicals and sitemaps, soft 404s, placeholder text, missing analytics, consent and legal pages, and broken redirects; then a go / no-go with evidence, client sign-off, platform launch-day steps and week-1 / month-1 follow-ups.

### Changed
- **Proof gate** ignores test files, fixtures and dependencies (`tests/`, `__tests__/`, `fixtures/`, `node_modules/`, `*.test.*`, `*.spec.*`), lists each changed file once, and counts the `launch` skill and `launch-check.mjs` as real checks.
- **Secret guard rail:** a regex such as `.*` inside a quoted script (`node -e '…'`, `python -c "…"`) no longer counts as a file glob — the shell never expands it. Quoted globs that name something, such as `.e*`, are still blocked, and so is every unquoted glob that reaches a secret file.
- `seo-audit` now leaves monthly client reports to `seo-report`.
- The doctor lists the new skills and the connectors they use.
- Docs: Search Console CSV exports work without a connector; FAQ rich results are no longer shown by Google (since 7 May 2026), so no skill promises them.

## 0.1.1 — 2026-11-20

Fixes from an independent review of 0.1.0.

### Security
- **Secret-file guard rail rebuilt.** Any shell command that mentions a secret file is now blocked unless it is a known-safe action (`ls`, `rm`, `cp .env.example .env`, `echo .env >> .gitignore`, `git status`/`commit`, `node --env-file`, searching *for* the name). Closes the bypasses found in review: `sort`, `cut`, globs like `.e*` and `*.json`, `<` redirection, `$(…)`, `xargs`, and `python -c` / `node -e` one-liners. Copying a secret *out* (`cp .env /tmp/x`, `rsync`, `scp`) and `git add`/`diff`/`show` of a secret are blocked too.
- **More secret files covered:** `wp-config.php`, `.npmrc`, `.envrc`, `.dev.vars`, `*.tfvars`, `.pgpass`, `.git-credentials`, Composer `auth.json`, `.htpasswd`.
- **Fewer false alarms:** ordinary words such as "secret" or "credentials", docs like `credentials.md`, commit messages and `grep` patterns that mention `.env` are no longer blocked.
- **Docs now say what the guard rail is:** best effort, not a security boundary — with Claude Code permission deny rules and sandbox settings for a hard guarantee ([docs/hooks.md](docs/hooks.md#a-hard-guarantee)).

### Fixed
- **Proof gate** now notices web files changed through the shell (`sed -i`, `perl -pi`, redirection, `tee`, `cp`/`mv`, `prettier --write` …), and only clears on a real check — merely mentioning a tool (`npm i lighthouse`) no longer counts.

### Added
- CI on macOS, Linux and Windows, and a release workflow that publishes ZIPs for the Claude app.

## 0.1.0 — 2026-11-20

First public version.

### Added
- **Marketplace** `power-up-kit` with a one-command bundle and four packs.
- **powerup-core:** `client-new`, `client-switch`, `client-note`, `agency-profile`, `doctor`, `proof-check`; hooks for client memory at session start, secret-file protection and the proof gate.
- **powerup-seo:** `seo-audit` with a polite crawler (robots.txt, sitemaps, redirect chains, click depth), 30 checks, a 0–100 score, Google PageSpeed and optional Search Console / Ahrefs / Semrush data.
- **powerup-design:** `brand-sheet` with colour roles, WCAG contrast, fonts, logo candidates, tone-of-voice samples and a printable HTML sheet.
- **powerup-agency:** `proposal` with three pricing options, a checker (placeholders, totals, currencies, expiry) and a branded printable page.
- `proof-check`: `vitals-snippet.js` measures speed in a real browser when PageSpeed can't run; links to sites that block bots (e.g. LinkedIn's "999") are reported as "check by hand", not broken.
- A real audit of a live website in `examples/`.
- Tests for every script against a fixture website, and eval cases for every pack. (The CI and release workflows were written for 0.1.0 but only published in 0.1.1.)
