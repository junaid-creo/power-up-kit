# Content brief template

Copy the structure below. Replace every `{{…}}`. Delete a section only if it really doesn't apply (e.g. no client memory) — and then say so in **Not checked**. Never leave placeholders in a brief you hand over.

```markdown
# Content brief: {{keyword}}
{{Client}} · {{YYYY-MM-DD}} · prepared by {{agency or "Claude"}}

> ⚠️ {{Only if needed: "The client page {{url}} already targets this keyword — update it instead of writing a new page."}}

## 1. Summary
| | |
|---|---|
| Main keyword | {{keyword}} |
| Related keywords | {{only from a tool, Search Console, or the ranking pages — name the source}} |
| Search intent | {{informational / commercial / transactional / local}} — {{one line: what the searcher wants}} |
| Page type | {{blog post / service page / location page / rewrite}} |
| Target URL or slug | {{/wedding-cakes-dubai/ — or the existing URL for a rewrite}} |
| Audience | {{who reads this and what they care about (profile.md)}} |
| Goal and CTA | {{what the reader should do next, e.g. "Book a free tasting" button after the prices section and at the end}} |
| Length | {{range}} words (see section 4) |

## 2. Search intent and what ranks now
{{3–6 bullets from the pages you compared and read: page types, formats, what they all do, what none do. Name each page.}}

| # | Page | Words | H2s | Schema | Updated | Keyword in |
|---|---|---|---|---|---|---|
| 1 | {{domain/path}} | {{n}} | {{n}} | {{types}} | {{date or —}} | {{title, H1…}} |

## 3. Title, H1 and meta description
**Title** (50–60 characters, keyword near the start)
1. {{option}} — {{n}} characters
2. {{option}} — {{n}} characters

**H1**
1. {{option}}
2. {{option}}

**Meta description** (120–155 characters, a reason to click + the CTA)
1. {{option}} — {{n}} characters
2. {{option}} — {{n}} characters

## 4. Recommended length
**{{min}}–{{max}} words.** Evidence: {{e.g. "median of 5 ranking pages is 1,240 words (range 650–2,100), compare-pages.mjs"}}. Cover every section below fully; don't pad to reach a number.

## 5. Outline
- **H1:** {{chosen H1}}
- Intro ({{~80–120}} words): {{answer the main question fast; keyword in the first 100 words; who we are in one line}}
- **H2: {{section}}** — must cover: {{points, facts, examples, proof}}
  - H3: {{sub-section}} — {{what it covers}}
- **H2: {{section}}** — must cover: {{…}}
- **H2: FAQ** (if useful) — {{questions from section 6}}
- Closing + CTA: {{what to say and the button/link}}

## 6. Questions to answer
| Question | Seen on | Where to answer it |
|---|---|---|
| {{question}} | {{N of M pages / Search Console / People also ask}} | {{H2 "…" or FAQ}} |

## 7. Must-cover subtopics and entities
| Subtopic / entity | Covered by | Note |
|---|---|---|
| {{term}} | {{N of M ranking pages}} | {{how to cover it}} |

Entities to name where true: {{places, products, materials, standards, brands, people}}.

## 8. Our angle — what competitors miss
- {{Gap in the ranking pages}} → {{what we add, and the proof we have for it}}
- {{…}}

## 9. Experience and trust (E-E-A-T)
- **Author / expert:** {{name, role, why they know this; author bio and photo}}
- **First-hand proof:** {{process photos, own numbers, "we have made X…" — only real facts from the client}}
- **Case studies / reviews:** {{which ones, with permission}}
- **Photos:** {{real photos needed — what to shoot}}
- **Sources to cite:** {{official or expert sources for any facts, rules or prices}}

## 10. Internal links
| Direction | Page | Anchor text idea |
|---|---|---|
| Link **from** (add a link on this page) | {{url}} | {{anchor}} |
| Link **to** (link from the new page) | {{url}} | {{anchor}} |

## 11. Media
- {{Image/diagram/video}} — {{where in the outline}} — alt text: {{describe what is in the image, plainly; use the keyword only if it truly describes it}}
- File names: {{descriptive-words.jpg}}; compress images; real photos over stock (brand.md: {{rule}}).

## 12. Schema
Recommended: {{e.g. Article + BreadcrumbList for a post; Service or LocalBusiness for a service/location page}}. Hand off to the **meta-schema** skill. Don't promise FAQ rich results — Google no longer shows them.

## 13. Tone of voice
{{From voice.md: three words, we/you, sentence length, words to use / avoid, language. Or "voice.md not set up — ask the client".}}

## 14. Client rules
{{From seo.md Rules and decisions.md, e.g. "no prices on the site", "blog posts need client approval", "never mention competitor names".}}

## 15. Data sources used
- Ranking pages: {{Ahrefs / Semrush SERP (database, date) / web search (date) / URLs from the user}}
- Page comparison: compare-pages.mjs on {{n}} pages ({{live / saved files / sampled by hand}}) — `{{research json path}}`
- Pages read in full: {{urls}}
- Search Console: {{property, date range — or not connected}}
- Client memory: {{files read}}

## 16. Not checked
- {{Search volume and keyword difficulty — no Ahrefs or Semrush connected}}
- {{Existing client pages for this keyword — Search Console not connected and no export}}
- {{Pages skipped (robots.txt / blocked) and why}}
```
