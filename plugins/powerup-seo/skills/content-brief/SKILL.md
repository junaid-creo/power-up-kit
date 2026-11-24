---
name: content-brief
description: Write an SEO content brief for a blog post, service, location or refreshed page by comparing the pages that rank now — titles, meta, outline, internal links. Never invents search volume. Use for a content brief, article outline, or "help us rank for this keyword".
license: MIT
compatibility: Works in Claude Code and the Claude app. The script needs Node.js 18+ and internet access to the pages, or saved page files. Ahrefs, Semrush, Search Console and Firecrawl are optional connectors.
allowed-tools: Bash(node "${CLAUDE_SKILL_DIR}/scripts/compare-pages.mjs" *)
metadata:
  kit: power-up-kit
  version: 0.2.1
---

# Content brief

A brief tells the writer exactly which page to write, for whom, and why it can beat what ranks today. Base it on evidence: the pages that rank now, the client's own proof, and data from connected tools. **Never invent search volume, keyword difficulty, traffic or rankings.** If no tool gave you a number, it goes under **Not checked**.

## 1. Set up

Ask in **one** message for what is missing (each item can be skipped except the keyword):
- **Keyword or topic** (required) and the market/language (e.g. "Dubai, English").
- **Page type:** blog post, service page, location page, or a rewrite of an existing page.
- **Goal and CTA:** what the reader should do next (call, book, order, sign up).
- **Target URL** if it is a rewrite.

**Client memory:** if a client is active (`.powerup/active-client`, or client files in this Claude Project), read:
- `seo.md` — Keywords table (is this keyword already assigned to a page?), competitors, locations, rules.
- `profile.md` — audience, services, proof (case studies, years, numbers they gave you).
- `voice.md` — tone; `brand.md` — image style; `decisions.md` — things the client approved or rejected.

## 2. Check for a page that already targets this keyword

Two pages on one keyword compete with each other (cannibalization). Check before planning a new page:
- **Search Console connected:** filter the last 3 months by queries containing the keyword and look at which client pages get impressions. If one does, recommend **updating that page** instead of creating a new one.
- **No connector:** ask for an export: Performance → Add filter → Query containing the keyword → Export → Download CSV, then share `Pages.csv` from the ZIP. Read it. If the user skips it, write it under Not checked.
- The script's `--site` option (step 4) also flags client pages whose title or H1 already contains the keyword.

## 3. Find the pages that rank now

Pick **3–8** organic results, in ranking order. Use the first source you have:
1. **Ahrefs or Semrush connected:** tell the user first what you'll pull and that it uses their paid API units — e.g. *"1 keyword overview + the top 10 results for 1 keyword, a few calls"* — and wait for OK. Pull the SERP (top URLs) plus search volume and keyword difficulty. Label every number with the tool, country database and date.
2. **Web search tool:** search the keyword (add the city for local keywords). Results can differ from Google in the client's country — say so in Data sources.
3. **Neither:** ask the user to paste the top URLs (or the page text).

Skip ads. Directories and marketplaces in the results tell you the intent; still compare against pages of the same type as yours where you can. Volume and difficulty without a connector: **Not checked — connect Ahrefs or Semrush** (see the kit's docs/connectors.md).

## 4. Measure them

```bash
node "${CLAUDE_SKILL_DIR}/scripts/compare-pages.mjs" <url1> <url2> <url3> --keyword "<keyword>" --site <client-site> --out .powerup/briefs/research-<slug>-<YYYY-MM-DD>.json
```

- Pass URLs in ranking order. Leave out `--site` if you don't know the client's website.
- It respects robots.txt: disallowed pages come back under `skipped` — leave them out, or ask the user to paste their text.
- It prints a short summary: one line per page, word count range, shared subtopics ("covered by N of M"), all questions, shared schema types, where the keyword appears, newest/oldest dates, and with `--site` the `internalLinkCandidates` and `possibleCannibalization`. Open the full JSON only for outlines you need.
- Counts use the page's main content (menus and footers left out). Pages under 100 words are left out of the length range — they are usually built with JavaScript or blocked.

**If it fails with a network error** (common in the Claude app sandbox): fetch each page with your web tool (or Firecrawl scrape, raw HTML), save it as `.html` — or the page text as `.md` with `URL:` and `Title:` lines at the top — and run the script on the files. Word counts from page text are approximate; say so. If you can't save files, compare the pages by hand and write "sampled by hand" in Data sources.

## 5. Read the top 2–3 pages yourself

The script measures structure, not quality. Read the top pages and note:
- **Intent:** what the searcher wants (learn, compare, buy, find a place nearby) and the format that wins (guide, list, service page, gallery, calculator).
- **Gaps:** generic advice, no prices or price factors, no real photos, no local detail, nothing first-hand, outdated facts, unanswered questions.
- **What the client can add** that others can't: their process, numbers, case studies, photos, expert. This is the brief's angle.

How to read intent, set length, and handle location pages, cannibalization, refreshes, E-E-A-T and FAQs: [reference/brief-guide.md](reference/brief-guide.md).

## 6. Write the brief

Follow [templates/brief.md](templates/brief.md). Rules:
- **Titles:** 2–3 options, about 50–60 characters, keyword near the start. **Meta descriptions:** 2–3 options, 120–155 characters. **H1:** 2–3 options. Count the characters and write the count after each option.
- **Length:** use the script's range and its evidence. Never tell the writer to pad.
- **Outline:** every H2/H3 with what it must cover. Include subtopics most ranking pages cover, plus the angle sections they miss. Put questions where they fit, or in an FAQ section.
- **Angle:** specific and provable ("show our real price ranges and 6 photos of finished cakes"), not "write better content".
- **Internal links:** pages to link **from** (they get the new link) and **to** — from `internalLinkCandidates`, the seo.md Keywords table and the client's main service pages.
- **Cannibalization:** if `possibleCannibalization` or Search Console shows a client page for this keyword, say so at the top of the brief and recommend updating or merging.
- **Location pages:** unique local content only — never a copy of another city page with the name swapped.
- **Schema:** name the type(s) and hand off to the **meta-schema** skill. Don't promise FAQ rich results — Google no longer shows them.
- **Tone and rules:** from voice.md, seo.md and decisions.md. If a file is missing, say so.
- **Evidence:** every number names its source (script result, URL, tool). Everything you didn't check goes under **Not checked** — at least search volume and keyword difficulty if no connector gave them.

## 7. Save and remember

- Save the brief as `.powerup/briefs/<keyword-slug>-<YYYY-MM-DD>.md` (in the Claude app, give it as a downloadable file).
- If a client is active, add or update the row in the **Keywords** table of their `seo.md`: keyword, intent, target page (URL or planned slug), priority (ask if unknown). Never add volume or difficulty there unless a tool gave them — then name the tool and date.
- If the user decided something (e.g. "update the old page instead of a new one"), add a line to `decisions.md`.

## 8. Offer next steps

- Write the draft from this brief in the client's voice (voice.md), then check it against the outline.
- **meta-schema** for the page's title, meta description and structured data.
- After publishing: **proof-check** the live page; later, **seo-report** to see whether it gets impressions and clicks.
- **client-note** to save any new client preference that came up.
