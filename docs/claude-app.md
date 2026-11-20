# Using Power-Up Kit in the Claude app

For designers, SEO specialists and account managers who use Claude at claude.ai or in the desktop app's chat — no terminal needed.

## Set up (once)

1. **Settings → Capabilities →** turn on **Code execution and file creation**.
2. Install the packs: **Customize → Plugins → Add marketplace** → `junaid-creo/power-up-kit` (details in [install.md](install.md)).
3. Optional but useful: connect Firecrawl, Figma, Webflow, Ahrefs or Semrush under **Customize → Connectors** ([connectors.md](connectors.md)).

## Client memory with Claude Projects

The chat has no project folder, so each client lives in its own **Claude Project**:

1. Say *"New client: Crumb & Co, website crumb.example"*. Claude asks a few questions and gives you five files: `profile.md`, `brand.md`, `voice.md`, `seo.md`, `decisions.md`.
2. Create a Project called **Client: Crumb & Co** and add the five files to the Project.
3. Chat inside that Project from now on — Claude knows the client every time.
4. When Claude saves a decision (*"remember that…"*), it gives you an updated file. Replace the old one in the Project.

Your own agency details: run *"Set up my agency profile"* and add `agency.md` to each client Project (or one "Agency" Project).

## What's different from Claude Code

| | Claude app chat | Claude Code |
|---|---|---|
| Skills | ✅ | ✅ |
| Client memory | Claude Projects | `.powerup/` folder, loaded automatically |
| Scripts | Run in Claude's sandbox | Run on your computer |
| Website access from scripts | Often blocked by the sandbox — skills fall back to Claude's web tools | ✅ |
| Hooks (secret protection, proof gate) | ❌ not run in chat | ✅ |
| Screenshots | Only with a browser connector | Playwright, Claude in Chrome or the desktop browser |

If an audit says it ran in "sampled" mode, the sandbox couldn't reach the site and Claude checked a set of pages through its web tools instead. For full crawls, use Claude Code.
