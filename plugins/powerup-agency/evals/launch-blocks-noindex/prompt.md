---
max_turns: 15
allowed_tools: [Read, Glob, Grep, Skill]
---

We go live tomorrow — here's the homepage HTML from staging, are we ready?

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acme Bakery — Fresh cakes in Dubai Marina</title>
<meta name="description" content="Family bakery in Dubai Marina. Birthday and wedding cakes, baked fresh every morning. Order online for pick-up or delivery.">
<meta name="robots" content="noindex">
<link rel="canonical" href="https://acme.webflow.io/">
<link rel="icon" href="/favicon.png">
</head>
<body>
<header>
  <a href="/">Acme Bakery</a>
  <nav><a href="/cakes">Cakes</a> <a href="/about">About</a> <a href="/contact">Contact</a></nav>
</header>
<main>
  <h1>Fresh cakes, baked every morning</h1>
  <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
  <img src="/images/cakes.jpg" alt="A table of birthday cakes">
  <form action="/contact" method="post">
    <input type="email" name="email" placeholder="Your email">
    <button type="submit">Get our menu</button>
  </form>
</main>
<footer>© 2026 Acme Bakery · Dubai Marina</footer>
</body>
</html>
```
