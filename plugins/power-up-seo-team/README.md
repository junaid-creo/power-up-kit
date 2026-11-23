# Power-Up Kit — for SEO teams

The Power-Up Kit packs for SEO teams, in one install. This plugin has no skills of its own — it lists the packs as dependencies, and Claude Code installs them for you:

- **powerup-core** — client memory, doctor, proof-check, safety hooks
- **powerup-seo** — SEO audits, content briefs, meta and schema, redirect maps, monthly reports

```bash
claude plugin install power-up-seo-team --marketplace junaid-creo/power-up-kit
```

Then type `/reload-plugins` (or restart Claude Code) and ask Claude to "run the Power-Up Kit doctor".

**Claude app (claude.ai, desktop chat):** this bundle adds nothing there — add the packs instead (Pro, Max, Team or Enterprise plan):

1. Left sidebar: **Customize** → **Plugins**.
2. **Add** → **Add marketplace** → paste `junaid-creo/power-up-kit` → confirm.
3. **Discover** → open each pack and click **Add**: `powerup-core`, `powerup-seo`.
4. Start a new chat and say "Run the Power-Up Kit doctor".

[Step by step, with help for company accounts](https://github.com/junaid-creo/power-up-kit/blob/main/docs/claude-app.md#install-once-about-2-minutes)

Full documentation: https://github.com/junaid-creo/power-up-kit
