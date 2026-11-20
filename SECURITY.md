# Security

## Reporting a problem

Please **don't** open a public issue for security problems. Use GitHub's private reporting: **Security → Report a vulnerability** on this repository. You'll get a reply within 7 days.

## What the kit can do on your computer

Before you install any plugin, you should know what it does. Power-Up Kit:

- **Runs Node.js scripts** from its own folders when a skill or hook needs them. All source is in this repository; there are no dependencies to download and no install scripts.
- **Reads and writes files** in your project: the `.powerup/` memory folder and reports you ask for.
- **Makes network requests only when you run a skill:** to the website you asked it to audit (as `PowerUpKit/<version>`, respecting robots.txt), to Google PageSpeed Insights (sending the public URL being tested), and — when you open a generated brand sheet or proposal — Google Fonts.
- **Sends no telemetry** and has no server of its own.
- **Adds hooks in Claude Code** that block access to secret files and remind Claude to check web changes. See [docs/hooks.md](docs/hooks.md).

## Keeping client data safe

- Never store passwords, API keys, tokens, card or bank numbers in `.powerup/`. The `doctor` skill scans for them.
- If you commit `.powerup/` to a **public** repository, everything in it is public — including prices in `agency.md`.
- Connectors such as Ahrefs, Semrush, Search Console and site builders act with your account's permissions. Connect only what you're comfortable with Claude using.
- Only crawl and audit websites you own or have permission to audit.
