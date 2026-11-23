# Power-Up Kit — for developers

The Power-Up Kit packs for web developers, in one install. This plugin has no skills of its own — it lists the packs as dependencies, and Claude Code installs them for you:

- **powerup-core** — client memory, doctor, proof-check, safety hooks
- **powerup-seo** — SEO audits, content briefs, meta and schema, redirect maps, monthly reports
- **powerup-agency** — proposals, launch checks

```bash
claude plugin install power-up-developers --marketplace junaid-creo/power-up-kit
```

Then type `/reload-plugins` (or restart Claude Code) and ask Claude to "run the Power-Up Kit doctor".

**Claude app:** Customize → Plugins → Add → Add marketplace → `junaid-creo/power-up-kit`, then turn on powerup-core, powerup-seo, powerup-agency.

Full documentation: https://github.com/junaid-creo/power-up-kit
