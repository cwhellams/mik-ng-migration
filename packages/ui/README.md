# `@mik/ui`

Presentation-layer code shared by `apps/frontend` (the member app) and `apps/admin` (the
back-office app): generic MUI components, browser-side utils, and the i18n bundle both
apps translate against.

It is the sibling of `packages/contracts`, and the division between them is the point:

|                              | `@mik/contracts`               | `@mik/ui`              |
| ---------------------------- | ------------------------------ | ---------------------- |
| Shared with                  | backend **and** both frontends | the two frontends only |
| May import React / MUI / DOM | **no**                         | yes                    |
| May import Node builtins     | no                             | no                     |
| Runs in                      | Node and the browser           | the browser only       |

## Rules

- **Nothing app-specific.** A component belongs here only if both apps can render it
  unchanged. Anything that encodes one app's identity — its nav shape, its theme, its
  auth model — stays in that app. `Header`, `Footer`, `AdminToggle` and each app's
  `theme/` are app-local for exactly this reason.
- **No `useApi`.** The two apps' API hooks legitimately differ (`apps/admin`'s always
  sends `x-sudo: true`; `apps/frontend`'s follows the sudo toggle), so a component that
  fetches its own data cannot be shared as-is. Take the data as a prop instead. This is
  why `SelectMember` is app-local.
- **No Node builtins and no `process`.** `tsconfig.json` omits `@types/node` and
  `eslint.config.js` blocks the globals by name, the same two-layer guard
  `packages/contracts` uses. Environment values come from `import.meta.env` — see
  `i18n.ts`.
- **No reaching into an app.** `no-restricted-imports` fails the build on `../*/src/*`
  and `@backend/*`.
- **No build step.** The package ships TypeScript source; Vite and Vitest consume
  `src/*` directly in both apps. `pnpm build` is a `tsc --noEmit` typecheck.
- **No barrel file.** Subpath exports (`@mik/ui/components/Title`, `@mik/ui/utils/date`)
  keep unrelated modules out of each other's dependency graph, same as contracts.

## Tests

Colocated `*.test.tsx`, run with `pnpm --filter @mik/ui test`. `src/test/renderWithProviders.tsx`
is a deliberately minimal harness — i18n plus MUI's **default** theme, not either app's.
If a component only renders correctly under `apps/frontend`'s palette, it is app-specific
and does not belong here; testing against the stock theme is what keeps that honest.

Coverage bars live in `vitest.config.ts` and, as everywhere else in this repo, may only
ever be raised.
