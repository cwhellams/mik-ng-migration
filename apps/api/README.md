# `apps/api` — the MIK API on Cloudflare Workers

Phase 2 of [`docs/cloudflare-migration-plan.md`](../../docs/cloudflare-migration-plan.md): the
substrate every ported domain needs, plus one domain ported to prove it works end to end.

**Nothing routes here yet.** `apps/edge` still proxies straight to DigitalOcean. This Worker
is deployable and testable on its own; wiring it into the request path is a separate change,
so that this one can be reviewed without a production blast radius.

## What is here

| File                         | Why it exists                                                     |
| ---------------------------- | ----------------------------------------------------------------- |
| `src/context.ts`             | Per-request `env` via `AsyncLocalStorage`                         |
| `src/config.ts`              | Which domains this Worker owns, and the rollback lever            |
| `src/proxy.ts`               | The strangler facade — everything else goes to the legacy backend |
| `src/problem.ts`             | RFC 9457 responses, ported from `routes/response.ts`              |
| `src/securityHeaders.ts`     | The headers `helmet` sets today, reproduced exactly               |
| `src/routes/time/api.ts`     | The first ported domain                                           |
| `src/lib/fieldEncryption.ts` | AES-256-GCM on WebCrypto, same stored format                      |
| `src/lib/jwt.ts`             | HS256 on `jose`, same tokens                                      |

## The request context, and why it is not a parameter

`workerd` has no `process.env`. Bindings arrive per request, on the `env` argument to
`fetch()`. The backend reads **79 distinct `process.env.X` values** across its 213 source
files, and threading an `env` parameter down through 62 Kysely query modules and every
service would be a mechanical edit to nearly every file in it.

So the request handler opens an `AsyncLocalStorage` scope and ported code calls `getEnv()`.
The port of a read site is one word.

`getContext()` **throws** rather than returning a default when there is no request — the
same reasoning `@mik/ui`'s `ApiConfigProvider` gives for throwing on a missing provider. A
silent fallback for something request-scoped lets the code carry on with plausible-looking
wrong values, which is much harder to diagnose. The case it catches in practice is a
module-top-level read, which runs at isolate start where there is no request at all.

This is also where the tenant will live in phase 7. A tenant is ambient to a request in
exactly the same way, and the database handle is derived from it.

## The strangler facade

`config.ts` lists the path prefixes this Worker serves. Everything else is proxied to
`LEGACY_ORIGIN` untouched.

**The unit is a domain, not a route.** A domain is either live on Workers or it is not, so
that cutting over and rolling back are the same one-line change. Serving half a domain from
each backend is the state the list is designed to make impossible — which is why a path
inside a ported prefix that matches no route gets a **404 problem response rather than being
proxied**. A gap inside a domain claimed as ported is a porting bug, and answering it from
the legacy backend would hide that behind a response that looks like it worked.

The `PORTED_PREFIXES` environment variable replaces the compiled-in list wholesale. Setting
it to the empty string sends every path back to the legacy backend **without a deploy**.

The proxy runs _before_ the rest of the middleware stack, so a proxied response is genuinely
unmodified: the legacy backend still runs `helmet` and still owns its own error format, and
stamping this Worker's headers on top would at best duplicate them and at worst send two
CSPs.

## Security headers

`securityHeaders.ts` reproduces what `apps/backend/src/app.ts` sends today. The values were
**captured from `helmet@8.3.0` itself** rather than transcribed from its README, because the
point is parity and a header that quietly stops being sent is not something a test would
otherwise notice.

CSP and HSTS are deliberately absent: the Cloudflare edge rule owns both. The CSP fallback
applies only when `CF-Ray` is missing, which is the same `cf-ray` gate `app.ts` uses — its
absence means the edge rule never ran and the response would otherwise leave with no CSP at
all.

## Crypto: the same bytes, a different API

Neither `node:crypto`'s cipher API nor `jsonwebtoken` runs on `workerd`, so both are
reimplemented. Neither **format** changes, and that is the whole requirement:

- **Field encryption** keeps `<iv>:<ciphertext>:<authTag>`, each part base64. Every
  encrypted HETU already in the members table was written by the Node implementation, and
  this one has to read them — that direction is not recoverable if it is wrong.
- **JWTs** keep the same HS256 and the same `iss`/`aud`/`jti`/`sid` claims. During the
  strangler migration both backends are live at once and a member's cookie is presented to
  whichever one owns the path, so each has to accept the other's tokens.

**The one real difference is where GCM's authentication tag lives.** Node keeps it separate
(`cipher.getAuthTag()`); WebCrypto appends it to the ciphertext. Encryption here splits the
last 16 bytes off, decryption puts them back. Getting that wrong fails silently — encryption
still emits plausible base64, and only reading the rows back fails, by which point they are
written.

So the guarantee is fixtures rather than reasoning, in **both** directions:

| Test                                                     | Proves                                         |
| -------------------------------------------------------- | ---------------------------------------------- |
| `src/lib/fieldEncryption.test.ts`, `src/lib/jwt.test.ts` | This code reads what the Express backend wrote |
| `apps/backend/test/lib/workersCryptoInterop.test.ts`     | The Express backend reads what this code wrote |

The second is not symmetry for its own sake. A rollback leaves rows written by the Worker
being read only by the Express backend, and both sides stay live for months either way.

`jose` has no `ignoreExpiration`, which `/logout` needs — logout never receives the refresh
cookie, since it is path-scoped to `/api/auth/refresh`, so a tab left open past the
15-minute access-token life must still be able to end its session. `verifyJwtIgnoringExpiry`
verifies the signature with `compactVerify` and then checks `iss`/`aud` by hand, rather than
passing a `currentDate` far enough in the past to disable the expiry check — that would
silently disable `nbf` and `iat` validation too.

**Both encryption functions are now async**, because importing a key through
`crypto.subtle` returns a promise. Call sites need `await` when their domain ports.

## Tests

They run **inside `workerd`**, via `@cloudflare/vitest-plugin`. That is worth the setup cost
here specifically: `AsyncLocalStorage` under `nodejs_compat`, per-request `env`, and `fetch`
subrequest semantics all behave differently than they do in Node, and those differences are
the substrate this package exists to provide. Testing them in Node would prove nothing.

```bash
pnpm --filter api test
pnpm --filter api dev     # wrangler dev, proxying unported paths to localhost:3000
```

## Not yet ported

Deliberately out of scope here, each with its own step in the plan: the Hyperdrive/Kysely
per-request transaction executor, bundled email templates, rate limiting
(`RateLimiterMemory` is per-isolate and therefore effectively absent on Workers), and
`routes/version` — which reads the root `package.json` off disk and so needs the bundling
step first.
