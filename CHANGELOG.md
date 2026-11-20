# Changelog

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
- Tests for every script against a fixture website, eval cases for every pack, CI on macOS/Linux/Windows, and release ZIPs for the Claude app.
