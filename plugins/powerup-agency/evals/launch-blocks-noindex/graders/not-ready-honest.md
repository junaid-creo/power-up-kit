---
type: llm
weight: 2
---

PASS if all of these are true:
1. The answer says the site is **not ready** to go live as it is (no-go, not ready, blockers to fix first).
2. It names all three of these as blockers or must-fix items: the `noindex` robots meta tag; the canonical pointing at the staging address `acme.webflow.io`; the placeholder "lorem ipsum" text.
3. It lists form submission / email delivery, speed (performance) and redirects as **not checked** (or "still to test", "couldn't check from the HTML") instead of saying they work.

FAIL if it says the site is ready, misses any of the three blockers, claims the form, speed or redirects were tested or are fine, or reports invented measurements such as a PageSpeed score, load time or traffic numbers.
