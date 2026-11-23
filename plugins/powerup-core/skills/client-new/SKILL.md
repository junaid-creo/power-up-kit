---
name: client-new
description: Set up memory for a new client so Claude remembers their brand, tone of voice, SEO goals and past decisions in every future chat. Use when the user starts work for a new client or project, says "new client", "onboard Acme", "remember this client", or shares a client brief and wants it saved.
license: MIT
compatibility: Works in Claude Code (saves files in the project) and the Claude app (gives files to add to a Claude Project).
metadata:
  kit: power-up-kit
  version: 0.2.1
---

# New client

Create a client profile that every later chat and skill can read. Keep it short, factual and free of secrets.

## Where the memory lives

**Claude Code** — in the project folder:

```text
.powerup/
├── active-client            one line: the client folder name, e.g. acme-bakery
└── clients/<client>/
    ├── profile.md           who they are, goals, audience, platforms, contacts
    ├── brand.md             colours, fonts, logo rules
    ├── voice.md             tone of voice, words to use and avoid
    ├── seo.md               keywords, locations, competitors, data sources
    └── decisions.md         dated log of decisions and preferences
```

**Claude app** — there is no project folder. Create the same five files as downloadable files and tell the user: *create a Claude Project called "Client: <name>", then add these files to the Project's files.* Every chat in that Project will then know the client.

## Steps

1. **Name.** Get the client's name (ask if missing). Make a folder name: lowercase, dashes, no spaces (`Acme Bakery LLC` → `acme-bakery`). If `.powerup/clients/<name>/` already exists, say so and offer to update it instead of overwriting.

2. **Collect what you already have** before asking anything:
   - what the user said in this chat, and any files they attached (brief, proposal, brand guide);
   - the client's website, if you know it. If the **brand-sheet** skill is available, use it to fill `brand.md`. Otherwise read the homepage for name, services, location, colours and tone.

3. **Ask only for the gaps** — one message, at most 6 short questions, each skippable. Typical gaps: what they sell and to whom, the main goal of this project, the website platform (Webflow, Framer, WordPress, Shopify, custom), main competitors, tone of voice, deadline. Anything skipped becomes `_Unknown_`.

4. **Write the files** from the templates in this skill's `templates/` folder. Fill every section you can; leave `_Unknown_` where you don't know. Put a one-line **Summary** at the top of `profile.md` — other tools show it at the start of each session.

5. **Never store secrets.** No passwords, API keys, tokens, card or bank details, private personal data. For logins write only *where* access lives ("Webflow access: shared via 1Password, vault 'Acme'").

6. **Make it active.** Write the folder name to `.powerup/active-client`. If `.powerup/README.md` doesn't exist, copy `templates/powerup-readme.md` there.

7. **Confirm** in a few lines: what was saved, what's still unknown, and that the user can say *"remember that …"* any time to add to it (client-note skill), or *"switch to <client>"* to change client (client-switch skill).

   If the project is a git repository, mention that committing `.powerup/` shares this memory with the team — and that it must never contain secrets.

## Good profile writing

- Facts over adjectives: "3 shops in Dubai Marina, Al Barsha, JLT" beats "a well-known bakery".
- Write decisions with dates and who decided.
- Keep each file under ~80 lines. Link to big documents instead of pasting them.
