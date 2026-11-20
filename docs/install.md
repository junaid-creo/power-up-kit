# Install Power-Up Kit

| You use | Fastest way |
|---|---|
| Claude Code (terminal, desktop app, VS Code, JetBrains) | `claude plugin install power-up-kit --marketplace junaid-creo/power-up-kit` |
| Claude app (claude.ai, desktop chat, Cowork) | Customize → Plugins → Add marketplace → `junaid-creo/power-up-kit` |
| Cursor, Codex and other tools | `npx skills add junaid-creo/power-up-kit` |

## Claude Code

### Everything, one command

```bash
claude plugin install power-up-kit --marketplace junaid-creo/power-up-kit
```

Needs Claude Code **2.1.292+** (check with `claude --version`, upgrade with `claude update`). Inside a Claude Code chat, the same works as `/plugin install power-up-kit --marketplace junaid-creo/power-up-kit` (2.1.275+).

`power-up-kit` is a bundle: it installs **powerup-core**, **powerup-seo**, **powerup-design** and **powerup-agency** as dependencies.

### Only some packs

```bash
claude plugin install powerup-seo --marketplace junaid-creo/power-up-kit
```

Any pack also installs **powerup-core** automatically.

### Older Claude Code versions (two commands)

```bash
claude plugin marketplace add junaid-creo/power-up-kit
```

```bash
claude plugin install power-up-kit@power-up-kit
```

### For a whole team

Each person runs the install once with `--scope project` inside the project folder:

```bash
claude plugin install power-up-kit --marketplace junaid-creo/power-up-kit --scope project
```

This writes the plugin into the project's `.claude/settings.json`; commit that file so the kit is turned on for everyone working in the repository. Commit `.powerup/` too if you want the team to share client memory (never with secrets in it).

### Updates

Auto-update is **off by default** for community marketplaces. Turn it on once: type `/plugin` in Claude Code → **Marketplaces** → **power-up-kit** → turn **auto-update** on.

Or update by hand:

```bash
claude plugin update power-up-kit@power-up-kit
```

Then run `/reload-plugins` in any open session.

### Remove

```bash
claude plugin uninstall power-up-kit@power-up-kit
```

```bash
claude plugin prune
```

`prune` removes the packs that were installed as dependencies. Your `.powerup/` memory files stay in your projects.

## Claude app (claude.ai, desktop chat, Cowork)

1. **Settings → Capabilities →** turn on **Code execution and file creation** (skills need it).
2. **Customize → Plugins → Add marketplace**, paste `junaid-creo/power-up-kit`.
3. Turn on **powerup-core** and the packs you want. If you turn on a pack, turn on **powerup-core** too.

No marketplace access? Download ZIPs from [Releases](https://github.com/junaid-creo/power-up-kit/releases):
- a whole pack: **Customize → Plugins → Add → Upload plugin** with `powerup-seo.zip` (etc.);
- a single skill: **Customize → Skills → + → Upload a skill** with `seo-audit.zip` (etc.).

What works in chat: skills and online connectors. Hooks don't run in chat (they do in Cowork and Claude Code). See the [Claude app guide](claude-app.md).

Plugins you turn on in the Claude app also appear in Claude Code when you sign in with the same account, and they update automatically.

## Other AI tools

```bash
npx skills add junaid-creo/power-up-kit
```

This uses the community [`skills`](https://github.com/vercel-labs/skills) installer and copies the **skills only** (no hooks) into Cursor, Codex, Claude Code and other supported tools. Pick single skills with `--skill seo-audit`.

## After installing

Ask Claude: **"Run the Power-Up Kit doctor."** Then: **"Set up my agency profile"** and **"New client: …"**.
