#!/usr/bin/env bash
#
# Builds both SPA bundles for the single-origin Cloudflare topology and
# assembles them into ./dist, the directory wrangler.jsonc points the Static
# Assets binding at.
#
# The apps are rebuilt here rather than copied from apps/*/dist because the two
# topologies need different bundles, and a copy would silently pick up whichever
# one was built last:
#
#                     DigitalOcean (subdomains)   Cloudflare (one origin)
#   admin Vite base   /                           /admin/
#   member -> admin   https://twr.mik.fi          /admin
#   admin -> member   https://intra.mik.fi        /
#
# Getting that wrong does not fail loudly: the admin app just serves a blank
# page because its asset URLs resolve to the member bundle's paths.
#
# VITE_API_TARGET is deliberately *not* set here. It stays whatever the
# environment supplies, exactly as on DigitalOcean — it still drives the API
# base URL and the environment badge, and under this topology it names the same
# origin the SPA is served from, so the calls are same-origin regardless.
set -euo pipefail

cd "$(dirname "$0")/.."

VITE_ADMIN_URL=/admin pnpm --filter frontend build
VITE_BASE_PATH=/admin/ VITE_MEMBER_URL=/ pnpm --filter admin build

rm -rf dist
mkdir -p dist/admin
cp -R ../frontend/dist/. dist/
cp -R ../admin/dist/. dist/admin/

# The failure this catches is a blank admin app, which names nothing. Vite
# rewrites index.html's asset URLs from `base`, so this is the cheapest proof
# the admin bundle was built for the path it is about to be served from.
if ! grep -q '/admin/assets/' dist/admin/index.html; then
  echo "apps/admin was built with the wrong Vite base - its index.html does not reference /admin/assets/" >&2
  exit 1
fi

# _headers comes from apps/frontend/public and lands at the bundle root, where
# its `/*` rule covers the admin bundle too. Cloudflare Static Assets reads it
# natively, the same file format DigitalOcean's static sites use.
test -f dist/_headers
