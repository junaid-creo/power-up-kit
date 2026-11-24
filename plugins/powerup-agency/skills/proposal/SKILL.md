---
name: proposal
description: Write and check a branded client proposal — problem, scope, timeline, three pricing options, case studies — as a printable page. Never invents prices. Use for a proposal, quote, estimate, statement of work, pitch, or turning call notes into an offer.
license: MIT
compatibility: Works in Claude Code and the Claude app. Scripts need Node.js 18+.
allowed-tools: Bash(node "${CLAUDE_SKILL_DIR}/scripts/check-proposal.mjs" *), Bash(node "${CLAUDE_SKILL_DIR}/scripts/render-proposal.mjs" *)
metadata:
  kit: power-up-kit
  version: 0.2.1
---

# Proposal

A good proposal repeats the client's problem better than they could, offers a clear choice, and contains no surprises. Prices come **only** from the user or `.powerup/agency.md` — never make them up.

## 1. Gather

Read, if they exist:
- `.powerup/agency.md` — your services, prices, case studies, terms, logo and colours. If missing, offer the **agency-profile** skill first (or continue with placeholders).
- `.powerup/clients/<client>/profile.md`, `decisions.md`, `seo.md` — goals, deadline, budget, past decisions.
- Anything the user shared: call notes, transcript, brief, emails, an audit report (e.g. from the **seo-audit** skill).

Then ask for what's missing, in **one** message (each skippable):
- the main goal and how success will be measured;
- budget range (or "unknown");
- deadline or launch date;
- what's in scope, and anything the client explicitly doesn't want;
- prices or rates, if they aren't in `agency.md`.

## 2. Plan the offer

- **Three options** (Essential / Recommended / Complete) built from real services in `agency.md`. Recommend the middle one and say why in one line.
- **Scope:** specific and countable ("up to 8 page templates", "2 revision rounds per phase"). Always include a **Not included** list — it prevents scope creep.
- **Timeline:** weeks with milestones and what you need from the client each week. Base durations on the user's input or `agency.md`; [reference/pricing-guide.md](reference/pricing-guide.md) has typical ranges for planning only.
- **Prices:** use exact figures from the user or `agency.md`. If a price is unknown, write `[PRICE]` — never estimate one. Same for unknown dates: `[DATE]`.

## 3. Write

Follow `templates/proposal.md` in this skill's folder. Write in the client's language and the agency's tone. Use the client's own words for their problem. Keep it to what a busy owner reads in 5 minutes.

Save as `.powerup/clients/<client>/proposals/<YYYY-MM-DD>-<project>.md` (or `proposals/` in the project if no client is active). In the Claude app, give it as a downloadable file.

## 4. Check it (always)

```bash
node "${CLAUDE_SKILL_DIR}/scripts/check-proposal.mjs" <proposal.md>
```

It finds leftover template text, `[PRICE]`/`[DATE]` gaps, pricing tables whose lines don't add up to the total, mixed currencies, an expired "Valid until" date and very long paragraphs. Fix everything under `mustFix`. Then re-read it yourself against `decisions.md`: nothing the client rejected should be in it.

## 5. Make it client-ready

```bash
node "${CLAUDE_SKILL_DIR}/scripts/render-proposal.mjs" <proposal.md> --agency "<Agency name>" --primary "<agency hex>" --logo "<logo url>" --font "<font>"
```

This creates a branded HTML page next to the Markdown file; open it in a browser and **Print → Save as PDF**. Placeholders stay highlighted in yellow so they can't be missed.

## 6. Report to the user

Tell them in a few lines: where the files are, the recommended option, what still needs their input (list every `[PRICE]`/`[DATE]`), and anything you assumed. Add a line to the client's `decisions.md`: "<date> — Proposal v1 sent/drafted: options A/B/C, recommended B".
