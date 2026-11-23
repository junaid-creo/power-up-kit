# Hooks (Claude Code only)

Hooks are small scripts Claude Code runs automatically. Skills are suggestions Claude can follow; hooks are rules that always apply. The **powerup-core** pack adds four, all in `plugins/powerup-core/hooks/`. They need Node.js 18+, are fast (one short Node process), and never break a session — if something unexpected happens they let the action through.

The Claude app's chat ignores hooks. Cowork runs them.

## 1. Client memory at session start (`SessionStart`)

If the project has `.powerup/active-client`, Claude gets one short message: who the client is (the **Summary** line from `profile.md`) and where their files are. Nothing is printed when there is no `.powerup/` folder, so it costs nothing in other projects.

## 2. Secret-file guard rail (`PreToolUse`)

> **Best effort, not a security boundary.** It stops the common ways a secret file ends up in the chat. A command that builds a file name the hook can't see (for example from pieces at run time) can still get through. For a hard guarantee, add the settings in [A hard guarantee](#a-hard-guarantee) below.

### Files it protects

- `.env`, `.env.local`, `.env.production`, `prod.env` and similar — but **not** `.env.example`, `.env.sample`, `.env.template`
- `.envrc` (direnv), `.dev.vars` (Cloudflare), `terraform.tfvars` and `*.auto.tfvars`
- `wp-config.php` (WordPress database password and keys) — but not `wp-config-sample.php`
- `.npmrc`, `.pypirc`, `.pgpass`, `.netrc`, `.git-credentials`, `auth.json` (Composer), `.htpasswd`
- private keys and certificates: `id_rsa`, `id_ed25519`, `*.pem`, `*.key`, `*.p12`, `*.pfx`
- `credentials.json`, `secrets.yaml` and similar, `service-account*.json`, `client_secret*.json`, `.aws/credentials`, `.ssh/*`

### What it blocks

- Claude's **Read, Edit and Write** tools on those files, and **Grep** when its path or glob points at them.
- **Any shell command that mentions one of those files** — by name, through a glob such as `.e*` or `*.json` (checked against the real folder), through `<` redirection, inside `$(…)`, or piped into `xargs` — **unless** the command is on the short list of actions that can't reveal the contents:

| Allowed | Why |
|---|---|
| `ls`, `rm`, `touch`, `chmod`, `mkdir`, `test -f`, `stat`, `wc`, `echo`/`printf` | They work with the file, not its contents |
| `cp .env.example .env`, `mv .env .env.backup` | Copying *into* a secret file, or between secret files, exposes nothing. Copying a secret *out* (`cp .env /tmp/x`, `rsync`, `scp`) is blocked |
| `echo .env >> .gitignore` | Writing the *name* somewhere is fine; writing *into* a secret file (`> .env`) is blocked, like the Write tool |
| `git status`, `git check-ignore`, `git ls-files`, `git rm`, `git mv`, `git restore`, `git commit` | They don't print file contents. `git add .env`, `git diff .env` and `git show HEAD:.env` are blocked |
| `node --env-file=.env …`, `docker compose --env-file .env …` | The program loads the file without printing it |
| `grep -rn ".env" docs`, `find . -name .env` | Searching *for the name* is fine; searching *inside* a secret file (`grep KEY .env`) or `find … -exec` is blocked |

Everything else that mentions a secret file — `cat`, `sort`, `cut`, `less`, `source`, `python -c`, `node -e`, `sed`, `awk` and so on — is blocked, and Claude is told to ask you to look at or edit the file yourself.

A regex inside a quoted script, such as `node -e '… /name: (.*)$/ …'`, is not treated as a glob: the shell never expands text in quotes. A quoted pattern that names something, like `glob.glob('.e*')` in a Python one-liner, still counts.

**Turn off:** set `POWERUP_ALLOW_SECRETS=1` in your environment before starting Claude Code.

### A hard guarantee

Claude Code itself can make secret files unreadable. Add this to your project's `.claude/settings.json` (adjust the file list):

```json
{
  "permissions": {
    "deny": ["Read(**/.env)", "Read(**/.env.local)", "Read(**/.env.production)", "Read(**/wp-config.php)", "Read(**/.dev.vars)"]
  },
  "sandbox": {
    "enabled": true,
    "filesystem": {
      "denyRead": ["./.env", "./.env.local", "./.env.production", "./wp-config.php", "./.dev.vars"]
    }
  }
}
```

- `permissions.deny` stops Claude's file tools (Read, Grep, Glob) from opening those files anywhere in the project.
- `sandbox.filesystem.denyRead` stops **shell commands** from reading them, enforced by the operating system. `./` means the project root when this is in the project's `.claude/settings.json`. For secret files in subfolders (monorepos), add entries such as `"./apps/web/.env"`, or a wildcard like `"./**/.env"` (wildcards work fully on macOS; check Claude Code's sandbox docs for Linux and WSL2 limits).

See Claude Code's [permissions](https://code.claude.com/docs/en/permissions.md#read-and-edit) and [sandboxing](https://code.claude.com/docs/en/sandboxing.md) docs. The Power-Up Kit hook stays useful on top: it explains *why* something was blocked, and covers machines where the sandbox isn't on.

## 3 + 4. The proof gate (`PostToolUse` + `Stop`)

When Claude changes web files — `.html .css .scss .jsx .tsx .vue .svelte .astro .liquid .twig .php .mdx` and similar — the kit remembers. That includes changes through Claude's edit tools **and through the shell**: `sed -i`, `perl -pi`, `>`/`>>` redirection, `tee`, `cp`/`mv`/`rsync`, `patch`, and `prettier`/`eslint`/`stylelint --write`/`--fix` on a web file.

Files in test and dependency folders (`tests/`, `__tests__/`, `fixtures/`, `node_modules/`, `vendor/`, `coverage/`) and `*.test.*` / `*.spec.*` files don't count — nobody opens those in a browser, and your test suite checks them.

When Claude then tries to finish its turn **without having checked the result**, it is asked **once** to check first: run the proof-check skill, or open the page in a browser tool and take a screenshot. If it can't (no server, no URL, no browser), it must say so plainly instead of claiming it works.

Only a real check counts:

- the `proof-check`, `seo-audit` or `launch` skill;
- actually running `node …/page-check.mjs <url>`, `pagespeed.mjs`, `seo-crawl.mjs` or `launch-check.mjs`;
- `lighthouse`, `pa11y` or `axe` with a URL, `playwright test`, or an `npm run test:e2e` / `e2e` / `test:a11y` script;
- a browser tool screenshot, snapshot or page read.

Merely mentioning a tool (`npm i lighthouse`, `echo lighthouse`) does not count.

It never loops: one reminder per batch of edits.

**Turn off:** set `POWERUP_PROOF_GATE=off`.

## See what ran

Run Claude Code with `--debug` and search the log for `powerup-hook`, or use `/hooks` in a terminal session to list active hooks.
