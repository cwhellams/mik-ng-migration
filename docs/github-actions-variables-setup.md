# GitHub Actions Environment Variables Setup Guide

This document lists all environment variables and secrets that need to be configured in GitHub Actions for both the `prod` and `TEST` environments.

## Environment Scoping Pattern

As of this PR, we use GitHub's built-in environment scoping instead of `_PROD`/`_TEST` suffix patterns:

- Variables are named the same in both `prod` and `TEST` environments
- The workflow's `environment:` declaration determines which set of values is used
- Only secrets with truly different values per environment use explicit suffixes for clarity

## How to Configure

1. Navigate to the repository settings: `Settings` → `Environments`
2. Select either `prod` or `TEST` environment
3. Add variables under "Environment variables" and secrets under "Environment secrets"
4. Use the same variable name in both environments (different values as needed)

## Required Configuration

### New Variables from PR #1153 (Missing from PRs #1088, #1090, #1107)

These variables were added to the deployment workflows but need to be configured:

#### Qualification Expiry Worker (#1088)

| Variable                                     | Type     | Recommended Value (prod) | Recommended Value (TEST) | Notes                                    |
| -------------------------------------------- | -------- | ------------------------ | ------------------------ | ---------------------------------------- |
| `QUALIFICATION_EXPIRY_WORKER_ENABLED`        | Variable | `true`                   | `true` or `false`        | Enable daily qualification expiry checks |
| `QUALIFICATION_EXPIRY_WORKER_RUN_ON_STARTUP` | Variable | `true`                   | `false`                  | Run on deploy (safe for prod)            |
| `QUALIFICATION_EXPIRY_REMINDER_DAYS`         | Variable | `15`                     | `15`                     | Days before expiry to send reminder      |

#### Mailbox Cleanup Worker (#1088)

| Variable                                | Type     | Recommended Value (prod) | Recommended Value (TEST) | Notes                         |
| --------------------------------------- | -------- | ------------------------ | ------------------------ | ----------------------------- |
| `MAILBOX_CLEANUP_WORKER_ENABLED`        | Variable | `true`                   | `true` or `false`        | Clean up old mailbox messages |
| `MAILBOX_CLEANUP_WORKER_RUN_ON_STARTUP` | Variable | `false`                  | `false`                  | Don't run on deploy           |

#### Mileage HETU Purge Worker (#1090 - GDPR compliance)

| Variable                                   | Type     | Recommended Value (prod) | Recommended Value (TEST) | Notes                                               |
| ------------------------------------------ | -------- | ------------------------ | ------------------------ | --------------------------------------------------- |
| `MILEAGE_HETU_PURGE_WORKER_ENABLED`        | Variable | `true`                   | `true` or `false`        | **CRITICAL**: GDPR-mandated HETU purge after 7 days |
| `MILEAGE_HETU_PURGE_WORKER_RUN_ON_STARTUP` | Variable | `true`                   | `false`                  | Safe to run on deploy                               |

#### Mileage Geo Service (#1107)

| Variable               | Type     | Recommended Value (prod)              | Recommended Value (TEST) | Notes                             |
| ---------------------- | -------- | ------------------------------------- | ------------------------ | --------------------------------- |
| `NOMINATIM_BASE_URL`   | Variable | `https://nominatim.openstreetmap.org` | Same                     | OpenStreetMap geocoding service   |
| `NOMINATIM_USER_AGENT` | Variable | `mik-ng/1.0`                          | Same                     | User agent for Nominatim requests |
| `OSRM_BASE_URL`        | Variable | `https://router.project-osrm.org`     | Same                     | OSRM routing service              |

### Older Missing Variables (Never Wired In)

These workers exist in code but were never added to deployment configs until now:

#### Booking Reminder Worker (since PR #762, 2026-04-30)

