---
name: client-switch
description: Switch which client Claude is working for, or list all saved clients, then load that client's brand, tone of voice, SEO goals and past decisions. Use when the user says "switch to Acme", "let's work on another client", "which clients do we have?", or starts talking about a different client than the active one.
license: MIT
compatibility: Works in Claude Code (reads .powerup/ in the project). In the Claude app, each client lives in its own Claude Project instead.
metadata:
  kit: power-up-kit
  version: 0.1.0
---

# Switch client

## Claude Code

1. **List clients.** Read the folders in `.powerup/clients/`. For each, show the folder name and the `**Summary:**` line from its `profile.md`. Mark the one named in `.powerup/active-client`.
   - No `.powerup/clients/` folder? Say there are no saved clients yet and offer the **client-new** skill.

2. **Pick.** If the user named a client, match it to a folder (ignore case, spaces and dashes; "acme" matches `acme-bakery`). If more than one matches, ask which. If none matches, offer to create it with **client-new**.

3. **Activate.** Write the folder name (just the name, one line) to `.powerup/active-client`.

4. **Load.** Read the client's `profile.md`, `brand.md`, `voice.md`, `seo.md` and the newest 15 lines of `decisions.md`. Keep them in mind for all following work in this chat.

5. **Confirm** in three lines at most:
   - who the client is (the Summary),
   - the 2–3 rules that matter most right now (e.g. a brand colour, a tone rule, a recent decision),
   - anything important that is still `_Unknown_`.

## Claude app

There is no `.powerup/` folder. Each client should have its own Claude Project with its profile files added. Tell the user to open that client's Project and start the chat there. If the client has no Project yet, offer the **client-new** skill to create the files.
