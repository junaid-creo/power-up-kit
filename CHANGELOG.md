# Changelog

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
