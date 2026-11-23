# Power-Up Kit — for designers

The Power-Up Kit packs for web designers and designers, in one install. This plugin has no skills of its own — it lists the packs as dependencies, and Claude Code installs them for you:

- **powerup-core** — client memory, doctor, proof-check, safety hooks
- **powerup-design** — brand sheets
- **powerup-agency** — proposals, launch checks

```bash
claude plugin install power-up-designers --marketplace junaid-creo/power-up-kit
```

Then type `/reload-plugins` (or restart Claude Code) and ask Claude to "run the Power-Up Kit doctor".

**Claude app:** Customize → Plugins → Add → Add marketplace → `junaid-creo/power-up-kit`, then turn on powerup-core, powerup-design, powerup-agency.

Full documentation: https://github.com/junaid-creo/power-up-kit
