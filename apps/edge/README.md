# `apps/edge` — the Cloudflare edge Worker

Serves both built SPAs from Cloudflare's Static Assets — the member app at `/`, the admin
app at `/admin/` — and proxies everything the API owns to the origin, so all three stay on
**one hostname**. This is step one of the strangler
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
- **An admin deep-link gets the admin `index.html`.** The two apps are separate bundles, so
  answering `/admin/shop/orders` with the member app's `index.html` loads the wrong
  application with nothing on screen to say so.

Note that auth is at `/api/auth`, not `/auth` — see the `app.use()` mounts in
`apps/backend/src/app.ts`.

## The two topologies

Both are live during the migration, and the SPAs are **not** interchangeable between them:

|                       | DigitalOcean (subdomains) | Cloudflare (one origin) |
| --------------------- | ------------------------- | ----------------------- |
| Admin app's Vite base | `/`                       | `/admin/`               |
| Member → admin links  | `https://twr.mik.fi`      | `/admin`                |
| Admin → member links  | `https://intra.mik.fi`    | `/`                     |
| CORS                  | needed                    | none                    |
| Auth cookie           | `COOKIE_DOMAIN=.mik.fi`   | can be host-only        |

`scripts/build-assets.sh` therefore _builds_ both apps rather than copying whatever
`apps/*/dist` happens to hold, and asserts afterwards that the admin `index.html` really
does reference `/admin/assets/`. A wrong base there is silent: the admin app simply serves
a blank page.

## Local use

```bash
pnpm --filter edge assets    # builds both SPAs for this topology into apps/edge/dist
pnpm --filter edge dev       # the above, then wrangler dev, proxying /api to localhost:3000
pnpm --filter edge test
pnpm --filter edge build     # typecheck only, like packages/ui
```

`build` is deliberately just the typecheck. Assembling the assets rebuilds both SPAs, and
the root `pnpm build` already builds them for the DigitalOcean topology — folding the two
together would build each app twice on every recursive build.

## Deploying

```bash
pnpm --filter edge deploy --env beta   # assembles the assets, then wrangler deploy
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