| Variable                          | Type     | Recommended Value (prod) | Recommended Value (TEST) | Notes                                 |
| --------------------------------- | -------- | ------------------------ | ------------------------ | ------------------------------------- |
| `BOOKING_REMINDER_WORKER_ENABLED` | Variable | `true`                   | `true` or `false`        | Send booking reminders                |
| `BOOKING_REMINDER_HOURS_BEFORE`   | Variable | `24`                     | `24`                     | Hours before booking to send reminder |

#### Junior Member Auto-Promotion (since PR #802, 2026-05-22)

| Variable                                 | Type     | Recommended Value (prod) | Recommended Value (TEST) | Notes                                        |
| ---------------------------------------- | -------- | ------------------------ | ------------------------ | -------------------------------------------- |
| `JUNIOR_PROMOTION_WORKER_ENABLED`        | Variable | `true`                   | `true` or `false`        | Auto-promote JUNIOR members on 18th birthday |
| `JUNIOR_PROMOTION_WORKER_RUN_ON_STARTUP` | Variable | `true`                   | `false`                  | Safe to run on deploy                        |

#### SimplBooks Member Sync (incomplete config)

| Variable                                | Type     | Recommended Value (prod) | Recommended Value (TEST) | Notes                             |
| --------------------------------------- | -------- | ------------------------ | ------------------------ | --------------------------------- |
| `SIMPLBOOKS_MEMBER_SYNC_RUN_ON_STARTUP` | Variable | `false`                  | `false`                  | Complete the pair with `_ENABLED` |

### Pre-existing Variables Now Using Environment Scoping

These variables were previously configured with `_PROD`/`_TEST` suffixes. After this PR, they should be renamed to remove the suffix and configured per-environment:

**Variables that need to be renamed** (remove `_PROD` or `_TEST` suffix):

- `PUBLIC_URL_PROD` → `PUBLIC_URL`
- `VITE_API_TARGET_TEST` → `VITE_API_TARGET` (in TEST environment)
- `SMTP_LOGIN_PROD` → `SMTP_LOGIN`
- `SIMPLBOOKS_OUTBOX_WORKER_ENABLED_PROD` → `SIMPLBOOKS_OUTBOX_WORKER_ENABLED`
- `SIMPLBOOKS_COMPANY_ID_PROD` → `SIMPLBOOKS_COMPANY_ID`
- `SIMPLBOOKS_BASE_URI_PROD` → `SIMPLBOOKS_BASE_URI`
- `SIMPLBOOKS_INVOICE_PAYMENT_WORKER_ENABLED_PROD` → `SIMPLBOOKS_INVOICE_PAYMENT_WORKER_ENABLED`
- `SIMPLBOOKS_INVOICE_PAYMENT_WORKER_RUN_ON_STARTUP_PROD` → `SIMPLBOOKS_INVOICE_PAYMENT_WORKER_RUN_ON_STARTUP`
- `OVERDUE_INVOICE_WORKER_ENABLED_PROD` → `OVERDUE_INVOICE_WORKER_ENABLED`
- `OVERDUE_INVOICE_WORKER_RUN_ON_STARTUP_PROD` → `OVERDUE_INVOICE_WORKER_RUN_ON_STARTUP`
- `OVERDUE_INVOICE_SUSPENSION_DAYS_PROD` → `OVERDUE_INVOICE_SUSPENSION_DAYS`
- `OCCURRENCE_NOTIFICATION_WORKER_ENABLED_PROD` → `OCCURRENCE_NOTIFICATION_WORKER_ENABLED`
- `EXPENSE_RECEIPT_BUCKET_PROD` → `EXPENSE_RECEIPT_BUCKET` (✅ set to `mik-expense-receipts` in the `prod` GitHub Environment)
- `AIRCRAFT_MAILING_LISTS_PROD` → `AIRCRAFT_MAILING_LISTS`
- `BREVO_SYNC_WORKER_ENABLED_PROD` → `BREVO_SYNC_WORKER_ENABLED`
- `BREVO_SYNC_WORKER_RUN_ON_STARTUP_PROD` → `BREVO_SYNC_WORKER_RUN_ON_STARTUP`
- `CORS_ALLOWED_ORIGINS_PROD` → `CORS_ALLOWED_ORIGINS`
- `CORS_ALLOWED_ORIGINS_TEST` → `CORS_ALLOWED_ORIGINS` (in TEST environment)
- `TINY_URL_BASE_URL_PROD` → `TINY_URL_BASE_URL`
- `TINY_URL_BASE_URL_TEST` → `TINY_URL_BASE_URL` (in TEST environment)
- `TINY_URL_CLEANUP_WORKER_ENABLED_PROD` → `TINY_URL_CLEANUP_WORKER_ENABLED`
- `TINY_URL_CLEANUP_WORKER_RUN_ON_STARTUP_PROD` → `TINY_URL_CLEANUP_WORKER_RUN_ON_STARTUP`
- `MAILBOX_CLEANUP_WORKER_ENABLED_PROD` → `MAILBOX_CLEANUP_WORKER_ENABLED`
- `MAILBOX_CLEANUP_WORKER_RUN_ON_STARTUP_PROD` → `MAILBOX_CLEANUP_WORKER_RUN_ON_STARTUP`

