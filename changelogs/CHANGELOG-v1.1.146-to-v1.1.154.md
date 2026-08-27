# Changelog: v1.1.146 → v1.1.154

## Major features

- **Admin/member app split** (#1259, #1262, #1263, #1264, #1266): back-office functionality
  moved out of the member app into a new standalone `apps/admin` app (`twr.mik.fi`), with
  accounting, member-admin, and other admin-only screens ported over and dead admin menu
  entries/broken cross-app links removed from the member app.
- **Liquid Management System** (#1119): fuel/oil tracking ported onto the new admin/member
  split, including a redesigned wizard fuel/oil UX, a unified fuel/oil/defect/remark entry
  flow merged into the flight audit trail, and QR-based canister top-ups.
- **Item reservation calendar** (#1139): a calendar for reserving shared equipment/items,
  added under Schedule, with its own flight-booking integration.
- **Per-member reservation efficiency report** (#1174): a new stats report showing
  reservation efficiency per member.
- **Occurrence registry report for Traficom** (#519, #1246): annual safety-occurrence
  registry export for regulatory reporting.
- **Avatar upload rework** (#1281): browser-side crop/zoom before upload, backed by
  restricted-bucket presigned URLs instead of direct uploads.
- **Mass & balance mobile UX** (#382): inputs reachable without scrolling on small screens,
  plus a breakpoint-change bug fix and full i18n coverage of remaining hardcoded strings.
- **Exam question/choice reordering** (#855): exam questions and choices can now be
  reordered, with a new question-order version to track the change.

## Notable fixes & security

- **Stopped production and beta sharing one auth cookie** (#1279): fixed a cookie-scoping
  bug where `intra`/`twr` and `beta`/`beta-twr` could clobber each other's session cookie.
- **Fixed the admin app login loop** across the `beta-twr` subdomain (#1272), and removed
  stale host-only auth cookies that were shadowing the shared `.mik.fi` cookie.
- **Fixed i18next HTML-escaping interpolated values** (#1255) — translated strings were
  being double-escaped/mis-rendered.
- **Stopped sending an undocumented `code` field** on flight invoice Tasks to SimplBooks
  (#1287).
- **Normalized `CORS_ALLOWED_ORIGINS` entries** to real `Origin` header form.
- **Fixed several Flyway migration version collisions** introduced by parallel feature
  branches (V2010/V2020 renumbering, #1286; further script-ordering fix after release).

## Minor changes

- Fixed numerous liquid-record correctness bugs: aircraft/canister validation, visibility
  rules, a TOCTOU race, tax-year handling, claim-reject unlinking, audit trail gaps, and
  admin liquid access/UI issues — each with new regression tests.
- Extracted `AirfieldAutocomplete` and reused shared date-formatting/`SaveButton` components
  to de-duplicate the liquid screens.
- Added test coverage for previously untested admin liquid sections and fixed a stray
  unescaped NBSP in a test.
- Fixed HETU decrypt-crash on undecryptable data in the admin expense claims list.
- Extracted shared stats year-range helpers (#894).
- Added exam test data covering both random and fixed question ordering (#855).
- Fixed exam testdata question-id collisions with existing test fixtures.
- Adjusted `apps/admin`/`apps/frontend` coverage thresholds as code moved between them
  during the app split.
- Corrected drifted and fabricated content in `copilot-instructions.md` (#1291).
- Registered Express/NodeJS/PDFKit as ESLint globals in the backend.
