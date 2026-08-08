# Frontend test harness

Shared infrastructure for frontend tests — phase 0 of [issue #1116](https://github.com/MIK-dev-team/mik-ng/issues/1116).

Everything here exists so that a test file states only what it is actually about. If you find
yourself re-creating providers, hand-rolling a `Member` object or stubbing `fetch`, the harness is
missing something — extend it rather than working around it.

```bash
pnpm test              # run once
pnpm test:watch        # watch mode
pnpm test:coverage     # run with a coverage report in apps/frontend/coverage/
```

## What runs where

Tests are `src/**/*.test.ts` / `.test.tsx`, colocated with the code they cover. Everything runs in
**jsdom**; a pure-logic suite that wants the slightly faster node environment can opt out per file:

```ts
// @vitest-environment node
```

`src/test/setup.ts` runs before every file. It installs the jest-dom matchers, starts MSW, pins the
UI language to English, stubs `@iconify/react` (so no icon is fetched over the network) and fills in
the browser APIs jsdom lacks — `matchMedia`, `ResizeObserver`, `IntersectionObserver`,
`URL.createObjectURL`, `scrollIntoView`, and `localStorage`/`sessionStorage`.

The timezone is pinned to **`Europe/Helsinki`** (in `vitest.config.ts`), so local time is UTC+2 in
winter and UTC+3 in summer — the club's actual timezone. Under CI's default `TZ=UTC` every
local-versus-UTC assertion would pass without proving anything. Anything reading the clock should
freeze it with `vi.setSystemTime` rather than relying on the wall clock.

## Rendering a component

```tsx
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders'
import { aBooking } from '../../test/fixtures'

it('shows the aircraft registration', async () => {
  const { user } = renderWithProviders(<BookingCard booking={aBooking()} />)

  expect(await screen.findByText('OH-STL')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Cancel booking' }))
})
```

`renderWithProviders` wraps the element in every provider the app supplies — i18n, the MUI theme,
the date-picker localization provider, SWR (with a **fresh cache per render**, so tests can't leak
data into each other), the server clock and a `MemoryRouter`. Options:

| Option        | Default | Purpose                                                                |
| ------------- | ------- | ---------------------------------------------------------------------- |
| `route`       | `/`     | URL the router starts at                                               |
| `path`        | —       | Route pattern to mount at, so `useParams` resolves                     |
| `sudo`        | `false` | Start in admin mode                                                    |
| `language`    | `en`    | UI language                                                            |
| `timezone`    | `utc`   | Preferred timezone, as persisted by `ThemeContext`                     |
| `themeMode`   | `light` | Colour mode                                                            |
| `serverClock` | `true`  | Wrap in `ServerClockProvider` (which syncs against `GET /api/v1/time`) |

For hooks, use `renderHookWithProviders` — same options, same providers, plus `initialProps` for
hooks you want to `rerender` with new arguments. A hook that needs no providers at all (pure state,
`localStorage`, DOM refs) is better off with Testing Library's plain `renderHook`.

Two things to know before writing a hook test:

- **`useApi` redirects by calling `navigate()` in its render body.** That only settles because the
  redirect unmounts the caller, so a bare `renderHook` left mounted across the redirect spins
  forever. Test redirect behaviour through a `<Routes>` tree (see `useApi.test.tsx`).
- **MSW cannot parse a multipart upload with `request.formData()`** — the body carries a jsdom
  `File`, which undici's parser rejects. Read `await request.text()` and parse the fields
  (see `useAircraftDocumentUpload.test.tsx`).

## Faking the API

MSW answers every HTTP request. `src/test/msw/handlers.ts` holds happy-path defaults for the
endpoints the app shell always hits (`/me`, `/members/roles`, `/config`, `/time`, ...) plus the core
collections. Override per test and the override is undone automatically afterwards:

```ts
import { http } from 'msw'
import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'

server.use(http.get(apiUrl('v1/aircrafts'), () => problemResponse(403, 'Forbidden')))
```

**Unhandled requests fail the test.** That is deliberate: an "unexpected request" error means a
handler is missing, not that the component is broken. Add it to the test, or to `handlers.ts` if the
whole suite needs it.

## Permissions

`src/test/auth.ts` is the frontend counterpart of the backend's admin / member / no-permissions
token triad, plus the two cases that only exist in the UI:

```ts
import { authScenarios, renderAs, signInWithPermissions } from '../../test/auth'

renderAs(authScenarios.admin, <MemberChangeLog />) // every permission, sudo on
renderAs(authScenarios.adminNoSudo, <MemberChangeLog />) // same admin, sudo off
renderAs(authScenarios.user, <MemberChangeLog />) // Matti1, ordinary member
renderAs(authScenarios.none, <MemberChangeLog />) // Liisa1, no permissions
renderAs(authScenarios.anonymous, <MemberChangeLog />) // not signed in

signInWithPermissions(MIKPermissions.EXPENSE_ADMIN) // just one permission
```

Because `authScenarios` is a plain object it drops straight into a table-driven suite:

```ts
it.each(Object.values(authScenarios))('$name', async (scenario) => { ... })
```

## The route permission matrix

`src/test/routeMatrix.tsx` holds every route in `AppRoutes.tsx` with the permission gate it carries,
plus the harness that visits one. The four `src/AppRoutes.permissions.<identity>.test.tsx` files
each run the whole table against one identity — split across files because tests inside a file run
in sequence, and rendering every page four times over is the most expensive thing in the suite.

If you add or re-gate a route, update `ROUTES` in `routeMatrix.tsx`. `AppRoutes.permissions.test.tsx`
fails loudly when the number of `<RequirePermission>` gates in the source stops matching the table,
and the admin run fails if a listed path no longer resolves.

The matrix asserts the **gate**, not the page: pages render against a catch-all API stub, and one
that cannot cope with it is caught by an error boundary and counted as "the gate let us through".

## Fixtures

`src/test/fixtures/` holds typed builders. Each takes an `overrides` object and returns a complete,
valid entity, so a test names only the fields it cares about:

```ts
const expired = aMember({ medicalExpiry: '2020-01-01' })
```

Available: `aMember`, `anAdmin`, `anInstructor`, `aMemberWithoutPermissions`,
`aMemberWithPermissions`, `aMemberListEntry`, `anAircraft`, `aBooking`, `aFlightLog`,
`aFlightLogListEntry`, plus the role catalogue in `roles.ts`.

The entities are the **same cast the backend suite uses** — member `Matti1`, admin `k1mnimda`,
aircraft `OH-STL` — seeded by `sql/schema/testdata/`. Keeping the names identical on both sides
means a developer reading a frontend test recognises the entities from the backend one. See
`fixtures/cast.ts`.

## Component tests

Every component in `src/components/` has a colocated `*.test.tsx`. A few things that come up
repeatedly there:

- **MUI keeps dialogs and menus mounted through their exit transition**, so assert their
  disappearance with `waitFor`, not synchronously.
- **An Autocomplete's clear button only joins the accessibility tree once the field is focused** —
  click the combobox before looking for it.
- **`user-event` refuses to click a disabled control at all.** To prove a handler stays silent, drive
  the event with `fireEvent` instead.
- **`useMediaQuery` always reports no match** (the `matchMedia` stub returns `matches: false`), so
  components render their desktop layout.

## Conventions

- Test **decisions**, not markup. No snapshot tests.
- Assert on real strings (the harness pins English), not on `t()` keys.
- Prefer role-based queries (`getByRole`) over test IDs.
- Anything with a permission gate gets tested against the scenarios above, not just the happy path.
- Coverage is reported, not enforced. Thresholds arrive with the ratchet in phase 6 of #1116.
