# Launch report template

Copy this structure. Replace everything in `<…>`. Delete rows and sections that don't apply — never leave placeholders in a client report.

```markdown
# Launch check — <site or domain>
<Agency name> · <YYYY-MM-DD> · <Pre-launch (staging) / Post-launch (live)> · <New site / Redesign / Migration / Domain change>

**Verdict: ❌ No-go / ⚠️ Go with warnings / ✅ Go**
<One sentence on what decides it, e.g. "2 blockers: noindex is on and every canonical points at the staging domain.">

Checked: <staging URL> → launching on <live domain> · Platform: <…> · Launch: <date and time>

## Blockers — must fix before (or at) launch
| # | Problem | Evidence | Fix | Owner |
|---|---|---|---|---|
| 1 | <e.g. Homepage and 11 pages are noindex> | <launch-check `noindex`: meta robots on https://…/> | <platform setting to change> | <name> |

## Warnings — fix soon or accept
| # | Problem | Evidence | Fix or decision |
|---|---|---|---|
| 1 | <e.g. No consent banner, GA4 found> | <launch-check `consent`> | <fix, or "accepted — see sign-off"> |

## Launch-day steps
Things that are right on staging but must change at launch:
- [ ] <e.g. Turn off "Staging indexing" / allow search engines on the live domain>
- [ ] <e.g. robots.txt allows crawling and lists the sitemap>
- [ ] <e.g. Publish to the custom domain; redirect www → root>

## Checks with evidence
| Check | Result | Evidence |
|---|---|---|
| Site loads | ✅ | <HTTP 200 in 340 ms> |
| Indexing (noindex, robots.txt) | ❌ | <…> |
| Staging leftovers | ❌ | <canonical → https://client.webflow.io/ on 12 pages> |
| Sitemap | ✅ | <48 URLs, 20 sampled, all 200> |
| Missing pages return 404 | ✅ | <random URL → 404> |
| Redirects | ⚠️ | <46 of 48 correct; /old-blog → / instead of /blog> |
| Analytics and consent | ✅ | <GA4 G-… on all pages; Cookiebot> |
| Placeholder text | ✅ | <none on 30 pages> |
| Mobile and desktop look right | ✅ | <proof-check screenshots: paths> |
| Speed (mobile) | ⚠️ | <PageSpeed: score, LCP — field or lab data> |

Sources: launch-check (`<path to JSON>`), proof-check, PageSpeed (<date>), <people who checked by hand>.

## Manual checks
| Area | Item | Result | Checked by | Date |
|---|---|---|---|---|
| Forms | <Contact form: email arrives, not in spam> | ✅ | <name> | <date> |
| Payments | <Test order in test mode> | ⬜ | <name> | |

## Not checked
- <item> — <why: no access, password-protected, not public yet, no connector, do on launch day>

## Sign-off
**The client approves:**
- [ ] Final content and design on <staging URL>, checked on desktop and mobile
- [ ] Forms and email notifications tested
- [ ] Redirect map (<n> redirects)
- [ ] Analytics and cookie consent set-up
- [ ] Launch date and time: <…>
- [ ] Rollback plan: <e.g. switch DNS back to the old records; old site kept for 14 days>

**Accepted risks** (launching with these open, on purpose):
| Risk | Why it is accepted | Accepted by | Date |
|---|---|---|---|
| <…> | <…> | <client name> | <date> |

Client: ______________________ Date: __________
Agency: ______________________ Date: __________

## Follow-ups
- Same day: post-launch check on <live domain>, sitemap submitted in Search Console
- Week 1 (<date>): Search Console page indexing and 404s, analytics data, form entries
- Month 1 (<date>): SEO audit compared with the pre-launch crawl
```
