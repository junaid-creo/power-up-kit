# Where each field goes, by platform

Menu names change between versions. If a label below doesn't match what the user sees, say so and describe what to look for ("the page's SEO settings") rather than guessing. Always **replace** existing tags — two `<title>` tags or two canonicals confuse Google.

Before adding JSON-LD, look at the live page source (or the `scan` result): themes and SEO plugins often output their own Organization, WebSite, Product or Article markup. Extend or switch that off instead of adding a second, different copy.

## Plain HTML / static site

Paste the page's block from the snippets file inside `<head>`, replacing the old `<title>`, `<meta name="description">`, `<link rel="canonical">`, `og:*` and `twitter:*` tags. Site-wide JSON-LD (Organization/LocalBusiness + WebSite) usually goes on the homepage only.

## WordPress

- **Yoast SEO:** edit the page → Yoast SEO box (below the editor or in the sidebar) → **SEO** tab: *SEO title* and *Meta description*. **Social** tab: social image, title and description (leave blank to reuse the SEO ones). Yoast already outputs a schema graph (Organization or Person, WebSite, WebPage, Article): set the organisation name and logo in Yoast's site settings ("Site representation") instead of adding a duplicate block. LocalBusiness needs Yoast's Local SEO add-on or a custom block.
- **Rank Math:** edit the page → Rank Math box → **Edit Snippet**: title, permalink, description; **Social** tab for the share image. The **Schema** tab (Schema Generator) adds types such as LocalBusiness, Product, Event; importing custom JSON-LD may need Rank Math PRO — check the user's version.
- **Custom JSON-LD without those tools:** a code-snippet plugin (e.g. WPCode) can add a `<script type="application/ld+json">` to the site header for site-wide blocks. For one page only, use a plugin that supports per-page code, or the theme's template file.
- **Page builders** (Elementor, Divi) don't change where titles and descriptions live — that is still the SEO plugin.

## Webflow

- **Static page:** Pages panel → page's settings (gear icon) → **SEO settings**: *Title tag*, *Meta description*. **Open Graph settings**: OG title and description (or "Same as SEO"), and the Open Graph image URL — paste a full `https://` link.
- **Per-page code:** same page settings → **Custom code** → *Inside `<head>` tag* — paste the JSON-LD there. It only appears on the published site.
- **Site-wide code:** Site settings → **Custom code** → *Head code* (e.g. the Organization/WebSite block — but then it shows on every page; usually better on the homepage's own custom code).
- **CMS template pages** (blog posts, products): in the template's page settings, use **+ Add field** to build the title, description and OG fields from CMS fields (e.g. `Name | Crumb & Co`). Webflow's docs say CMS fields work in SEO and Open Graph settings; whether the head custom code field offers CMS fields depends on the version — check in the Designer before promising per-item JSON-LD.
- **Canonical:** Webflow adds canonical tags from Site settings → SEO (global canonical URL). Ask before changing it — it affects every page.
- **Connector:** if a Webflow connector is available in this session, you can update page titles, descriptions and Open Graph fields directly — **only after the user approved the old → new table**, page by page, then read them back. Don't publish the site unless the user asks.

## Framer

- **Site defaults:** Site Settings → General: site title, description and social preview image.
- **One page:** open the page's settings (Pages panel) → *Title*, *Description*, **Social preview** image (1200 × 630). Save and publish.
- **CMS pages:** add Plain Text fields for the SEO title and description in the CMS, then type `{{Title}}` style variables in the CMS page's settings; you can mix fixed text (`{{Title}} | Crumb & Co`). Pick the social image from a CMS image field.
- **Custom code (JSON-LD):** Site Settings → General → **Custom Code** (start or end of `<head>`), or the custom code in a single page's settings. Custom code needs a paid site plan and runs only on the published site. Framer's notes say CMS variables can be used in custom code too.
- **Connector:** if a Framer connector is available in this session, you can set these fields directly — **only after the user approved the table**. Publishing is the user's call.

## Shopify

- **Products, collections, pages, blog posts:** open the item in the admin → scroll to **Search engine listing** → **Edit** → *Page title*, *Meta description*, *URL handle*. Changing a handle changes the URL — offer the **redirect-map** skill (Shopify can create the redirect automatically when you tick the box).
- **Homepage:** Online Store → Preferences → homepage title and meta description, and the social sharing image.
- **JSON-LD:** most themes already output Product (and often Organization) markup — check the page source first. Site-wide blocks go in Online Store → Themes → … → **Edit code** → `layout/theme.liquid` inside `<head>`; product markup belongs in the product template or section. In Liquid, output values with the `json` filter so quotes are escaped: `"name": {{ product.title | json }}`.

## Next.js

- **App Router:** in `page.tsx` or `layout.tsx` export `metadata` (or `generateMetadata` for dynamic pages):

  ```ts
  export const metadata = {
    title: 'Celebration Cakes in Dubai Marina | Crumb & Co',
    description: 'Family bakery in Dubai Marina …',
    alternates: { canonical: '/' },
    openGraph: { type: 'website', url: '/', images: ['/images/og-home.jpg'], siteName: 'Crumb & Co' },
    twitter: { card: 'summary_large_image' },
  };
  ```

  Set `metadataBase: new URL('https://crumb.example')` in the root layout so relative URLs become full ones. A `title.template` (e.g. `'%s | Crumb & Co'`) keeps the brand suffix consistent.
- **JSON-LD:** render a `<script>` in the page component, as the Next.js docs show, escaping `<`:

  ```tsx
  <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
  ```

- **Pages Router:** put the tags inside `next/head` on each page.

## Astro and other static generators

Pass `title`, `description`, `canonical` and `ogImage` as props to the layout and print them in `<head>`. For JSON-LD: `<script type="application/ld+json" set:html={JSON.stringify(data).replace(/</g, '\\u003c')} />`. Eleventy, Hugo and Jekyll work the same way through front matter and the base layout.

## After any change

Offer the **proof-check** skill on the changed pages (it confirms the title, description, canonical and JSON-LD on the live page), then suggest Google's Rich Results Test for one URL per template.
