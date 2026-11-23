# Structured data guide

Use JSON-LD (`<script type="application/ld+json">`). Google's own docs were checked on 2026-11-20 — see **Sources** at the end. The script `meta-schema.mjs` holds the same rules in one table (`SCHEMA_RULES`); if Google changes a rule, update both.

## Google's rules (read these first)

- **Mark up only what visitors can see.** Every name, price, address, review or date in the markup must be on the page. Hidden or made-up content can bring a manual action.
- **Never invent reviews, ratings or prices.** Ratings must come from real users. No `AggregateRating` or `Review` unless real reviews are shown on that page.
- **No self-serving review stars.** A business marking up reviews of *itself* (Organization or LocalBusiness, including all subtypes) is not eligible for review stars — even when the reviews are real. Stars for local businesses are only for sites that collect reviews about *other* businesses. Real testimonials can still be shown on the page as normal text.
- **Valid markup is not a promise.** It makes a page *eligible* for a rich result; Google decides whether to show one.
- **Use the most specific type** (Bakery rather than LocalBusiness, BlogPosting rather than Article). Several types can be combined in an `@graph`.

## Retired rich results

The markup below is still valid schema.org and harmless, and other search and AI tools may still read it — but Google no longer shows a special result for it. Don't add it expecting stars or dropdowns. The script reports these as `info`.

| Type | Google feature | Stopped |
|---|---|---|
| FAQPage | FAQ rich results (before this, only well-known government and health sites since 2023) | 7 May 2026 (docs removed June 2026) |
| Quiz | Practice problems | January 2026 |
| Course, CourseInstance | Course info | September 2025 |
| Occupation | Estimated salary | September 2025 |
| LearningResource | Learning video | September 2025 |
| SpecialAnnouncement | Special announcements | September 2025 |
| Vehicle, Car | Vehicle listing (Product rules still apply) | September 2025 |
| WebSite → SearchAction | Sitelinks search box | November 2024 |

Breadcrumbs now show on desktop results only (January 2025) — still worth adding.

## Which type for which page

| Page | Types | Notes |
|---|---|---|
| Homepage | Organization **or** LocalBusiness subtype, + WebSite | LocalBusiness when customers visit or call a real place. WebSite (name + url) helps Google show the right site name — homepage only. |
| Contact / location page | LocalBusiness subtype | Same name, address and phone as the Google Business Profile. One block per location page. |
| Service page | Service (provider → the business) | No Google rich result, but describes the offer clearly. Add `offers` only with real, published prices. |
| Product page | Product with Offer | Needs a real price and currency. No price on the page? Don't use Product — use Service or nothing. |
| Blog post / article | BlogPosting (or NewsArticle) + BreadcrumbList | Headline, image, dates and the real author. |
| Event page | Event | Venue name and address, start date with time zone. |
| Team / author page | ProfilePage with a Person as `mainEntity` | |
| Recipe, video, job ad | Recipe, VideoObject, JobPosting | Each has strict required fields — see the table below. |
| FAQ section | FAQPage — optional | Retired rich result (see above). Only if the questions and answers are visible. |

## Required and recommended properties

`fail` = required (Google); `warn` = recommended. Recommended does **not** mean "invent a value" — leave a property out if you don't have a real one.

| Type | Required (fail) | Recommended (warn) |
|---|---|---|
| Organization | — (none) | name, url, logo (also: sameAs, address, telephone, email, description) |
| LocalBusiness + subtypes | name, address (PostalAddress with streetAddress or addressLocality) | telephone, url, openingHoursSpecification, geo, priceRange; address.addressCountry |
| WebSite | name, url | alternateName (only if the site is known by a short name) |
| WebPage | — | — (no rich result; useful inside `@graph`) |
| Article / BlogPosting / NewsArticle | — (none) | headline (keep it short — the script warns over 110 characters), image, datePublished, author (+ author.name); dateModified |
| Product | name + **one of** offers, review, aggregateRating | image, description |
| Offer (in a Product) | price, priceCurrency | availability (also url, priceValidUntil) |
| Service | name (schema.org) | description, provider, areaServed |
| FAQPage | mainEntity → Question with name → acceptedAnswer.text | — |
| BreadcrumbList | itemListElement → ListItem with position, name, item (item may be left out on the last crumb) | — |
| Event | name, startDate, location with address | description, endDate, eventStatus, image, offers, organizer |
| Person / ProfilePage | name / mainEntity | url, image, sameAs |
| Review | author, reviewRating.ratingValue, itemReviewed (unless nested) | datePublished |
| AggregateRating | ratingValue, ratingCount or reviewCount, itemReviewed (unless nested) | bestRating, worstRating |
| VideoObject | name, thumbnailUrl, uploadDate | description, contentUrl, embedUrl, duration |
| Recipe | name, image | author, datePublished, description, recipeIngredient, recipeInstructions, recipeYield, totalTime |
| JobPosting | title, description, datePosted, hiringOrganization.name, jobLocation.address.addressCountry (or remote) | validThrough, employmentType, baseSalary (only if the ad states it) |

