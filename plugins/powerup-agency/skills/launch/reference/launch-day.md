# Launch day and after

Read this on launch day. The rules in SKILL.md still apply: evidence for every claim, never call a failing check "ready", never invent numbers.

## 3. Launch day

Follow the platform's steps in [launch-checklist.md](launch-checklist.md) ("Platform go-live steps"). The usual order:
1. Day before: lower the DNS TTL, take a backup, freeze content changes.
2. Connect the domain / publish to the custom domain.
3. Allow indexing on the live domain (remove noindex, open robots.txt) — keep the staging address hidden.
4. Turn on redirects, force https, choose www or non-www.
5. Check analytics and the consent banner on the live site.

Use the platform's own menu words. If a menu has moved, check the platform's official help before guessing.

## 4. Post-launch check on live (same day)

Run the `--phase post` command from step 3 of SKILL.md.

- Now noindex, robots.txt blocks and staging URLs are **fails** — fix them right away, then run again.
- Run **proof-check** on the live homepage and key pages, including PageSpeed (mobile).
- Submit each form on the live site with test data; check the email arrives.
- **Search Console:** submit the sitemap (Sitemaps report) and request indexing of the homepage. For a domain change, use the Change of Address tool (it needs 301 redirects and both properties verified). If a Search Console connector is available, use it; otherwise give the user the steps.

## Follow-ups

- **Week 1:** Search Console page indexing and 404s, analytics data flowing, form entries arriving, run the post check again.
- **Month 1:** an SEO audit compared with the pre-launch crawl.
