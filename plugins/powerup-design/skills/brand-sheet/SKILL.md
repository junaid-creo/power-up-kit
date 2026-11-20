---
name: brand-sheet
description: Build a brand sheet from a website, brand guide, Figma file or brief — colours with roles and WCAG contrast checks, fonts, logo, and tone of voice — as a printable page, and save it to the client's memory. Use when the user asks for a brand sheet, style guide, brand colours or fonts of a site, "what's their branding?", or when starting design work for a client with no brand.md yet.
license: MIT
compatibility: Works in Claude Code and the Claude app. Scripts need Node.js 18+ (and internet access for websites). Figma is optional.
allowed-tools: Bash(node "${CLAUDE_SKILL_DIR}/scripts/extract-brand.mjs" *), Bash(node "${CLAUDE_SKILL_DIR}/scripts/render-sheet.mjs" *)
metadata:
  kit: power-up-kit
  version: 0.1.1
---

# Brand sheet

Turn scattered brand clues into one clear sheet. Be honest about what is **confirmed** (from the client or their brand guide) and what is a **guess** (read from a website).

## 1. Gather sources (best first)

1. A brand guide or logo files the user attached → these are **confirmed**.
2. Figma, if connected: read the colour styles, text styles and logo frames → confirmed if it's the client's official file.
3. The website → **guesses**. Run:

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/extract-brand.mjs" <url-or-html-file> --out .powerup/reports/<client>-brand-raw.json
   ```

   It returns a palette with likely roles, contrast checks, fonts (and where they come from), logo candidates and copy samples. In the Claude app, if the sandbox can't reach the site, save the page HTML and CSS with your web tool and run the script on the file.

4. If a client is active, read `.powerup/clients/<client>/brand.md` and `voice.md` first — don't overwrite confirmed values with guesses.

## 2. Decide

- **Colours:** pick 3–6 roles: Primary, Secondary, Accent (optional), Background, Text, plus Success/Error only if the site uses them. Merge near-identical shades. Use CSS variable names from the site as hints (`--brand-orange`).
- **Contrast:** check the script's `contrast` list. Any pair rated `fail` that is used for text is a problem to report, with a nearby colour that passes.
- **Fonts:** heading and body families, and where they're loaded from (Google Fonts, Adobe Fonts, self-hosted). If a font is self-hosted or from Adobe, note that licences matter when reusing it.
- **Logo:** choose the best candidate (an SVG or large PNG beats a favicon). If only a favicon or social image exists, say a proper logo file is needed.
- **Tone of voice:** read the headings, calls to action and paragraphs. Describe it in 3 words, then 3 do's and 3 don'ts with examples quoted from the site.

## 3. Make the sheet

Write a small JSON file (format at the top of `scripts/render-sheet.mjs`) and render it:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/render-sheet.mjs" .powerup/reports/<client>-brand.json --out .powerup/reports/<client>-brand-sheet.html
```

Mark each colour `"confirmed": true` only if it came from a confirmed source. Open the HTML in a browser tool if you have one and check it looks right; offer it to the user (they can print it to PDF).

Also give a short markdown summary in the chat:

```markdown
## <Client> brand sheet
| Role | Colour | Confirmed | Contrast |
|---|---|---|---|
| Primary | #C2410C | ⚠️ from website | White text: 4.9:1 AA ✅ |
**Fonts:** Playfair Display (headings) · Inter (body) — Google Fonts
**Logo:** <best file> · **Voice:** warm, local, honest
**Needs the client's OK:** …
```

## 4. Save to memory

If a client is active (or the user names one), update `.powerup/clients/<client>/brand.md` and `voice.md` with the results — keep existing confirmed values, add guesses marked "not confirmed", and add a line to `decisions.md` (e.g. "2026-11-20 — Brand sheet created from website; colours not yet confirmed"). In the Claude app, give the updated files to replace in the client's Project.

Never copy a brand's fonts, logos or images into new work without the client's rights to use them.
