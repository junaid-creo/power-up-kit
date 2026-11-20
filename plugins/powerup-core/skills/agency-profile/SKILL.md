---
name: agency-profile
description: Save your own agency's or freelance business details — name, logo, colours, services, prices, case studies and standard terms — so proposals and client reports come out with your branding and real numbers. Use when the user sets up the kit, says "set up my agency", "our rates are…", "add a case study", or before the first proposal or report if no agency profile exists.
license: MIT
compatibility: Works in Claude Code (saves .powerup/agency.md) and the Claude app (gives a file to add to a Claude Project).
metadata:
  kit: power-up-kit
  version: 0.1.1
---

# Agency profile

One file, `.powerup/agency.md`, describes **your** business (not a client). Proposals, audits and reports read it for branding, services, prices and terms.

## Steps

1. **Check first.** If `.powerup/agency.md` exists, read it and only update what the user asked to change.

2. **Collect what you can** from what the user already shared: their website (read it for name, services, case studies, colours), a past proposal, a rate card. Then ask for the gaps in one message, each skippable:
   - business name, website, contact email/phone for proposals;
   - logo (file path or URL) and brand colours;
   - services you offer, and how you price them (fixed price, day rate, packages). Prices are optional — say they will appear as `[PRICE]` placeholders in proposals until added;
   - 2–3 past projects you're proud of (client, what you did, a result with a number if possible);
   - standard terms: payment schedule, rounds of revisions, how long a quote is valid, what's never included.

3. **Write `.powerup/agency.md`** from `templates/agency.md` in this skill's folder. Leave `_Unknown_` where you don't know. Create `.powerup/` if needed.

4. **Never store secrets** — no bank details, card numbers, passwords or API keys. "Bank details are on the invoice" is enough.

5. **Remind the user** in one line: this file holds business information such as prices. If `.powerup/` is committed to a **public** repository, everyone can read it — keep it out of public repos (add `.powerup/agency.md` to `.gitignore`) unless that is intended.

## Claude app

Write `agency.md` as a downloadable file and tell the user to add it to every Claude Project they use for client work (or to their main "Agency" Project).
