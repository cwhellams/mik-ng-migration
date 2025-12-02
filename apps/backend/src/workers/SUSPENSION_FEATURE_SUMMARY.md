# Aircraft Reservation Suspension Feature

## Overview

This feature automatically suspends and restores aircraft reservation privileges based on overdue flight invoices. Members with flight invoices that remain unpaid beyond a configurable grace period will have their ability to make reservations temporarily revoked until all overdue flight invoices are paid.

## Configuration

### Environment Variables

- `OVERDUE_INVOICE_SUSPENSION_DAYS` (default: 30)
  - Number of days after invoice due date before suspension occurs
  - Only applies to invoices with `invoice_type = 'FLIGHT'`
  - Example: If set to 30, a flight invoice due on Jan 1 will trigger suspension on Jan 31

## How It Works

### Daily Processing

The overdue invoice worker runs daily at 06:00 (configurable via cron schedule) and performs two main operations:

1. **Send Overdue Reminders** (`processOverdueInvoices()`)
   - Sends email reminders for all unpaid invoices (any type) that are past due
   - Tracks sent emails via `overdue_email_sent_at` column to prevent spam
   - Emails sent in member's preferred language (EN/FI/SV)

2. **Manage Suspensions** (`processSuspendedMembers()`)
   - **Restoration Check**: For all members with `can_make_reservations = false`:
     - Checks if they have any overdue FLIGHT invoices
     - If no overdue flight invoices found, automatically restores reservation privileges
     - Logs restoration action
   - **Suspension Check**: For all members with FLIGHT invoices overdue > `OVERDUE_INVOICE_SUSPENSION_DAYS`:
     - If `can_make_reservations = true`, suspends reservation privileges
     - Logs suspension action with invoice details

### Database Changes

**member.register table:**

- `can_make_reservations` (BOOLEAN) - Controls whether member can make aircraft reservations
- Field is updated automatically by the worker based on invoice payment status

**accts.invoice table:**

- `overdue_email_sent_at` (TIMESTAMP) - Tracks when overdue reminder was sent
- Added by migration V420

### Frontend Integration

**Dashboard Warning Banner:**

- `ReservationsSuspendedBanner` component displays when `can_make_reservations = false`
- Shows error-level alert with explanation
- Provides "View Invoices" button linking to `/club/billing`
- Appears above other warnings on dashboard
- Multilingual support (EN/FI/SV)

**Translation Keys:**

- `reservationsSuspendedTitle`: Alert title
- `reservationsSuspendedMessage`: Explanation of suspension and how to restore privileges

## Logic Flow

```
Daily Cron Job (06:00)
├── Send Overdue Reminders
│   └── All unpaid invoices past due date
│       └── Send email once (tracked by overdue_email_sent_at)
│
└── Manage Suspensions
    ├── Restoration Phase
    │   └── For each member with can_make_reservations=false
    │       └── Check for overdue FLIGHT invoices
    │           ├── If none found → Restore privileges
    │           └── If found → Keep suspended
    │
    └── Suspension Phase
        └── For each member with FLIGHT invoice overdue > suspension_days
            └── Check can_make_reservations
                ├── If true → Suspend privileges
                └── If false → Already suspended, skip
```

## Key Features

1. **Automatic Restoration**: Members are automatically restored when they pay all overdue flight invoices
2. **Flight-Specific**: Only FLIGHT invoice types trigger suspension (membership fees, etc. do not)
3. **Configurable Grace Period**: Adjustable via `OVERDUE_INVOICE_SUSPENSION_DAYS` environment variable
4. **Immediate Feedback**: Frontend banner immediately notifies suspended members
5. **Spam Prevention**: Each invoice gets only one reminder email
6. **Idempotent**: Safe to run multiple times, won't duplicate actions
7. **Comprehensive Logging**: All suspension/restoration actions logged for audit trail

## Database Queries

### Related Functions

From `invoicing-queries.ts`:

- `getOverdueInvoicesWithoutReminder()` - Finds invoices needing reminders
- `markOverdueEmailSent()` - Marks invoice as reminded
- `getOverdueFlightInvoicesForMember()` - Checks specific member's flight invoice status
- `getMembersWithSuspendedReservations()` - Lists all suspended members

From `member-queries.ts`:

- `suspendMemberReservations()` - Sets can_make_reservations = false
- `restoreMemberReservations()` - Sets can_make_reservations = true

## Deployment Configuration

The feature requires these environment variables in all deployment environments:

### GitHub Actions

```yaml
OVERDUE_INVOICE_WORKER_ENABLED: true
OVERDUE_INVOICE_WORKER_RUN_ON_STARTUP: false
OVERDUE_INVOICE_SUSPENSION_DAYS: 30
```

### Digital Ocean App Platform

```yaml
- key: OVERDUE_INVOICE_WORKER_ENABLED
  value: ${OVERDUE_INVOICE_WORKER_ENABLED}
  type: GENERAL
- key: OVERDUE_INVOICE_WORKER_RUN_ON_STARTUP
  value: ${OVERDUE_INVOICE_WORKER_RUN_ON_STARTUP}
  type: GENERAL
- key: OVERDUE_INVOICE_SUSPENSION_DAYS
  value: ${OVERDUE_INVOICE_SUSPENSION_DAYS}
  type: GENERAL
```

### Local Development (.env)

```bash
OVERDUE_INVOICE_WORKER_ENABLED=true
OVERDUE_INVOICE_WORKER_RUN_ON_STARTUP=false
OVERDUE_INVOICE_SUSPENSION_DAYS=30
```

## Testing

The worker includes comprehensive test coverage in `overdueInvoiceWorker.test.ts`:

- Email reminder sending
- Suspension logic for overdue FLIGHT invoices
- Restoration logic when invoices paid
- Duplicate prevention
- Edge cases (no invoices, mixed invoice types, etc.)

All tests pass (7/7) with proper test environment setup.

## Monitoring

Key log messages to monitor:

- `Suspending reservations for member` - When suspension occurs
- `Restoring reservations for member` - When restoration occurs
- `Processing overdue invoices` - Daily job start
- `Processed X overdue invoices` - Daily job completion

## Important Notes

1. **Invoice Type Matters**: Only `invoice_type = 'FLIGHT'` triggers suspension
2. **Membership Fees Don't Suspend**: Overdue membership fees will send reminders but won't suspend booking privileges
3. **Automatic Restoration**: Members don't need admin intervention - privileges restore automatically when all flight invoices are paid
4. **Grace Period**: Members have `OVERDUE_INVOICE_SUSPENSION_DAYS` days after due date before suspension
5. **Frontend Warning**: Suspended members see a clear error banner on dashboard explaining the situation

## Future Enhancements

Potential improvements:

- Email notification when suspension occurs (separate from overdue reminder)
- Email notification when privileges are restored
- Admin dashboard showing currently suspended members
- Configurable suspension rules per membership type
- Warning email X days before suspension occurs