A type that ends in a LocalBusiness subtype (e.g. `VeganBakery`), or any item with both `address` and `telephone`, is checked as a LocalBusiness.

## Value rules (the script checks these everywhere)

- **URLs** (url, logo, image, item, sameAs…) are full addresses: `https://www.site.com/page/`, never `/page/`.
- **Dates** are ISO 8601: `2026-11-20`, or `2026-11-20T19:00:00+04:00` with a time. Not `20/11/2026`.
- **Durations** are ISO 8601: `PT45M`, `PT1H30M`.
- **Prices** are plain numbers (`"180.00"`); **priceCurrency** is a 3-letter code (`AED`, `USD`, `EUR`, `GBP`).
- **Opening hours** use `opens`/`closes` as `07:00` and full English day names.
- No empty strings and no placeholders (`TODO`, `lorem`, `{{…}}`, `[Your …]`, `example.com`).
- `"@context": "https://schema.org"` on every top-level block.

## Examples

**Homepage of a local business** (`@graph` keeps everything in one block):

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Bakery",
      "@id": "https://crumb.example/#business",
      "name": "Crumb & Co",
      "url": "https://crumb.example/",
      "logo": "https://crumb.example/logo.png",
      "telephone": "+971 4 555 0123",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "Shop 4, Marina Walk",
        "addressLocality": "Dubai Marina",
        "addressRegion": "Dubai",
        "addressCountry": "AE"
      },
      "openingHoursSpecification": [
        { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], "opens": "07:00", "closes": "19:00" }
      ],
      "sameAs": ["https://www.instagram.com/crumbandco"]
    },
    { "@type": "WebSite", "name": "Crumb & Co", "url": "https://crumb.example/", "publisher": { "@id": "https://crumb.example/#business" } }
  ]
}
```

**Service page:**

```json
{
  "@context": "https://schema.org",
  "@type": "Service",
  "name": "Custom wedding cakes",
  "description": "Tiered wedding cakes designed with you and delivered to venues in Dubai.",
  "provider": { "@id": "https://crumb.example/#business" },
  "areaServed": { "@type": "City", "name": "Dubai" }
}
```

**Blog post + breadcrumbs** (two blocks, or one `@graph`):

```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "How we bake sourdough every morning",
  "image": "https://crumb.example/images/sourdough.jpg",
  "datePublished": "2026-10-02",
  "dateModified": "2026-11-15",
  "author": { "@type": "Person", "name": "Sara Haddad", "url": "https://crumb.example/team/sara/" }
}
```

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://crumb.example/" },
    { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://crumb.example/blog/" },
    { "@type": "ListItem", "position": 3, "name": "How we bake sourdough" }
  ]
}
```

**Product with a real, published price:**

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Chocolate fudge birthday cake",
  "image": "https://crumb.example/images/fudge-cake.jpg",
  "description": "Three layers of dark chocolate sponge with fudge icing. Serves 12.",
  "offers": { "@type": "Offer", "price": "180.00", "priceCurrency": "AED", "availability": "https://schema.org/InStock" }
}
```

**Event:**

```json
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Sourdough basics workshop",
  "startDate": "2026-12-12T09:00:00+04:00",
  "endDate": "2026-12-12T12:00:00+04:00",
  "location": {
    "@type": "Place",
    "name": "Crumb & Co",
    "address": { "@type": "PostalAddress", "streetAddress": "Shop 4, Marina Walk", "addressLocality": "Dubai Marina", "addressCountry": "AE" }
  },
  "offers": { "@type": "Offer", "price": "250", "priceCurrency": "AED", "url": "https://crumb.example/workshops/sourdough/" }
}
```

## When the user asks for review stars

Say it plainly and kindly: Google does not show stars for reviews a business puts on its own site about itself, and adding ratings that aren't real and visible breaks Google's rules and can lead to a penalty. Then offer what works: ask happy customers for Google reviews (they appear in Maps and the business profile), show real testimonials on the page as text, and — for products — use a real review platform whose reviews are shown on the product page.

## Sources (checked 2026-11-20)

- Organization: https://developers.google.com/search/docs/appearance/structured-data/organization
- LocalBusiness: https://developers.google.com/search/docs/appearance/structured-data/local-business
- Site names (WebSite): https://developers.google.com/search/docs/appearance/site-names
- Article: https://developers.google.com/search/docs/appearance/structured-data/article
- Product snippets / merchant listings: https://developers.google.com/search/docs/appearance/structured-data/product-snippet and …/merchant-listing
- Review snippets (self-serving rule): https://developers.google.com/search/docs/appearance/structured-data/review-snippet
- Breadcrumb, Event, Video, Recipe, Job posting, Profile page: https://developers.google.com/search/docs/appearance/structured-data/ (breadcrumb, event, video, recipe, job-posting, profile-page)
- General policies: https://developers.google.com/search/docs/appearance/structured-data/sd-policies
- Retired features: Search Central changelog, https://developers.google.com/search/updates (the FAQPage docs page was removed in June 2026 — don't rely on fetching it)
