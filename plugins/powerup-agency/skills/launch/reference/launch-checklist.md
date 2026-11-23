# Launch checklist

Give every item an **owner** (agency, client, developer) and a **status** (done, open, not needed). Items marked *(launch-check)* are covered by `launch-check.mjs`; the rest need a person, a browser or another skill. When you check by hand (no network, or only pasted HTML), use the *(launch-check)* items as your list too, and say which ones you could not see.

## 1. Content and copy
- [ ] No placeholder text: lorem ipsum, TODO, "[Your …]", `{{ }}`, example.com emails, default titles such as "Untitled" or "My Webflow Site" *(launch-check)*
- [ ] Final copy approved by the client; spelling checked
- [ ] Names, phone numbers, addresses, opening hours and prices are correct and the same everywhere
- [ ] Footer: company name, current year, social links go to the client's own accounts
- [ ] Images are final, licensed and compressed; meaningful images have alt text
- [ ] A helpful 404 page with links to the main pages

## 2. Design QA
- [ ] Widths: desktop 1440 px, laptop 1280 px, tablet 768 px, mobile 390 px (proof-check screenshots)
- [ ] Browsers: Safari on iPhone, Chrome on Android, and Chrome, Safari, Firefox and Edge on desktop
- [ ] Menus, sticky headers, pop-ups, sliders, animations and hover states work
- [ ] Favicon and social sharing image (og:image) *(launch-check)*
- [ ] Compared with the approved design (Figma) and the client's brand

## 3. Forms and email delivery
- [ ] Every form submitted with test data — on staging, and again on the live site *(launch-check lists the forms and any captcha)*
- [ ] The notification email arrives, and not in spam; it goes to the right people
- [ ] Thank-you message or page, auto-reply, and the connection to the CRM, newsletter tool or sheet
- [ ] Spam protection (captcha) works and is not blocking real people
- [ ] If the site sends email from the client's domain, the domain's email authentication (SPF/DKIM) is set up

## 4. Integrations and payments
- [ ] Payments tested in **test mode** on staging; switch to live keys at launch
- [ ] After launch, the client makes one real low-value order and refunds it
- [ ] Order and booking confirmation emails arrive
- [ ] Booking widgets, chat, maps, videos and other embeds load

## 5. SEO
- [ ] No noindex on pages that should be found *(launch-check)*
- [ ] robots.txt allows crawling and lists the sitemap *(launch-check)*
- [ ] Sitemap on the live domain lists only final, indexable 200 URLs *(launch-check)*
- [ ] Canonicals are full URLs on the live domain *(launch-check)*
- [ ] No staging URLs anywhere: links, canonicals, og:url, images, sitemap *(launch-check)*
- [ ] Missing pages return 404 (no soft 404) *(launch-check)*
- [ ] Redirects: every old URL → its new URL, 301, one hop *(launch-check `--redirects`; build the map with the redirect-map skill if installed)*
- [ ] Titles and meta descriptions on every key page (meta-schema skill if installed)
- [ ] Structured data (Organization or LocalBusiness on the homepage), hreflang if the site has several languages
- [ ] The staging address stays hidden from Google after launch (indexing off, password or noindex)

## 6. Analytics and conversion events
- [ ] Analytics on every page *(launch-check finds the tag in the HTML)*
- [ ] Key events fire: form sent, purchase, booking, phone and email clicks — test in the tool's real-time or debug view
- [ ] Search Console property verified for the live domain
- [ ] Google Business Profile and social profiles link to the new site

## 7. Consent and legal
- [ ] Privacy policy linked in the footer; cookie policy, terms and imprint where the markets need them *(launch-check finds the links)*
- [ ] Consent banner where the client's markets require one, and tags wait for consent — check in a browser *(launch-check flags tracking without a consent tool)*
- [ ] Accessibility statement where required
- This list is not legal advice: the client should confirm the rules for their markets.

## 8. Performance
- [ ] PageSpeed (mobile) on the homepage and key templates (proof-check). Aim for LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1, and say whether the numbers are field or lab data
- [ ] Images sized and compressed, fonts loaded efficiently, unused scripts and apps removed

