import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { matchPath } from 'react-router'
import { describe, expect, it } from 'vitest'

import { ROUTES } from './routeMatrix'

/**
 * The regression this file exists for.
 *
 * A page ported from `apps/frontend`'s old `/admin/*` subtree in #1262 kept
 * six internal "back"/"go to" links pointing at the *old* member-app path
 * (`/admin/exams`, `/admin/shop/orders`, `navigate('/admin/dto')`, ...) even
 * though the route registrations in `AppRoutes.tsx` were correctly rewritten
 * to drop the `/admin` prefix at the same time. Clicking any of them inside
 * the deployed admin app hit its 404 page. A seventh link (`EventsAdmin`'s
 * "view all" button) pointed at `/club/events` — a genuine `apps/frontend`
 * route, but reached with a same-app `Link` instead of `MemberAppLink`, so it
 * 404'd inside *this* app's router instead of crossing over.
 *
 * `apps/frontend`'s `menuItems.test.ts` catches the equivalent class of bug
 * for the header menu; nothing did for a plain `<Link to=...>`/`navigate(...)`
 * buried inside a page body, because those aren't declared anywhere central
 * the way menu items are. This file greps for every one, so a broken internal
 * link fails a test instead of a click.
 */

type LinkTarget = { path: string; file: string; snippet: string }

const SRC = join(process.cwd(), 'src')

const tsxFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return tsxFiles(full)
    return entry.endsWith('.tsx') && !entry.endsWith('.test.tsx') ? [full] : []
  })

/**
 * `<Link to='...'>` and `component={Link}  ...  to='...'` — react-router's own
 * Link, which resolves against *this* app's router. `[^>]*?` stays inside one
 * JSX tag (it can't cross a `>`) and matches across the newlines these props
 * are usually wrapped onto, so both call shapes are covered by one pattern.
 *
 * Deliberately excludes `MemberAppLink` — see `crossAppLinkTargets` below.
 */
const internalLinkTargets = (source: string, file: string): LinkTarget[] => {
  const targets: LinkTarget[] = []
  for (const re of [
    /<Link\b[^>]*?\bto=(['"])([^'"]+)\1/g,
    /component=\{Link\}[^>]*?\bto=(['"])([^'"]+)\1/g,
  ]) {
    for (const match of source.matchAll(re)) {
      targets.push({ path: match[2], file, snippet: match[0].replace(/\s+/g, ' ') })
    }
  }
  return targets
}

/** Same shape, for `<MemberAppLink to='...'>` — checked against `apps/frontend`'s routes instead, in the sibling test below. */
const crossAppLinkTargets = (source: string, file: string): LinkTarget[] => {
  const targets: LinkTarget[] = []
  for (const re of [
    /<MemberAppLink\b[^>]*?\bto=(['"])([^'"]+)\1/g,
    /component=\{MemberAppLink\}[^>]*?\bto=(['"])([^'"]+)\1/g,
  ]) {
    for (const match of source.matchAll(re)) {
      targets.push({ path: match[2], file, snippet: match[0].replace(/\s+/g, ' ') })
    }
  }
  return targets
}

/** `navigate('/path')` — always same-app; there is no cross-app equivalent. */
const navigateTargets = (source: string, file: string): LinkTarget[] =>
  [...source.matchAll(/\bnavigate\((['"])([^'"]+)\1/g)].map((match) => ({
    path: match[2],
    file,
    snippet: match[0],
  }))

const files = tsxFiles(SRC)

// Guards the file walk and the three regexes above from silently finding
// nothing and making every assertion below vacuous.
it('has files to check', () => {
  expect(files.length).toBeGreaterThan(50)
})

describe('internal links (Link, component={Link}, navigate)', () => {
  const all = files.flatMap((file) => {
    const source = readFileSync(file, 'utf-8')
    return [...internalLinkTargets(source, file), ...navigateTargets(source, file)]
  })

  it('found link/navigate calls to check', () => {
    expect(all.length).toBeGreaterThan(15)
  })

  it('points every internal link and navigate() call at a route this app actually serves', () => {
    // Only plain string-literal targets are checked — a `to={`/x/${id}`}` or
    // `to={someVar}` needs per-call-site reasoning a regex can't safely do.
    // Every dynamic target in the app was checked by hand when this test was
    // written; a new one is not covered here and should be checked the same
    // way when it's added.
    const routePatterns = ROUTES.map((route) => route.path)

    const broken = all.filter(
      ({ path }) => !routePatterns.some((pattern) => matchPath(pattern, path) !== null),
    )

    expect(
      broken.map(({ path, file, snippet }) => `${relative(SRC, file)}: ${path}  (${snippet})`),
      'internal links/navigate() calls pointing at routes that do not exist',
    ).toEqual([])
  })
})

describe('cross-app links (MemberAppLink)', () => {
  const all = files.flatMap((file) => crossAppLinkTargets(readFileSync(file, 'utf-8'), file))

  it('found MemberAppLink targets, and every one looks like a real path', () => {
    // Not checked against ROUTES: this app's own catch-all ('*') matches any
    // string via matchPath, which makes an "isn't one of our own routes" check
    // vacuous. There is no local table of apps/frontend's routes to check
    // against instead (@mik/ui deliberately doesn't hold either app's route
    // table), so this stays a shape check — a MemberAppLink target that was
    // never a real path at all (empty, or missing the leading slash) is still
    // worth catching.
    expect(all.length).toBeGreaterThan(0)
    expect(all.every(({ path }) => path.startsWith('/'))).toBe(true)
  })
})
