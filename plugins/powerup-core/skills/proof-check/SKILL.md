---
name: proof-check
description: Check web work with real evidence before calling it done — opens the page, takes desktop and mobile screenshots, and tests links, SEO basics, accessibility and speed. Use after building or changing a website, landing page, theme or component, before launch, or whenever the user asks "does it work?", "check this page", "QA this", or "is it ready?".
license: MIT
compatibility: Works in Claude Code and the Claude app. Scripts need Node.js 18+. Screenshots need a browser tool (Playwright MCP, Claude in Chrome or the Claude desktop browser).
allowed-tools: Bash(node "${CLAUDE_SKILL_DIR}/scripts/page-check.mjs" *), Bash(node "${CLAUDE_SKILL_DIR}/scripts/pagespeed.mjs" *)
metadata:
  kit: power-up-kit
  version: 0.2.0
---

# Proof check

Never say web work "works", "looks good" or "is ready" without proof. This skill collects the proof and reports it honestly — including what could **not** be checked.

## 1. Decide what to check

- **Target:** the URL of the page (live site, preview link or local dev server such as `http://localhost:3000`). If there is no URL, use the HTML file. If several pages changed, check each one (max 5, ask before more).
- **What changed:** list the files or features that changed in this session. The check must cover them.
- **Client rules:** if a client profile is active (`.powerup/active-client` in the project, or client files in this Claude Project), read its `brand.md` so you can check colours, fonts and logo too.

If a local server is needed and not running, start it (e.g. `npm run dev`) in the background, or ask the user how to run the site.

## 2. Run the automatic checks

Run the page check (scripts are in this skill's `scripts/` folder):

```bash
node "${CLAUDE_SKILL_DIR}/scripts/page-check.mjs" <url-or-file> --summary
```

- Drop `--summary` to see every check.
- For a local HTML file add `--base-url <live-url>` to test its links.
- Add `--external` to test external links too.

For a **public** URL, also run Google's speed test (mobile first):

```bash
node "${CLAUDE_SKILL_DIR}/scripts/pagespeed.mjs" <public-url> --strategy mobile
```

If it says the quota is reached, tell the user how to add a free `PAGESPEED_API_KEY` (see the kit's docs/connectors.md) and continue without it.

Links listed under `links-unverified` (e.g. LinkedIn, which answers bots with "999") are not broken — list them for the user to open by hand.

In the Claude app, the sandbox may not reach the website. Then fetch the page with your web tool, save the HTML to a file and run `page-check.mjs` on the file.

## 3. Look at the page like a human

If you have a browser tool (Playwright, Claude in Chrome, or the desktop app's browser):

1. Open the page at **desktop width (1440 px)** and take a screenshot.
2. Resize to **mobile width (390 px)** and take a screenshot.
3. Read the browser console — note any red errors.
4. Run `scripts/a11y-snippet.js` in the page (see the comment at the top of that file for how) and keep the result.
   - **Speed without PageSpeed** (local site, login, or quota used up): reload the page, wait ~5 seconds, run `scripts/vitals-snippet.js`. Trust its **timings** only if the browser tab was visible on screen — background tabs delay drawing and pause animations. If you can't confirm that, report the timings (and animated areas) as not checked; page weight and request counts are still valid.
5. Click through what changed: menus, forms (don't submit real data), buttons, links in the changed area.
6. If a brand or Figma design exists, compare: colours, fonts, spacing, logo. Note every visible difference.

No browser tool? Say so in the report and suggest one (see the kit's docs/connectors.md). Do not guess what the page looks like.

## 4. Fix, then check again

If something fails and it's part of the work you were asked to do, fix it and re-run the failed checks. Don't fix unrelated problems silently — list them for the user.

## 5. Report with evidence

Use this format (keep it short; details go in a file only if the user wants one):

```markdown
## Proof check — <page> — <date>
**Verdict:** ✅ Ready / ⚠️ Ready with warnings / ❌ Not ready

| Check | Result | Evidence |
|---|---|---|
| Page loads | ✅ | HTTP 200 in 340 ms |
| Mobile layout | ⚠️ | Screenshot: menu overlaps logo at 390 px |
| Links | ✅ | 38/38 internal links OK |
| … | | |

**Fixed during this check:** …
**Still to fix:** … (most important first)
**Not checked:** … (and why — e.g. no browser tool, page is not public)
```

Rules:
- Every ✅ needs evidence you actually saw (a number, a screenshot, a script result).
- Anything you didn't check goes under **Not checked** — never mark it ✅.
- Keep screenshots as files and mention their paths.

For what each check means and the pass/warn/fail thresholds, see [reference.md](reference.md).