## 9. Accessibility
- [ ] Keyboard use and visible focus, colour contrast, form labels, heading order, alt text, page language (proof-check's accessibility snippet)

## 10. Security
- [ ] HTTPS everywhere; http:// redirects to https:// in one hop *(launch-check)*
- [ ] No mixed (http) content *(launch-check)*; security headers reviewed *(launch-check, info only)*
- [ ] Admin accounts: old users removed, strong passwords and two-factor login on. Never write passwords in the report — only where they are kept
- [ ] Plugins, themes and apps updated (WordPress); backups on, and one restore tested

## 11. DNS and domain
- [ ] **A day before:** lower the DNS TTL (e.g. 300 seconds) and save a copy (screenshot) of the current records for rollback
- [ ] Both `www` and the root domain work and redirect to one main host *(launch-check `--expect-host`)*
- [ ] Email records (MX, SPF, DKIM) are not changed by mistake when DNS is edited
- [ ] SSL certificate covers both `www` and the root domain
- [ ] Domain renewal date known; domain registered in the client's name
- [ ] After a stable week, raise the TTL again

## 12. Rollback plan
- [ ] What "broken" means (site down, payments failing, forms lost) and who decides to roll back
- [ ] How: switch DNS back to the saved records, re-publish the previous version, or restore the backup
- [ ] Keep the old site and its hosting for at least two weeks

## Platform go-live steps

Menu names were checked against the platforms' official help pages in November 2026. Platforms rename menus often — if a menu is not where it says, search the platform's help before guessing.

### Webflow
- Add the domain in **Site settings → Publishing → Production** ("Add a custom domain", then verify it). Choose the main domain (www or root) there.
- Publish: open the **Publish** menu, tick the custom domain(s), click **Publish to selected domains**.
- Keep staging hidden: **Site settings → SEO → Indexing**, turn **Staging indexing** off (older docs call it "Disable Webflow subdomain indexing"; needs a paid site plan). Check the custom domain is *not* blocked by the robots.txt rules in the same section.
- Redirects: **Site settings → Publishing → 301 redirects** (old path → redirect to path), then publish again.
- If the site uses a global canonical URL in the SEO settings, it must be the live domain.

### Framer
- Domain: **Site Settings → Hosting → Domains** → connect a domain you own.
- Indexing is set **per page**: page gear icon → **Page Settings** → **Search engines** must be on for every page that should be found.
- Redirects: **Site Settings → Hosting → Redirects** (paths on the site's own domain).
- Framer's help does not say whether the free `*.framer.app` / `*.framer.website` address is hidden after a custom domain is connected. After launch, run the post check with `--staging <name>.framer.website` and check the canonical URL setting points at the live domain.

### WordPress
- **Settings → Reading → Search engine visibility**: untick **"Discourage search engines from indexing this site"**, then **Save Changes**. This is the most common WordPress launch mistake.
- Settings → General: WordPress Address and Site Address use the live domain with https.
- Replace staging URLs stored in the database (a search-and-replace plugin or WP-CLI `wp search-replace`) — take a backup first.
- Turn off maintenance or coming-soon plugins; check the SEO plugin's sitemap and settings; set up SMTP so form emails arrive.

### Shopify
- Remove the password page: **Online Store → Preferences → Store access**, turn off **Private mode** (or Online Store → Private → Public → Update; the first time it says "Launch store"). Needs a paid plan. The mobile app calls it "Password protection".
- Set the primary domain in the domain settings.
- Redirects: search for **URL redirects** in the admin and add old → new paths.
- Links to `*.myshopify.com` for checkout are normal; links to old pages are not.

### Vercel
- Domain: Project **Settings → Domains** → **Add Existing**.
- Production branch: Project Settings → **Environments → Production → Branch Tracking** (the old Settings → Git location is out of date).
- Redirects live in the project's config (for example `vercel.json` or the framework's redirect settings).

### Netlify
- Domain: the project's **Domain management** → "Add a domain" → "Add a domain you already own".
- Production branch: **Project configuration → Developer settings → Continuous deployment → Branches and deploy contexts → Configure**.
- Redirects: the `_redirects` file or `netlify.toml`.

## After launch

### Same day
- [ ] `launch-check.mjs <live-url> --phase post --expect-host <host> --staging <staging-host> --redirects <map.csv>` — fix every fail now
- [ ] proof-check on the live homepage and key pages, including PageSpeed (mobile)
- [ ] Submit every form on the live site with test data
- [ ] Search Console: open the **Sitemaps** report, add the sitemap URL, **Submit** (owners only); inspect the homepage URL and request indexing
- [ ] Domain change only: Search Console **Change of Address** tool, in the old property's settings. It needs 301 redirects from old to new and both properties verified with the same Google account. It is not for http → https or www → non-www moves
- [ ] The staging address is hidden (indexing off, password or noindex)

### Week 1
- [ ] Search Console page indexing report: pages not indexed and why, new 404s → add redirects
- [ ] Analytics: data arrives, key events fire
- [ ] Form entries and order emails arriving
- [ ] Run the post-launch check again

### Month 1
- [ ] SEO audit (seo-audit skill if installed), compared with the pre-launch crawl: score, issues, indexed pages
- [ ] Search Console clicks and impressions compared with before launch — only from Search Console data, never estimated
- [ ] Raise the DNS TTL again; remove the old site after the agreed time
