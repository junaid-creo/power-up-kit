# Client memory

Claude forgets everything between chats. Power-Up Kit gives it a memory per client that lives in plain files you control.

## The files

```text
.powerup/
├── active-client              which client you're working on now (one line, e.g. crumb-co)
├── agency.md                  your own business: services, prices, case studies, terms
├── reports/                   audits, brand sheets, crawl data
└── clients/
    └── crumb-co/
        ├── profile.md         who they are, goals, audience, platform, contacts, links
        ├── brand.md           colours, fonts, logo rules, imagery — confirmed or not
        ├── voice.md           tone of voice, words to use and avoid, languages
        ├── seo.md             keywords, locations, competitors, data sources, past audits
        ├── decisions.md       dated log: what was decided, by whom
        └── proposals/         proposals for this client
```

## How Claude uses them

- **At the start of every Claude Code session** a hook tells Claude which client is active and where its files are (one short message — it doesn't load the whole files, to save usage).
- **Skills read what they need:** proposals read `agency.md`, `profile.md` and `decisions.md`; audits read `seo.md`; brand sheets read and update `brand.md` and `voice.md`.
- **You add to it by talking:** *"Remember that the client wants Arabic and English"* → saved to `decisions.md` and `voice.md`.

## Commands

| Say | Skill |
|---|---|
| "New client: <name>" | client-new |
| "Switch to <client>" / "Which clients do we have?" | client-switch |
| "Remember that …" | client-note |
| "Set up my agency profile" | agency-profile |

## Sharing with your team

`.powerup/` is just a folder. Commit it to your project's git repository and everyone on the team — and their Claude — shares the same memory. If the repository is **public**, keep `agency.md` (prices) and any client details you don't want published out of it, e.g. with `.gitignore`.

## Rules

- **No secrets, ever.** No passwords, API keys, tokens, card or bank numbers. Write *where* access is kept ("1Password vault 'Crumb'"). The doctor skill scans `.powerup/` for secrets.
- **Facts, dated.** Decisions get a date and a source.
- **Confirmed vs guessed.** Brand colours read from a website are marked "not confirmed" until the client or brand guide confirms them.
- **Small files.** Under ~80 lines each; link to big documents instead of pasting them.
