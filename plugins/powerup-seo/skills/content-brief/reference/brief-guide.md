# Brief guide

How to turn the ranking pages and the client's knowledge into a brief a writer can follow. Short rules, then the reason.

## 1. Search intent — read it from what ranks

Google shows what it thinks searchers want. Look at the top results before deciding the page type.

| Intent | The searcher wants to… | Typical ranking pages | Brief should be |
|---|---|---|---|
| **Informational** | learn or solve a problem ("how to…", "what is…", "ideas") | guides, how-tos, lists | a guide or article that answers fast, then goes deeper |
| **Commercial** | compare before choosing ("best…", "… vs …", "… prices") | comparisons, lists, reviews, price guides | a comparison or price guide with honest criteria |
| **Transactional** | buy or book now ("order…", "buy…", "… near me") | product, category and service pages | a service/product page: offer, proof, price info, clear CTA |
| **Local** | find a provider in a place ("… dubai", "… in marina") | service pages of local businesses, map results, directories | a service or location page with real local detail |

How to read it:
- Count the page types in the top results. If 7 of 8 are service pages, a blog post will struggle — and the other way round.
- **Mixed results** (guides and service pages) mean mixed intent: a service page with a strong guide section, or two pages that link to each other.
- **Directories and marketplaces** ranking high means searchers want to compare options: add comparison help (price factors, how to choose) to your page.
- Note the format that wins: lists, tables, galleries, calculators, videos. The brief should use a format at least as useful.
- Freshness: if most top pages were updated this year, the topic changes — plan a date in the content and a yearly refresh.

## 2. Length — a range from the evidence, never padding

- Google has said it has no preferred word count. Length follows from covering the topic well, not the other way round.
- Use the script's range (around the median of the ranking pages, main content only). Quote the evidence in the brief.
- If one page is much longer than the rest, it doesn't set the target — read it: is it long because it's thorough, or because it's padded?
- Service and location pages often rank with fewer words than guides, because photos, prices and reviews do much of the work. Trust the ranking pages over any rule of thumb.
- Tell the writer what to **cut**: long intros, repeated keyword phrases, history nobody asked for.

## 3. Location pages — done right, and the doorway trap

Google's spam policies call it **doorway abuse** when a site makes many similar pages for different cities or regions that mainly funnel visitors elsewhere. Swapping the city name in the same text is the classic example.

A location page is worth publishing only if it has real local content:
- The address or service area, opening hours, local phone, a map, directions/parking.
- Local proof: projects or orders in that area, reviews from local customers, photos taken there.
- Local details that change the service: delivery times and fees, venues you work with, local rules or permits.
- A local team member or contact.

If the client has no real local difference for an area, recommend **one** strong service page that lists the areas served, instead of thin city pages. If they already have city-swapped pages, flag it in the brief.

## 4. Cannibalization — one keyword, one page

When two client pages target the same keyword, they compete and often both rank worse.
- Check Search Console (or the export) for client pages already getting impressions for the keyword, and the script's `possibleCannibalization` (client pages with the keyword in the title or H1).
- If one exists, the brief is a **rewrite** of that page, not a new page.
- If two exist, recommend one target page; merge the other into it and 301-redirect the old URL (the **redirect-map** skill helps), or give it a clearly different keyword.
- Record the decision in the seo.md Keywords table so the next brief doesn't create a third page.

## 5. Refresh an existing page or write a new one?

**Refresh** (keep the URL) when the page already targets the keyword, has impressions or links, or ranks on page 2–3. Update facts, prices and photos, fill the gaps the ranking pages cover, improve the title and intro, add internal links. Only change the visible date when the content really changed — Google warns against fake freshness.

**New page** when no page matches the intent (e.g. you have a service page but searchers want a price guide), or the topic is clearly different from every existing page.

**Merge** when several thin pages cover parts of one topic: one strong page + redirects.

Never change a ranking page's URL without a redirect.

## 6. E-E-A-T in practice

Experience, Expertise, Authoritativeness, Trust. Google's guidance asks "Who made this, how, and why?" Make the answers visible:
- **Who:** a real author or expert with a short bio (role, years, qualifications) and a photo. For a business page, the team behind the work.
- **Experience:** first-hand details only the client has — their process, real numbers, mistakes they see customers make, before/after photos. Ask the client; never invent them.
- **Proof:** case studies, reviews (with permission), awards, certifications, press.
- **Accuracy:** cite official or expert sources for facts, rules, health or money claims. Prices: give real ranges or the factors, never made-up numbers.
- **Trust basics:** contact details, about page, clear prices or how pricing works, policies.
- Topics that affect health, money or safety need stronger evidence and a qualified reviewer.

## 7. FAQ sections

- Useful for readers when they answer real questions (from ranking pages, Search Console queries, the client's inbox, "People also ask"). Keep answers short and direct; link to the section with the full answer.
- Don't add an FAQ just for search features. **Google no longer shows FAQ rich results** (it limited them to government and health sites in 2023 and stopped showing them in May 2026). Never promise them to a client.
- FAQPage markup no longer earns a rich result in Google and is not a ranking shortcut. Leave the markup decision to the **meta-schema** skill.
- Don't repeat the same FAQ on many pages — each page answers its own questions.
