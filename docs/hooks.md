# Hooks (Claude Code only)

Hooks are small scripts Claude Code runs automatically. Skills are suggestions Claude can follow; hooks are rules that always apply. The **powerup-core** pack adds four, all in `plugins/powerup-core/hooks/`. They need Node.js 18+, are fast (one short Node process), and never break a session — if something unexpected happens they let the action through.

The Claude app's chat ignores hooks. Cowork runs them.

## 1. Client memory at session start (`SessionStart`)

If the project has `.powerup/active-client`, Claude gets one short message: who the client is (the **Summary** line from `profile.md`) and where their files are. Nothing is printed when there is no `.powerup/` folder, so it costs nothing in other projects.

## 2. Secret-file protection (`PreToolUse`)

Blocks Claude from **reading, searching, editing or printing**:

- `.env`, `.env.local`, `.env.production` and similar (but **not** `.env.example`, `.env.sample`, `.env.template`)
- private keys and certificates: `id_rsa`, `*.pem`, `*.key`, `*.p12`, `*.pfx`
- `credentials.json`, `secrets.*`, `service-account*.json`, `client_secret*.json`, `.aws/credentials`, `.ssh/*`, `.netrc`

Copying a template into place (`cp .env.example .env`) and deleting files still work. Claude is told to ask you to edit the file yourself.

**Turn off:** set `POWERUP_ALLOW_SECRETS=1` in your environment before starting Claude Code.

## 3 + 4. The proof gate (`PostToolUse` + `Stop`)

When Claude edits web files — `.html .css .scss .jsx .tsx .vue .svelte .astro .liquid .twig .php .mdx` and similar — the kit remembers. When Claude then tries to finish its turn **without having checked the result**, it is asked **once** to check first: run the proof-check skill, or open the page in a browser tool and take a screenshot. If it can't (no server, no URL, no browser), it must say so plainly instead of claiming it works.

Any of these counts as checking: the `proof-check` or `seo-audit` skill; running `page-check.mjs`, `pagespeed.mjs`, `seo-crawl.mjs`, `playwright test`, `lighthouse`, `pa11y` or `axe`; or a browser tool screenshot/snapshot/page read.

It never loops: one reminder per batch of edits.

**Turn off:** set `POWERUP_PROOF_GATE=off`.

## See what ran

Run Claude Code with `--debug` and search the log for `powerup-hook`, or use `/hooks` in a terminal session to list active hooks.
