# Troubleshooting

First step for anything: ask Claude to **"run the Power-Up Kit doctor"**. It checks your setup and gives exact fixes.

## Install

| Problem | Fix |
|---|---|
| `unknown option '--marketplace'` | Your Claude Code is older than 2.1.292. Run `claude update`, or use the two-command install in [install.md](install.md). |
| `claude: command not found` | You're using the desktop app, which bundles Claude Code. Install inside a Claude Code chat with `/plugin install power-up-kit --marketplace junaid-creo/power-up-kit`, or install the CLI from [code.claude.com](https://code.claude.com/docs/en/setup). |
| Plugin installed but skills don't appear | Run `/reload-plugins` or start a new session. Check `/plugin` → **Installed** and **Errors** tabs. |
| A pack installed, but `client-new` etc. are missing | powerup-core should install automatically as a dependency. Run `claude plugin install powerup-core@power-up-kit`. In the Claude app, turn powerup-core on yourself. |
| No updates arriving | Auto-update is off for community marketplaces. `/plugin` → **Marketplaces** → power-up-kit → turn on auto-update. |

## Scripts and hooks

| Problem | Fix |
|---|---|
| `node: command not found` or "hook error" notices | Install Node.js 18+ (LTS) from [nodejs.org](https://nodejs.org), then restart Claude Code. |
| "Power-Up Kit blocked a command that would read, print or overwrite a secrets file" | Working as intended — Claude must not read secrets. Look at or edit the file yourself, or set `POWERUP_ALLOW_SECRETS=1` if you really need Claude to. If a harmless command was blocked, please [open an issue](https://github.com/junaid-creo/power-up-kit/issues/new?template=bug_report.yml) with the command. |
| Claude keeps saying it must check its work | That's the proof gate after web edits. Let it run proof-check, or tell it there's nothing to check. Turn off with `POWERUP_PROOF_GATE=off`. |
| PageSpeed: "quota reached" | Add a free `PAGESPEED_API_KEY` ([connectors.md](connectors.md#google-pagespeed-insights-key-optional-free)). |
| PageSpeed: "cannot reach local URLs" | Google can only test public URLs. Deploy a preview link, or use a browser tool locally. |
| Crawl finds very few pages | The site may block crawlers in robots.txt (the crawler respects it), render links with JavaScript only, or have no sitemap. Check `skippedByRobots` in the report, and audit key pages with a browser tool. |
| Crawl is slow | Lower `--max`, or raise `--concurrency` (max 8) only on sites you own. |

## Claude app

| Problem | Fix |
|---|---|
| Skills don't run scripts | Turn on **Settings → Capabilities → Code execution and file creation**. |
| "Network error" in an audit | The app's sandbox often can't reach websites. The skill falls back to Claude's web tools and audits a sample. For full crawls, use Claude Code. |
| Claude forgot the client | Chat inside the client's **Project**, and make sure the latest `.md` files are added to it. |
| Uploading a skill ZIP fails with "unexpected key" | You edited the frontmatter. The app allows only `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`. |

## Connectors

| Problem | Fix |
|---|---|
| Connector shows but tools fail | Sign in again: `/mcp` in Claude Code, or disconnect and reconnect in the Claude app. Allow pop-ups. |
| Works in Claude Code, not on claude.ai | Local (stdio) servers such as Playwright only run on your computer. Use a connector with an `https://` URL in the web app. |
| Ahrefs / Semrush "insufficient units" | Those calls use your paid API units. Check your plan. |

Still stuck? [Open an issue](https://github.com/junaid-creo/power-up-kit/issues/new?template=bug_report.yml) with the doctor output (remove anything private).
