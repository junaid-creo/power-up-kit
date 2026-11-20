# Contributing to Power-Up Kit

Thanks for helping! The kit's promise is simple: **finished work, checked, no invented numbers.** Every contribution should keep that promise.

## Repository layout

```text
.claude-plugin/marketplace.json   the catalogue Claude Code and the Claude app read
plugins/
  power-up-kit/                   bundle — only dependencies, no skills
  powerup-core/                   memory, doctor, proof-check, hooks
  powerup-seo/ powerup-design/ powerup-agency/
    .claude-plugin/plugin.json    name, version, description, dependencies
    .claude-plugin/icon.png       512×512 (npm run icons)
    skills/<skill>/SKILL.md       instructions + frontmatter
    skills/<skill>/scripts/       zero-dependency Node.js scripts
    skills/<skill>/reference/     detail loaded only when needed
    evals/<case>/                 behaviour tests for `claude plugin eval`
shared/                           code copied into skills (edit here, then npm run sync)
scripts/                          validate, sync, build ZIPs, make icons
tests/                            node:test unit + end-to-end tests, fixture website
docs/                             user documentation
```

## Rules for skills

1. **Frontmatter:** only `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`. Anything else breaks uploads to the Claude app. `name` must equal the folder name (lowercase-with-dashes).
2. **Description:** what it does, then "Use when …" with the words real users say. Max 1024 characters, no `<` or `>`.
3. **Short SKILL.md:** the steps Claude must follow. Detail goes in `reference/` files linked from SKILL.md.
4. **Works everywhere:** say what to do in Claude Code *and* in the Claude app (no `.powerup/` folder, sandbox may not reach websites).
5. **Proof, not claims:** if a skill says something passed, it must have measured it. Report what wasn't checked.
6. **No invented data:** prices, rankings, traffic and dates come from the user, `.powerup/` files or real tools — otherwise use a visible placeholder.
7. **No secrets:** never ask for or store passwords, keys or card numbers.

## Rules for scripts

- Node.js 18+, **zero dependencies**, ESM (`.mjs`), works on macOS, Linux and Windows.
- Print compact JSON to stdout; write big data to files. Never throw on bad network input — report it.
- Read-only unless writing is the point. Polite network use: identify with `USER_AGENT`, respect robots.txt, small concurrency.
- Shared code lives in `shared/`. Edit it there, then `npm run sync` copies it into every skill that uses it.
- Reference scripts from SKILL.md as `node "${CLAUDE_SKILL_DIR}/scripts/<file>.mjs"` and pre-approve that exact form in `allowed-tools`.

## Before you open a pull request

```bash
npm run check
```

That runs the shared-file sync check, `scripts/validate.mjs` (marketplace, manifests, skill frontmatter, links, secrets, and `claude plugin validate --strict` when the `claude` CLI is on your PATH or `CLAUDE_BIN` is set) and all tests.

Add a test in `tests/` for script changes (the fixture site in `tests/fixtures/site` has planted problems — add more if you need them).

### Evals (behaviour tests)

Each plugin has cases in `plugins/<plugin>/evals/`. They run real Claude sessions, so they use your plan's usage — run them when you change a skill's instructions:

```bash
claude plugin eval plugins/powerup-agency --trust-plugin --allow-tools Write
```

```bash
claude plugin eval plugins/powerup-core --trust-plugin --scaffold --allow-tools Write Edit
```

Use `--max-cost-usd` to cap spend and `--runs 1` while iterating.

## Releasing (maintainers)

1. Bump `version` in every changed `plugins/*/.claude-plugin/plugin.json` and in `marketplace.json`; update `CHANGELOG.md`.
2. `npm run check`
3. Tag and push: `git tag v0.2.0 && git push --tags`. The Release workflow builds the ZIPs and publishes them.
