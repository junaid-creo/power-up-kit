---
name: client-note
description: Save a decision, preference or fact about the active client so Claude remembers it in future chats. Use when the user says "remember that…", "note for the client…", "the client decided…", "from now on…", or when a client gives clear feedback such as "they hate stock photos" or "the new phone number is…".
license: MIT
compatibility: Works in Claude Code (edits .powerup/ in the project). In the Claude app, gives an updated file to replace in the client's Claude Project.
metadata:
  kit: power-up-kit
  version: 0.1.0
---

# Client note

## Steps

1. **Which client?** Use the client in `.powerup/active-client`. If none is active or the note is clearly about another client, ask which one (one short question).

2. **Never save secrets.** If the note contains a password, API key, token, card or bank number, don't save that part. Save only where it is kept ("Webflow login is in the shared 1Password vault") and tell the user why.

3. **Log it.** Add one line at the top of the list in `.powerup/clients/<client>/decisions.md` (newest first):

   ```markdown
   - 2026-11-20 — Never use stock photos of people; use real shop photos (client, email to Sara)
   ```

   Use today's date. Write who decided or where it came from, if known.

4. **Update the right file too**, when the note changes a fact stored elsewhere:
   - colours, fonts, logo, imagery → `brand.md`
   - tone, words to use or avoid, languages → `voice.md`
   - keywords, locations, competitors, data sources → `seo.md`
   - contacts, goals, deadline, platform, links → `profile.md`

   Replace the old value — don't keep two conflicting values. Update the file's "Last updated" date.

5. **Confirm in one line**, e.g. *"Saved for Acme Bakery: no stock photos of people (decisions.md, brand.md)."*

## Claude app

There is no `.powerup/` folder. Write the updated `decisions.md` (and any other changed file) in full as a downloadable file, and tell the user to replace the old file in the client's Claude Project so future chats see it.
