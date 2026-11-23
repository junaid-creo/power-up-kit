# Power-Up Kit — for SEO teams

The Power-Up Kit packs for SEO teams, in one install. This plugin has no skills of its own — it lists the packs as dependencies, and Claude Code installs them for you:

- **powerup-core** — client memory, doctor, proof-check, safety hooks
- **powerup-seo** — SEO audits, content briefs, meta and schema, redirect maps, monthly reports

```bash
claude plugin install power-up-seo-team --marketplace junaid-creo/power-up-kit
```

Then type `/reload-plugins` (or restart Claude Code) and ask Claude to "run the Power-Up Kit doctor".

**Claude app:** Customize → Plugins → Add → Add marketplace → `junaid-creo/power-up-kit`, then turn on powerup-core, powerup-seo.

Full documentation: https://github.com/junaid-creo/power-up-kit
