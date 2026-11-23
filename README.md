<p align="center">
  <img src="docs/assets/logo.png" width="96" alt="Power-Up Kit logo">
</p>

<h1 align="center">Power-Up Kit</h1>

<p align="center">
  <b>A web studio team inside Claude</b> — for web designers, developers, SEO teams and agencies.<br>
  Claude remembers every client, finishes real jobs in one step, checks its own work, and connects to your tools.
</p>

<p align="center">
  <a href="https://github.com/junaid-creo/power-up-kit/actions/workflows/ci.yml"><img src="https://github.com/junaid-creo/power-up-kit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT licence"></a>
  <img src="https://img.shields.io/badge/works%20in-Claude%20Code%20%C2%B7%20Claude%20app-orange.svg" alt="Works in Claude Code and the Claude app">
</p>

> Unofficial community project. Not affiliated with or endorsed by Anthropic.

---

## Install

**Claude Code** — one command (Claude Code 2.1.292 or newer):

```bash
claude plugin install power-up-kit --marketplace junaid-creo/power-up-kit
```

**Claude app** (claude.ai or desktop) — **Customize → Plugins → Add marketplace**, paste `junaid-creo/power-up-kit`, and turn on the packs you want. Or download ZIPs from [Releases](https://github.com/junaid-creo/power-up-kit/releases).

**Other AI tools** (Cursor, Codex and more — skills only):

```bash
npx skills add junaid-creo/power-up-kit
```

Then ask Claude: **"Run the Power-Up Kit doctor."** It checks your setup and tells you exactly what to fix.

More options (one pack only, teams, updates, older versions): [docs/install.md](docs/install.md).

---

## The four power-ups

| | Power-up | What it means for you |
|---|---|---|
| 🧠 | **Remembers every client** | Brand colours, fonts, tone of voice, SEO goals and past decisions are saved per client. Every new chat starts knowing them. Switch clients in one sentence. |
| ⚡ | **Finishes real jobs in one step** | SEO audit with a score and fix list. Content briefs, titles and schema, redirect maps and a monthly client report. Brand sheet from any website. A proposal in your branding, and a launch check that catches go-live disasters. Not tips — finished work. |
| ✅ | **Checks its own work** | Claude opens the page, takes desktop and mobile screenshots, tests links, SEO, accessibility and speed — and shows the evidence. In Claude Code, after website changes a hook asks Claude once to check them before finishing (or to tell you plainly why it can't). |
| 🔌 | **Connects to your tools** | Tested setup guides for Figma, Webflow, Framer, WordPress, Shopify, Firecrawl, Search Console, Ahrefs and Semrush, plus a doctor that finds what's missing. |

Plus: a **secret-file guard rail** in Claude Code (blocks the common ways of reading, printing or overwriting `.env` files, keys, `wp-config.php` and similar — best effort; [docs/hooks.md](docs/hooks.md#a-hard-guarantee) shows how to make it airtight) and **no invented numbers** (prices, rankings and traffic only come from you or real data).

---

## Try it

Say these to Claude after installing:

| Say | What happens |
|---|---|
| "Set up my agency profile" | Saves your name, logo, services, prices and terms for proposals and reports |
| "New client: Crumb & Co, website crumb.example" | Creates the client's memory: profile, brand, voice, SEO, decisions |
| "Remember: they never want stock photos of people" | Saves the decision to the client's memory, dated |
| "Do an SEO audit of crumb.example" | Crawls the site, runs Google PageSpeed, scores it out of 100, writes a prioritised report |
| "Make a brand sheet from their website" | Colours with contrast checks, fonts, logo, tone of voice — as a printable page |
| "Write a proposal for the new website" | Three options, scope, timeline, your branding — then checks the totals add up |
| "Check the homepage before we launch" | Screenshots, links, SEO, accessibility and speed — with a ✅ / ⚠️ / ❌ verdict and evidence |
| "Write a content brief for ‘wedding cakes dubai’" | Studies the pages that rank now, then writes the outline, titles, questions to answer and internal links — no invented search volumes |
| "Fix the titles, meta and schema on our site" | Scans every page, writes new titles, descriptions and JSON-LD, checks them, and gives paste-ready code for your platform |
| "We are moving to a new site — make the redirects" | Matches old URLs to new ones, flags the unsure ones, exports for Netlify, Vercel, Shopify, WordPress and more, then verifies them after launch |
| "Make October’s SEO report for Crumb & Co" | Compares the month with the one before (Search Console, health score, fixed issues) and writes a branded, printable report |
| "We go live on Friday — are we ready?" | Launch pipeline: catches noindex, robots.txt blocks, staging URLs, missing redirects and analytics, then a go / no-go and client sign-off |

See a [real audit of a live website](examples/real-audit-junaid-aj.md), a [real launch check](examples/real-launch-junaid-aj.md) of the same site, and demo output in [examples/](examples/).

---

## What's inside

Install everything with `power-up-kit`, or only the packs you need.

| Pack | Skills | For |
|---|---|---|
| **powerup-core** (always installed) | `client-new` · `client-switch` · `client-note` · `agency-profile` · `doctor` · `proof-check` + safety hooks | Everyone |
| **powerup-seo** | `seo-audit` · `content-brief` · `meta-schema` · `redirect-map` · `seo-report` | SEO teams, agencies, developers |
| **powerup-design** | `content-brief` | Studies the pages that rank for a keyword and writes a brief: intent, outline, length, questions, internal links, angle | ✅ | ✅* |
| `meta-schema` | Titles, meta descriptions, Open Graph and JSON-LD — written, checked (length, pixel width, required schema fields) and ready to paste | ✅ | ✅* |
| `redirect-map` | Old → new URL matching for migrations, checks for chains and loops, exports for 10 platforms, verifies after launch | ✅ | ✅* |
| `seo-report` | Monthly client report: Search Console and health-score changes, fixed and new issues, work done, next steps — branded HTML | ✅ | ✅ |
| `brand-sheet` | Designers |
| **powerup-agency** | `proposal` · `launch` | Agency owners, freelancers, project managers |

| Skill | What it does | Claude Code | Claude app |
|---|---|:-:|:-:|
| `client-new` | Interviews you (and reads the client's website) to create the client's memory | ✅ | ✅ via Projects |
| `client-switch` | Lists clients and switches the active one | ✅ | ✅ via Projects |
| `client-note` | Saves a decision or preference, dated, into the right file | ✅ | ✅ |
| `agency-profile` | Your business details for proposals and reports | ✅ | ✅ |
| `doctor` | Checks Node, Claude Code, connectors, memory and secrets — gives exact fixes | ✅ | ✅ (connectors only) |
| `proof-check` | Evidence-based QA of a page: status, links, SEO, accessibility, speed, screenshots | ✅ | ✅ |
| `seo-audit` | Polite crawl, 30 site and page checks, PageSpeed, score /100, prioritised report; uses Search Console / Ahrefs / Semrush if connected | ✅ | ✅* |
| `brand-sheet` | Brand colours (with roles and WCAG contrast), fonts, logo and voice → printable sheet | ✅ | ✅* |
| `proposal` | Proposal with 3 options in your branding; checks totals, gaps and expiry; never invents prices | ✅ | ✅ |
| `launch` | Go-live pipeline: pre-launch checks on staging, go / no-go, client sign-off, then post-launch checks on the live site | ✅ | ✅* |

\* In the Claude app, the code sandbox may not reach websites directly; the skill then reads pages with Claude's web tools and audits a sample.

---

## How it works

**Client memory** lives in a `.powerup/` folder in your project — plain Markdown you can read and edit, and share with your team through git. [More →](docs/client-memory.md)

```text
.powerup/
├── active-client
├── agency.md
└── clients/crumb-co/
    ├── profile.md   brand.md   voice.md   seo.md   decisions.md
```

**Scripts do the measuring, Claude does the thinking.** Each skill ships small zero-dependency Node.js scripts (crawler, page checker, schema checker, redirect matcher, launch checker, brand extractor, proposal checker). They return compact facts, so Claude spends less of your usage reading raw pages and never has to guess a number.

**Hooks (Claude Code only)** load the active client at the start of each session, guard against reading secret files (best effort), and ask Claude to check web changes before it says they work. All can be switched off. [More →](docs/hooks.md)

---

## Requirements

- **Claude Code** 2.1.292+ for the one-command install (older versions: two commands, see [install](docs/install.md)), or the **Claude app** with *Code execution and file creation* turned on.
- **Node.js 18+** for the scripts and hooks (most web developers already have it).
- Optional: a browser tool for screenshots (Playwright, Claude in Chrome, or the Claude desktop browser) and the connectors in [docs/connectors.md](docs/connectors.md).

## Privacy and safety

- No telemetry. The kit sends nothing anywhere by itself.
- Network calls happen only when you run a skill: to the website you asked to audit, to Google PageSpeed Insights (the public URL only), and Google Fonts when you open a generated page.
- The crawler identifies itself, respects robots.txt and crawls slowly. Only audit sites you own or have permission to audit.
- Client memory must never hold passwords, keys or card numbers; the doctor scans for them. See [SECURITY.md](SECURITY.md).

## Docs

[Install](docs/install.md) · [Claude app guide](docs/claude-app.md) · [Client memory](docs/client-memory.md) · [Hooks](docs/hooks.md) · [Connectors](docs/connectors.md) · [Save usage](docs/usage-tips.md) · [Troubleshooting](docs/troubleshooting.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

## Roadmap

| Version | Adds |
|---|---|
| 0.1 | Core (memory, doctor, proof-check, hooks) · SEO audit · brand sheet · proposal |
| **0.2** (now) | Content briefs · meta & schema writer · redirect maps · monthly SEO report · `launch` pipeline |
| 0.3 | Design QA against Figma, design tokens, Figma → Webflow/Framer, site migration |
| 1.0 | Specialist team (SEO, accessibility, design QA, copy agents working in parallel), all pipelines, guides in more languages |

Have an idea? [Suggest a skill](https://github.com/junaid-creo/power-up-kit/issues/new?template=skill_request.yml).

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Every skill must prove its work: tests for scripts, evals for behaviour.

## License

[MIT](LICENSE). Claude is a trademark of Anthropic, PBC. This project is not affiliated with Anthropic.
