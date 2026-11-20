# SEO audit checklist

`seo-crawl.mjs` covers the **Automatic** items. Do the **Judgement** items yourself by reading pages. Use the whole list when you audit by hand (e.g. in the Claude app without network access from the sandbox).

## Technical — automatic
- [ ] robots.txt exists and doesn't block the site
- [ ] XML sitemap exists, is listed in robots.txt, and lists only indexable 200 pages
- [ ] http → https redirect; www and non-www point to one version
- [ ] Unknown URLs return 404 (no "soft 404")
- [ ] No 5xx errors, no broken internal links, no redirect chains
- [ ] Every page has a mobile viewport
- [ ] Canonicals point to the page itself unless it's a deliberate duplicate
- [ ] No noindex on pages that should rank
- [ ] No mixed (http) content on https pages
- [ ] Structured data is valid JSON

## On-page — automatic
- [ ] Unique title per page, 50–60 characters, main keyword early
- [ ] Unique meta description per page, 120–155 characters
- [ ] One H1 per page; headings in order
- [ ] Images have alt text
- [ ] Pages have enough content to answer the query (200+ words is a floor, not a goal)
- [ ] Important pages within 3 clicks of the homepage; no orphan pages
- [ ] Open Graph tags for sharing; `lang` attribute set

## Judgement — read the pages
- [ ] **Search intent:** does the page give what someone searching the keyword wants (buy, compare, learn, find a location)?
- [ ] **One topic per page:** no two pages targeting the same keyword (cannibalisation)
- [ ] **Coverage:** a page for each main service, product category and target location
- [ ] **Titles sell the click:** benefit + keyword + brand, not just the brand name
- [ ] **Internal links:** descriptive anchor text ("wedding cakes in Dubai", not "click here"); key pages linked from the menu or homepage
- [ ] **Trust (E-E-A-T):** real about page, team/author names, reviews/testimonials, contact details, policies
- [ ] **Local SEO** (if relevant): consistent name/address/phone, LocalBusiness schema, location pages, embedded map, Google Business Profile linked
- [ ] **Content freshness:** dates on articles; outdated prices, offers or years
- [ ] **Multilingual** (if relevant): hreflang between language versions, translated titles/descriptions, right-to-left layout for Arabic
- [ ] **Images:** modern formats (WebP/AVIF), sensible file sizes, descriptive file names
- [ ] **Platform gotchas:**
  - Webflow: CMS template titles/descriptions use fields, not one static value; 301 redirects set in Site settings after URL changes
  - WordPress: SEO plugin (Yoast/Rank Math) set up; tag/attachment pages not indexed; "Discourage search engines" unticked on live sites
  - Shopify: duplicate `/collections/x/products/y` URLs canonicalise to `/products/y`; app scripts not slowing pages
  - Framer: page titles/descriptions set per page and per CMS item; custom 404 page

## Priority rules for the "top 5 fixes"
1. Anything stopping Google from indexing important pages (robots, noindex, canonicals, 5xx).
2. Broken internal links and redirect chains on key pages.
3. Missing/duplicate titles and H1s on pages that should rank.
4. Speed problems on key templates (LCP > 2.5 s, INP > 200 ms, CLS > 0.1).
5. Missing pages for target keywords/locations (content gaps).
6. Everything else, highest affected-page count first.
