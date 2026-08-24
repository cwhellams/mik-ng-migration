# Changelog

Summary of notable changes between production `v1.1.132` and `v1.1.146`.

## Major features

- **Crew and instructor flights in a member's own flight log** — a member's flight log now includes flights where they served as crew or instructor, not just pilot-in-command.
- **Combined defect/remark reporting on flight logs** — defects and remarks (FYI-only notes) are now reported through one in-form section, with grounding confirmation required when a defect makes the aircraft unfit to fly, and a long-taxi-time confirmation step. Remarks show inline on the logbook page and roll into the incidents/observations dashboard widget.
- **Reservation type hints** — added explanatory hint text/instructions for reservation types when booking.
- **AME suggestions, ratings, and admin approvals** — members can suggest and rate Aviation Medical Examiners, with an admin approval workflow.
- **School Flight Reservation Efficiency report** — new statistics report.
- **Safety performance indicators on Statistics page** — occurrences-per-100h and related safety metrics.
- **Occurrence report attachments** — members can attach pictures to occurrence reports.
- **HETU (Finnish personal ID) protection & Tulorekisteri mileage report** — HETU values are now masked by default with an audited reveal workflow and a dedicated `hetu_admin` permission; added a Tulorekisteri-format mileage report and HETU checksum validation in the expense claim wizard.
- **Per-user mailbox for system notifications** — qualification expiry and other system notices are now delivered to a per-member notification mailbox instead of (or alongside) email.
- **"Send to CAMO" sharing** for occurrence reports involving aircraft technical faults.
- **Meeting URL / remote join support** — general meetings gained a remote-join URL field and a `PENDING_NOTES` status between ongoing and ended.
- **Public prices API endpoint**.
- **In-flight defect reporting** — pilots can report defects directly while saving a flight log entry.
- **Fuel expense & mileage claim overhaul** — structured mileage routes, a fuel reimbursement cap, treasurer-edit support, receipt upload compression, and full HETU masking on claims.
- **Aircraft document expiry / Brevo newsletter archiving and mailbox groundwork** carried in from the same release wave.

## Notable fixes & security

- Fixed member restore losing profile-page data, member type, and silently dropping credited fees — now warns admins explicitly.
- Fixed the occurrence notification worker re-sending the same emails daily.
- Fixed flight status visibility incorrectly hiding verification state from non-admin viewers.
- Trimmed free-text fields across all API contracts to reject whitespace-only input.
- Security headers audit: added `Permissions-Policy`, fixed duplicate/conflicting CSP headers.
- Prevented `emailVerifiedAt` from being edited via the member PATCH endpoint.
- Enforced minimum age of 15 for junior membership registration (including via the member-edit endpoints).
- Fixed `/club/ame-list` 500 error caused by a missing schema `USAGE` grant.
- Fixed mileage claim edits silently dropping route/date/km/HETU changes, and stale claim totals surviving corrections.
- Fixed events/entry timezone handling — dates now honor the display timezone instead of the browser's local timezone.
- Upgraded `react-router` to v8.3.0 to fix a CSRF vulnerability.

### Minor changes

- Added visible PDF link to member profile invoices; fixed invoice sort order.
- Fixed member profile recent-flights sort order and added a "view all" button.
- Fixed View Mode tabs overflowing on mobile — tabs now wrap onto multiple rows.
- Removed the "blank rows" concept from maintenance notes/defects, replaced by an explicit blank-rows-before model.
- Added indexes on `flight.logs` crew/billable member id columns for performance.
- Show fleet manager contact details when reporting a defect.
- Show already-reported defects when editing a flight log entry.
- Default a new note/defect's time to the flight log's live running total.
- Gated dashboard admin widgets on sudo-aware permissions.
- Fixed deactivate button flicker before member data loads; hid the Deactivate button and rejected deactivation for already-removed members.
- Fixed mobile email layout (responsive viewport, card-stacked invoice table) and Swedish email subjects.
- Fixed invoicing for flight packages.
- Fixed logbook page overflow; consolidated the note/defect row model.
- Added attachments to occurrence reports; fixed several attachment bugs found in review.
- Added year-over-year and safety statistics groundwork; excluded null registrations from occurrence stats.
- Rate limiter now uses differentiated point costs to prevent dashboard 429s.
- Extracted the `@mik/contracts` shared package and migrated most backend modules to `camelCase` Kysely queries (multi-phase refactor, #1115).
- Large frontend test-coverage effort: added ~99 test files (~17k lines) across hooks, components, routes, admin pages, wizards, and forms, plus a per-directory coverage ratchet enforced in CI (#1116).
- Various CI/CD reliability fixes: pinned GitHub Actions off deprecated Node 20 runtime, pinned `doctl` version, quote-safe env substitution for DO app specs, cancel stale CI runs, narrowed backend PR triggers, dropped Dependabot, parallelized frontend tests.
- Routine dependency updates and security patches (including a `js-yaml` bump to fix `pnpm audit` findings).
