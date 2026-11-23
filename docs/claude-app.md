# Using Power-Up Kit in the Claude app

For designers, SEO specialists and account managers who use Claude at claude.ai or in the desktop app's chat — no terminal needed.

## Install (once, about 2 minutes)

**Words you'll see:** a **plugin** adds new skills to Claude. A **marketplace** is a list of plugins — this kit's list lives on GitHub at `junaid-creo/power-up-kit`. The kit is split into **packs** (`powerup-core`, `powerup-seo`, `powerup-design`, `powerup-agency`); you add the ones for your role.

**Before you start:** plugins need a paid Claude plan — **Pro, Max, Team or Enterprise**. Claude can't install plugins for you in the app, so you do these steps yourself, once.

1. **Open Claude** — [claude.ai](https://claude.ai) in your browser, or the Claude desktop app — and sign in.
2. **Open the Plugins page.** In the left sidebar, click **Customize**, then **Plugins**.
3. **Add the kit's marketplace.** Click **Add** → **Add marketplace**. Paste this and confirm:

   ```text
   junaid-creo/power-up-kit
   ```

4. **Add your packs.** Click **Discover**. Find each pack below, open it and click **Add** (some versions of the app call the button **Install**):

   | You are | Add these packs |
   |---|---|
   | Web designer / designer | `powerup-core` · `powerup-design` · `powerup-agency` |
   | Developer | `powerup-core` · `powerup-seo` · `powerup-agency` |
   | SEO team | `powerup-core` · `powerup-seo` |
   | Agency, or you want everything | `powerup-core` · `powerup-seo` · `powerup-design` · `powerup-agency` |

   - Always add **`powerup-core`** — the other packs need it.
   - You'll also see `power-up-kit`, `power-up-designers`, `power-up-developers` and `power-up-seo-team`. **Skip those** — they are shortcuts for Claude Code and add nothing in the app.
   - You don't need the ZIP files from GitHub.

5. **Check it works.** Start a new chat and say: **"Run the Power-Up Kit doctor."** You can also type **/** in the message box to see the kit's skills.

That's it. The packs now work in every chat, in Cowork, and in Claude Code if you sign in there with the same account.

**Optional:** connect your tools — Search Console, Ahrefs, Semrush, Figma, Webflow, Firecrawl — under **Customize → Connectors** ([how](connectors.md)). Without them, Claude marks traffic and ranking numbers as "not checked" instead of guessing.

### If something doesn't look right

| You see | Do this |
|---|---|
| No **Customize** or **Plugins** | Plugins need a Pro, Max, Team or Enterprise plan. On a free plan, upgrade first. |
| No **Add marketplace** (company account) | Your Claude admin has turned off members' own plugins (**Organization settings → Plugins & skills → Policy → User-created skills**). Ask them to turn it on, or to add the kit for the whole company. |
| "Skills must be enabled in order to use plugins" | Your admin has turned Skills off for the organization. Ask them to turn it on. |
| Claude says it can't run the kit's scripts | **Settings → Capabilities** → turn on **Code execution and file creation**. |
| Claude says it can't install plugins, or offers ZIP files | Normal in the app — follow the steps above yourself. |

### Update or remove

- **Get new versions:** **Customize → Plugins** → **Check for updates**, or turn on **Sync automatically** so updates arrive by themselves.
- **Turn a pack off:** open it and use the **Disable plugin** toggle — you can turn it back on any time.
- **Remove a pack:** open it → its menu → **Remove**.

**Shared accounts:** everything you add is on for *everyone who logs in to the same account*. On a Team plan each person has their own login and adds the kit for themselves (or the admin adds it for everyone).

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
