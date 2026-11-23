---
name: doctor
description: Check that Power-Up Kit and its connectors are set up correctly, and explain how to fix anything missing — Node.js, Claude Code version, browser tool, Firecrawl, Figma, Webflow, Framer, WordPress, Shopify, Search Console, Ahrefs, Semrush, client memory and secret safety. Use right after installing the kit, when a skill or connector doesn't work, or when the user asks "is everything set up?" or "what can you connect to?".
license: MIT
compatibility: Works in Claude Code and the Claude app. The setup script needs Node.js 18+.
allowed-tools: Bash(node "${CLAUDE_SKILL_DIR}/scripts/doctor.mjs" *), Bash(node "${CLAUDE_SKILL_DIR}/scripts/doctor.mjs")
metadata:
  kit: power-up-kit
  version: 0.2.1
---

# Doctor

Find what's missing and give the exact fix. Change nothing without asking.

## 1. Check the computer and project (Claude Code)

```bash
node "${CLAUDE_SKILL_DIR}/scripts/doctor.mjs"
```

It checks Node.js, npx, git, the Claude Code version, internet access, the optional PageSpeed key, the `.powerup/` client memory, and scans that memory for secrets that must not be there. It is read-only.

If `node` isn't found, that is the first fix: install Node.js LTS from https://nodejs.org, then restart Claude.

In the Claude app, skip the script (it checks your computer, which the app can't see). Check that **Settings → Capabilities → Code execution and file creation** is on — skills need it.

## 2. Check your own tools

Look at the tools you (Claude) have in this session and fill this table. Don't guess — only mark ✅ for tools you can see.

| Need | Tool names to look for | Used by |
|---|---|---|
| A browser (screenshots, clicking) | Playwright (`browser_*`), Claude in Chrome, the desktop app's built-in browser | proof-check, brand-sheet, launch |
| Website reading at scale | Firecrawl | seo-audit, content-brief, brand-sheet |
| Design files | Figma | brand-sheet, proof-check |
| Site builders | Webflow, Framer, WordPress, Shopify | build and content work, meta-schema, redirect-map |
| Search data | Google Search Console, Ahrefs, Semrush | seo-audit, content-brief, redirect-map, seo-report |
| Kit skills | proof-check, client-new, seo-audit, content-brief, meta-schema, redirect-map, seo-report, brand-sheet, proposal, launch | — |

## 3. Report

```markdown
## Power-Up Kit check — <date>
**Ready for:** client memory ✅ · proof checks ✅ · SEO audits ⚠️ · SEO reports ⚠️ · brand sheets ✅ · proposals ✅ · launches ✅

| Item | Status | Fix |
|---|---|---|
| Node.js 22.1 | ✅ | |
| Browser tool | ❌ | Add Playwright: `claude mcp add playwright npx @playwright/mcp@latest` |
| Ahrefs | ➖ optional | Connect in Claude → Connectors → Ahrefs (needs Ahrefs Lite plan or higher) |
```

- Put problems first, then optional extras. Mark optional things as **optional**, not as errors.
- Give fixes as copy-paste commands or exact menu paths. Setup details for every connector are in the kit's `docs/connectors.md` (https://github.com/junaid-creo/power-up-kit/blob/main/docs/connectors.md).
- Any secret found in `.powerup/` is the most urgent item: tell the user which file, and offer to remove it.
- End with the single most useful next step (e.g. *"Add a browser tool so proof checks can take screenshots."*).