**Secrets that keep explicit suffixes** (different values per environment require different secret names):

- `POSTGRES_DO_URL_PRIVATE_PROD` (prod only)
- `POSTGRES_DO_TEST_DB_PRIVATE_URL` (TEST only)
- `SMTP_PASSWORD_PROD` (prod only)
- `SMTP_PASSWORD` (TEST only)
- `ACCESS_TOKEN_SECRET_PROD` (prod only)
- `ACCESS_TOKEN_SECRET` (TEST only)
- `MAGIC_LINK_SECRET_PROD` (prod only)
- `MAGIC_LINK_SECRET` (TEST only)
- `REFRESH_TOKEN_SECRET_PROD` (prod only)
- `REFRESH_TOKEN_SECRET` (TEST only)
- `SIMPLBOOKS_API_KEY_PROD` (prod only)
- `SIMPLBOOKS_API_KEY` (TEST only)
- `BREVO_API_KEY_PROD` (prod only)
- `BREVO_API_KEY` (TEST only)

## Critical Issues to Address

### 🔴 Production Issues

1. **`EXPENSE_RECEIPT_BUCKET`** - ✅ Resolved: set to `mik-expense-receipts` in the `prod` GitHub Environment.
2. **`MILEAGE_HETU_PURGE_WORKER_ENABLED`** - ✅ Resolved: set to `true` in the `prod` GitHub Environment (GDPR-mandated purge is now enabled).

### Variables That May Need Values

Some variables have safe fallbacks in code but should be explicitly configured:

- `NOMINATIM_BASE_URL` - Defaults to `https://nominatim.openstreetmap.org`
- `NOMINATIM_USER_AGENT` - Defaults to `mik-ng/1.0`
- `OSRM_BASE_URL` - Defaults to `https://router.project-osrm.org`

## Testing Checklist

After configuring variables in GitHub Actions:

- [x] Verify `prod` environment has all variables listed above
- [x] Verify `TEST` environment has all variables listed above
- [x] Verify `EXPENSE_RECEIPT_BUCKET` is set in prod (not empty)
- [x] Verify `MILEAGE_HETU_PURGE_WORKER_ENABLED=true` in prod
- [ ] Test a deployment to TEST environment
- [ ] Verify workers start correctly in logs
- [ ] Test a deployment to prod environment
- [ ] Monitor worker logs for any configuration errors

## References

- Issue #1153: Original issue tracking these missing variables
- PR #1088: Added qualification expiry and mailbox cleanup workers
- PR #1090: Added HETU purge worker (GDPR compliance)
- PR #1107: Added mileage geo service with Nominatim/OSRM
- Issue #1022: Board decision on HETU GDPR minimization
