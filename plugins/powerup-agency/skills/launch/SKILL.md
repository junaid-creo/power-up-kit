---
name: launch
description: Website go-live checks for new sites, redesigns and relaunches — staging, launch day, +1 week, +1 month. Catches noindex, robots.txt blocks, staging URLs, missing redirects or analytics and placeholder text, with a go / no-go verdict. Use for "we go live tomorrow", "are we ready to launch?", "launch checklist" or "post-launch check".
license: MIT
compatibility: Works in Claude Code and the Claude app. The script needs Node.js 18+ and internet access to the site (real HTTP, not local files). Uses the proof-check skill from powerup-core. The SEO pack skills meta-schema, redirect-map and seo-audit are optional.
allowed-tools: Bash(node "${CLAUDE_SKILL_DIR}/scripts/launch-check.mjs" *)
metadata:
  kit: power-up-kit
  version: 0.2.1
---

# Launch

Small launch mistakes cost the most: one forgotten noindex can hide a new site from Google for weeks. Run the launch as a pipeline — check staging, fix, sign off, go live, check live — with evidence at every step.

Rules:
- **Never call a launch "ready" while a check fails**, unless the user explicitly accepts the risk. Then record it under **Accepted risks** in the sign-off (what, why, who, date). Never quietly downgrade a fail.
- Every claim names its source: script result, URL, screenshot, or the person who checked. What nobody checked goes under **Not checked** — never tick it.
- Never invent numbers (speed scores, traffic, rankings). Only script results, connected tools or files the user gave.
- Only check sites the user owns or has permission to check.

## 0. Set up

Ask in **one** message (skip what you already know):
- What is launching: a **new site**, a **redesign** (same domain, same URLs?), a **migration** (new platform or new URLs) or a **domain change**?
- Staging URL, live domain, and the main host (`www.` or not).
- Platform (Webflow, Framer, WordPress, Shopify, Vercel, Netlify, other) and who controls DNS.
- Launch date and time, and who signs off for the client.

**Client memory:** if a client is active (`.powerup/active-client`, or client files in this Claude Project), read `profile.md` (platform, hosting, analytics, people), `decisions.md` (earlier launch decisions, things the client rejected) and `seo.md` (rules such as "never change URLs without a redirect map", Search Console access). Look for a redirect map in `.powerup/redirects/` (CSV with `old,new` columns).

If URLs change (migration, redesign with new URLs, domain change) and there is no redirect map, build one **before** launch — with the **redirect-map** skill if the SEO pack is installed, otherwise from the old sitemap and the new URL list. Never launch a URL change without a redirect map.

## 1. Pre-launch check on staging

Run the launch check (it's in this skill's `scripts/` folder):

```bash
node "${CLAUDE_SKILL_DIR}/scripts/launch-check.mjs" <staging-url> --phase pre --expect-host <live-host> --redirects .powerup/redirects/<map>.csv
```

- `--max 30` pages by default; `--staging host1,host2` adds staging hosts to look for (e.g. a custom `preview.client.com`); `--redirects` is only needed when URLs change.
- It prints the verdict (`go`, `go-with-warnings`, `no-go`), every fail and warning with evidence and a fix, the passed checks and a `notChecked` list. The full JSON report path is in `fullReport` — open it only for details.
- In the **pre** phase, noindex, a blocking robots.txt and links to the staging host are warnings, because staging should be hidden. They are still **must-do at launch**: list each one under Blockers as "fix at launch" with the platform setting. If they live in code or settings that will go live as-is (custom head code, a canonical pointing at the staging domain), treat them as blockers until someone confirms they are fixed.
- Password-protected staging: the script cannot see inside. Ask for a preview without the password, or check by hand.

**When the script can't run.** Local HTML files are not supported — a launch check needs real HTTP. If the script fails with a network error (often in the Claude app sandbox), or the user only pasted HTML: fetch the homepage and key pages with your web tool if you have one, then do the checks by hand with [reference/launch-checklist.md](reference/launch-checklist.md) and say the check was done by hand.
- From HTML alone you **can** check: meta robots, canonical and og:url, link and asset hosts, placeholder text, title / description / lang / viewport, analytics and consent scripts, which forms exist.
- You **cannot** check: robots.txt, sitemap, redirects, 404 behaviour, https and www, headers, speed, form delivery. Put these under **Not checked**.

Then:
1. Run the **proof-check** skill on the homepage and 3–5 key templates (a service page, a blog or CMS item, the contact/form page, a product or checkout page). Desktop and mobile screenshots.
2. If the SEO pack is installed: **meta-schema** for titles, descriptions and structured data on key pages; **redirect-map** to build or check the map. If not, use proof-check's SEO results and say the deeper SEO review was not done.
3. Go through the manual checklist in [reference/launch-checklist.md](reference/launch-checklist.md) with the user. Give every item an **owner** (agency, client, developer) and a status. Don't tick an item nobody confirmed.

Fix what you can (if you can edit the site) and run the check again.

## 2. Go / no-go

Write the report with [templates/launch-report.md](templates/launch-report.md):
- **Verdict** from the script plus the manual checks: **No-go** if anything fails or a must-have manual item is open; **Go with warnings** if only warnings remain; **Go** when everything passed.
- **Blockers first**, each with evidence (URL, script check id, screenshot) and the fix.
- Warnings the client can accept go in the sign-off as **Accepted risks** — only after the user says so in plain words.
- The **sign-off** block lists what the client approves (content, design, forms, redirects, launch time, rollback plan). Leave the name and date for the client — never fill in an approval yourself.

## 3. Launch day and post-launch check

On launch day, read [reference/launch-day.md](reference/launch-day.md) and follow it: platform go-live steps, live form tests, Search Console, and the week-1 and month-1 follow-ups. The live check (noindex, robots.txt blocks and staging URLs are now **fails**):

```bash
node "${CLAUDE_SKILL_DIR}/scripts/launch-check.mjs" https://<live-domain>/ --phase post --expect-host <live-host> --staging <staging-host> --redirects .powerup/redirects/<map>.csv
```

## 4. Save and follow up

- Save the report as `.powerup/reports/launch-<domain>-<YYYY-MM-DD>.md` (in the Claude app, as a downloadable file). The script's JSON sits next to it.
- If a client is active, add to `decisions.md`: `<date> — Launched on <date> (<live domain>). Follow-ups: week 1 <date + 7 days>, month 1 <date + 30 days>.` Add a line for each accepted risk. Update `profile.md` (website, platform, analytics) if they changed.
- Remind the user of the week-1 and month-1 follow-ups in [reference/launch-day.md](reference/launch-day.md).

Offer next steps: the **seo-audit** skill in a month (compare with the pre-launch audit), an **seo-report** for the client, **redirect-map** if 404s appear in Search Console, **proof-check** after each fix, and **client-note** to save launch decisions.
