# Connectors

Connectors (MCP servers) let Claude use your other tools. Power-Up Kit works without any of them — each one adds more power. The **doctor** skill tells you which ones Claude can see.

> Checked against each vendor's own documentation on **2026-11-20**. Vendors change URLs and plans; if something fails, follow the source link. Items marked **community** are not made by the vendor.

**In the Claude app**, most of these are in the connector directory: **Customize → Connectors → Browse**, find the tool, click **Connect**, sign in. If a tool isn't listed, use **Add custom connector** with the URL below. Free plans allow one custom connector; on Team/Enterprise plans an Owner adds them. Connectors added in the Claude app also appear in Claude Code when you're signed in with the same account.

**In Claude Code**, run the command, then type `/mcp` in a session and sign in when asked.

## Browser — for screenshots and clicking (used by proof-check, brand-sheet, launch)

You need **one** of these:

| Option | Setup |
|---|---|
| **Claude desktop app's built-in browser** | Nothing to install — it's in the desktop app's side panel. |
| **Claude in Chrome** | Install the Claude extension in Chrome and connect it. |
| **Playwright MCP** (Microsoft) — free | Claude Code: `claude mcp add playwright npx @playwright/mcp@latest` or `claude plugin install playwright@claude-plugins-official`. Desktop config: `{"mcpServers":{"playwright":{"command":"npx","args":["@playwright/mcp@latest"]}}}`. Runs locally, so it can't be a claude.ai web connector. Needs Node.js. [Source](https://github.com/microsoft/playwright-mcp) |

## Firecrawl — read websites at scale (seo-audit, content-brief, brand-sheet)

- **Claude app:** in the connector directory, or custom connector `https://mcp.firecrawl.dev/v2/mcp-oauth`.
- **Claude Code:** `claude mcp add --transport http firecrawl https://mcp.firecrawl.dev/v2/mcp-oauth` (or `claude plugin install firecrawl@claude-plugins-official`).
- **Cost:** sign in with OAuth. A limited keyless mode exists (search/scrape only, rate-limited); full tools use your Firecrawl plan. [Source](https://docs.firecrawl.dev/quickstarts/claude-code)

## Figma — design files (brand-sheet, proof-check)

- **Claude app:** connector directory → Figma.
- **Claude Code:** `claude plugin install figma@claude-plugins-official` (recommended) or `claude mcp add --transport http figma https://mcp.figma.com/mcp`.
- **Limits:** Starter plans and View/Collab seats get very few calls (20/month); Dev/Full seats get 200/day on Professional/Organization and 600/day on Enterprise. [Source](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/)

## Webflow

- **Claude app:** connector directory → Webflow.
- **Claude Code:** `claude mcp add --transport http webflow https://mcp.webflow.com/mcp`, then `/mcp` to sign in and pick sites.
- **Cost:** free. Webflow's MCP 2.0 (July 2026) removed the bridge app for most tasks; older skills written for 1.x may need updating. [Source](https://developers.webflow.com/mcp/installing/claude-code)

## Framer

- **Claude app:** connector directory → Framer.
- **Claude Code:** `claude mcp add --transport http --scope user framer https://mcp.framer.com/mcp`.
- The older `npx @framer/agent setup` route still works (needed for localization). [Source](https://www.framer.com/developers/mcp)

## WordPress

- **WordPress.com / Jetpack sites:** turn on MCP at my.wordpress.com → Preferences → MCP, then use the WordPress.com connector in the Claude app. Included with paid WordPress.com plans; the vendor says free and Jetpack sites lose MCP access on 30 Nov 2026. [Source](https://wordpress.com/support/model-context-protocol-mcp-settings/)
- **Self-hosted WordPress:** install the official [WordPress/mcp-adapter](https://github.com/WordPress/mcp-adapter) plugin, create an Application Password, then add to Claude Code or Desktop:
  `npx -y @automattic/mcp-wordpress-remote@latest` with `WP_API_URL=https://your-site/wp-json/mcp/mcp-adapter-default-server`, `WP_API_USERNAME`, `WP_API_PASSWORD` (the Application Password — keep it in your environment, never in `.powerup/`).
- WordPress also publishes agent skills: `npx skills add WordPress/agent-skills`.

## Shopify

- **Claude app:** connector directory → Shopify (you approve it in your Shopify admin).
- **Claude Code (developer docs and theme work):** `claude plugin install shopify-ai-toolkit@claude-plugins-official`, or the Dev MCP: `claude mcp add --transport stdio shopify-dev-mcp -- npx -y @shopify/dev-mcp@latest`. [Source](https://shopify.dev/docs/apps/build/ai-toolkit)

## Google Search Console — **community**

Google has no official Search Console MCP server (it does have one for Google Analytics 4). The most-used community server is [AminForou/mcp-gsc](https://github.com/AminForou/mcp-gsc). It needs a Google Cloud OAuth client (`client_secrets.json`) or a service account. Desktop config from its README:

```json
{ "mcpServers": { "gsc": { "command": "/full/path/to/uvx", "args": ["mcp-search-console"],
  "env": { "GSC_OAUTH_CLIENT_SECRETS_FILE": "/path/to/client_secrets.json" } } } }
```

Review community servers before giving them access to your Google account.

**No connector? Use exports.** `seo-report`, `redirect-map` and `content-brief` also read the CSV files Search Console gives you: **Performance → Export → Download CSV** (queries and pages), for this period and the one before. Ahrefs, Semrush and Screaming Frog exports work for `redirect-map` too.

## Ahrefs

- **Claude app:** connector directory → Ahrefs.
- **Claude Code:** `claude mcp add ahrefs https://api.ahrefs.com/mcp/mcp -t http`, then `/mcp` → Authenticate.
- **Cost:** needs **Ahrefs Lite or higher**; calls use your monthly API units. MCP keys (Account settings → API keys → Generate MCP key) are different from API v3 keys. [Source](https://docs.ahrefs.com/mcp/docs/introduction)

## Semrush

- **Claude app:** connector directory → Semrush.
- **Claude Code:** `claude mcp add semrush https://mcp.semrush.com/v2/mcp -t http`, then `/mcp`.
- **Cost:** calls use API units. Some subscriptions include units (e.g. One Starter, One Pro+, Classic Pro and Guru); others need an API unit package. [Source](https://developer.semrush.com/api/introduction/semrush-mcp)

## Google PageSpeed Insights key (optional, free)

The speed checks call Google's PageSpeed Insights API. It works without a key, but Google recommends one for regular use, and keyless calls often hit limits.

1. Open the [get-started page](https://developers.google.com/speed/docs/insights/v5/get-started) → **Get a Key** (or enable *PageSpeed Insights API* in Google Cloud Console → Credentials).
2. Set it in your environment before starting Claude Code: `export PAGESPEED_API_KEY=your-key` (macOS/Linux shell profile) or `setx PAGESPEED_API_KEY your-key` (Windows).

Never paste the key into a chat or into `.powerup/`.
