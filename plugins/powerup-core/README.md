# Power-Up Kit — Core

The base pack every other Power-Up Kit pack builds on.

**Skills**
- `client-new`, `client-switch`, `client-note` — per-client memory (profile, brand, voice, SEO, decisions) saved in `.powerup/` in your project, or in Claude Projects in the Claude app.
- `agency-profile` — your own business details for proposals and reports.
- `doctor` — checks Node.js, Claude Code, connectors and client memory, and gives exact fixes.
- `proof-check` — evidence-based QA of a web page: status, links, SEO and accessibility basics, speed (Google PageSpeed or measured in the browser) and screenshots.

**Hooks (Claude Code only)** — load the active client at session start; a best-effort guard rail against reading, printing or overwriting secret files such as `.env`, keys and `wp-config.php`; and a once-per-change reminder to check web edits (made with edit tools or the shell) before saying they work. Switch off with `POWERUP_ALLOW_SECRETS=1` or `POWERUP_PROOF_GATE=off`. For an airtight secret block, see the "hard guarantee" settings in docs/hooks.md.

Requires Node.js 18+ for scripts and hooks. Docs: https://github.com/junaid-creo/power-up-kit
