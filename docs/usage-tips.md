# Get more done with less usage

Hitting usage limits is the most common complaint from Claude users. Power-Up Kit is built to be light, and these habits stretch your plan further.

## What the kit costs you

- **Always loaded:** only the short descriptions of the 9 skills — about **800 tokens** in total — so Claude knows when to use them.
- **Loaded when used:** a skill's full instructions (roughly 450–1,200 tokens each), and its reference files only if needed.
- **Hooks:** the session-start message is one or two lines, and only in projects with a `.powerup/` folder. The other hooks add nothing to the conversation unless they block something.

## Why the scripts save usage

Reading a web page into the chat can cost thousands of tokens per page. The kit's scripts read pages **outside** the chat and return only the facts:

- `seo-crawl.mjs` crawls 50 pages and prints a summary of a few hundred tokens; the full data goes to a file Claude opens only for the issues it writes up.
- `page-check.mjs --summary` prints only failures and warnings.
- `extract-brand.mjs` returns colours, fonts and samples instead of whole stylesheets.

## Habits that help

1. **One client per session.** Switching clients mid-chat drags old context along. Start a new chat (or `/clear`) and switch.
2. **Keep `.powerup/` files short.** They're read often. Link to big documents instead of pasting them in.
3. **Crawl what you need.** `--max 50` is enough for most small-business sites; increase only for big sites.
4. **Ask for summaries.** "Give me the top 5 fixes" costs far less than "explain every issue".
5. **Use Projects in the Claude app.** Client files in a Project are there in every chat, so you never paste them again.
6. **Paid data costs twice.** Ahrefs and Semrush calls use your API units *and* add their results to the chat — pull only what the report needs.
