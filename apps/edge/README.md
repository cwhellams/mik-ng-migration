# `apps/edge` — the Cloudflare edge Worker

Serves the built member SPA from Cloudflare's Static Assets and proxies everything the API
owns to the origin, so both stay on **one hostname**. This is step one of the strangler
migration described in [`docs/cloudflare-migration-plan.md`](../../docs/cloudflare-migration-plan.md);
nothing about the backend changes yet.

## Why the two live on one origin

DigitalOcean's ingress puts the SPA and the API on the same hostname today, and three
things depend on that:

- the auth cookie, which `apps/backend/src/routes/auth/cookies.ts` scopes deliberately;
- the absence of a CORS preflight in front of every API call;
- the service worker's hand-tuned `/t/*` rules — `navigateFallbackDenylist` plus a
  `NetworkOnly` runtime rule in `apps/frontend/vite.config.ts` — which exist so a tiny-URL
  navigation falls through to the network instead of being answered with `index.html`.

The Worker reproduces that arrangement rather than replacing it.

## Routing

| Path                        | Handled by                                                         |
| --------------------------- | ------------------------------------------------------------------ |
| `/api/*`, `/t/*`, `/health` | Proxied to `LEGACY_ORIGIN`, unchanged, with redirects not followed |
| Anything matching an asset  | The Static Assets binding                                          |
| Any other navigation        | `index.html`, so client-side routes deep-link                      |
| Any other miss              | 404                                                                |

Two details are load-bearing and have tests:

- **A missing `.js` or `.css` is a 404, not `index.html`.** Serving HTML for a missing
  chunk is what produces `Unexpected token '<'` in the console, which is much harder to
  read than a 404 naming the chunk.
- **`/t/:code` redirects are returned unfollowed.** That route answers `302` to a presigned
  storage URL; following it in the Worker would stream the file back under a URL the
  browser never navigated to.

Note that auth is at `/api/auth`, not `/auth` — see the `app.use()` mounts in
`apps/backend/src/app.ts`.

## Local use

```bash
pnpm --filter frontend build      # produces apps/frontend/dist
pnpm --filter edge build          # typechecks, then copies that bundle to apps/edge/dist
pnpm --filter edge dev            # wrangler dev, proxying /api to localhost:3000
pnpm --filter edge test
```

`pnpm build` at the repo root does the first two in the right order: `frontend` is a
workspace dependency of this package purely to make the build topological.

## Deploying

```bash
pnpm --filter edge deploy --env beta
```

**There is no `routes` entry in `wrangler.jsonc`, deliberately.** Adding one is the
cutover — it takes the hostname off the DigitalOcean ingress the moment it deploys. Until
then each environment is reachable on its `workers.dev` preview URL, which exercises
everything except the production DNS name.

## A note on `@cloudflare/workers-types`

It is pinned to an exact version rather than a caret range. The package publishes a new
build every day, so a caret range resolves to something released hours ago and trips the
lockfile's `minimumReleaseAge` supply-chain gate on every install — which pnpm "fixes" by
appending the day's version to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`. Bump
the pin deliberately when a new runtime API is needed.
