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
| ⚡ | **Finishes real jobs in one step** | SEO audit with a score and fix list. Brand sheet from any website. A client proposal in your branding. Not tips — finished work. |
| ✅ | **Checks its own work** | Claude opens the page, takes desktop and mobile screenshots, tests links, SEO, accessibility and speed — and shows the evidence. In Claude Code, a hook stops Claude from finishing after website changes until it has checked them (or told you plainly why it can't). |
| 🔌 | **Connects to your tools** | Tested setup guides for Figma, Webflow, Framer, WordPress, Shopify, Firecrawl, Search Console, Ahrefs and Semrush, plus a doctor that finds what's missing. |

Plus: **secret protection** (Claude can't read or print `.env` files and private keys) and **no invented numbers** (prices, rankings and traffic only come from you or real data).

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

See a [real audit of a live website](examples/real-audit-junaid-aj.md) and demo output in [examples/](examples/).

---

## What's inside

Install everything with `power-up-kit`, or only the packs you need.

| Pack | Skills | For |
|---|---|---|
| **powerup-core** (always installed) | `client-new` · `client-switch` · `client-note` · `agency-profile` · `doctor` · `proof-check` + safety hooks | Everyone |
| **powerup-seo** | `seo-audit` | SEO teams, agencies |
| **powerup-design** | `brand-sheet` | Designers |
| **powerup-agency** | `proposal` | Agency owners, freelancers, project managers |

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

**Scripts do the measuring, Claude does the thinking.** Each skill ships small zero-dependency Node.js scripts (crawler, page checker, brand extractor, proposal checker). They return compact facts, so Claude spends less of your usage reading raw pages and never has to guess a number.

**Hooks (Claude Code only)** load the active client at the start of each session, block access to secret files, and stop Claude claiming web work is done before it has checked it. All can be switched off. [More →](docs/hooks.md)

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
| **0.1** (now) | Core (memory, doctor, proof-check, hooks) · SEO audit · brand sheet · proposal |
| 0.2 | Content briefs, meta & schema writer, redirect maps, monthly SEO report, `launch` pipeline |
| 0.3 | Design QA against Figma, design tokens, Figma → Webflow/Framer, site migration |
| 1.0 | Specialist team (SEO, accessibility, design QA, copy agents working in parallel), all pipelines, guides in more languages |

Have an idea? [Suggest a skill](https://github.com/junaid-creo/power-up-kit/issues/new?template=skill_request.yml).

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Every skill must prove its work: tests for scripts, evals for behaviour.

## License

[MIT](LICENSE). Claude is a trademark of Anthropic, PBC. This project is not affiliated with Anthropic.
