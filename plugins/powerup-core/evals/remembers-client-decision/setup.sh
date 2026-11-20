#!/bin/bash
set -e
mkdir -p .powerup/clients/crumb-co
echo "crumb-co" > .powerup/active-client
cat > .powerup/clients/crumb-co/profile.md <<'MD'
# Crumb & Co — client profile

**Summary:** Family bakery in Dubai Marina; new Webflow site with online cake orders.
MD
cat > .powerup/clients/crumb-co/decisions.md <<'MD'
# Crumb & Co — decisions and preferences

- 2026-11-01 — Client profile created (discovery call)
MD
