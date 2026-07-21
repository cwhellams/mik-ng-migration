# Changelog

Summary of notable changes between production `v1.1.70` and the current codebase.

## Major features

- **Member expense claims & reimbursements** — new self-service flow for submitting fuel and general expense claims, with an admin dashboard widget, AOG (Aircraft On Ground) statistics, and multi-currency line item support.
- **DTO training module (MVP)** — syllabus management, JSON syllabus import, flight-based progress verification, trainee progress views, and a student self-service portal.
- **Defect recording** — members can log aircraft defects/snags directly from flight log entries, through to admin review (DB, backend API, and frontend).
- **Inventory module** — track club assets and consumables.
- **Club events** — agenda view, admin CRUD, and a public API for club events.
- **Aircraft booking transfer** — members can transfer a booking to another member, with a confirmation step.
- **Flight log export** — export flight logs to file.
- **Maintenance notes on flight log** — attach maintenance notes to logbook entries.
- **New statistics & reports** — year-on-year flight time comparison chart, and an airfield efficiency report (EFNU / inbound / away flight split).
- **Medical certificate tracking** — Class 1, Class 2, and LAPL medical certificates on member profiles.
- **Seasonal billing discounts** — 50% off the equipment fee and new-member membership fee for members joining late in the season.
- **Honorary membership support** — honorary members get full flying rights with a 100% invoice discount and no annual fee.
- **Exam system enhancements** — randomised exam questions per attempt, and Traficom exam import.
- **Board visibility into invoicing** — unpaid/overdue invoices view for board members, with PDF links.
- **Aircraft document expiry notifications** — automatic email alerts to maintenance when aircraft documents are expiring or expired.

## Notable fixes & security

- Fixed weight & balance calculator incorrectly reporting in-balance landings as out of balance, caused by taxi fuel moment being subtracted twice.
- Stopped leaking internal error messages to API clients.
- Fixed database backups crashing due to an incorrect connection string.
- Fixed future bookings not being cancelled when a member's booking access is revoked.

### Minor changes

- Various expense claim fixes: fuel litres validation, leftover claim-level aircraft validation, fuel claim calculation bug, VAT removed from claims, currency label added to line items.
- Admins could not edit a user's email address — fixed.
- Recent flights list now shows all crew roles and sorts newest-first.
- Fixed noisy 403 errors for external users on dashboard load.
- Fixed inline barcode/QR images not rendering in invoice emails.
- Enforced minimum age for junior membership registration.
- Upcoming reservations now shown on member profiles for admins.
- Added a cron worker to purge expired document tiny URLs.
- Fixed "virhemerkinta" (violation fee) price field bugs.
- Reduced mandatory fields for external users and on the flight diary.
- Added an admin-settable "must update profile" flag.
- Various deploy/build fixes (Node engine pinning, Digital Ocean build issues).
- Routine dependency updates and security patches (Dependabot).
- Upgraded TypeScript to v7.0.2.
