-- Non-Renewals feature test data (2026)
-- Demonstrates all Non-Renewals UI variations for the current year:
--
-- Member   | feeStatus  | auto_renew | reminder   | Due date        | Notes
-- ---------|------------|------------|------------|-----------------|-----------------------------------
-- Matti1   | unpaid     | ON  (✓)    | none       | 2026-04-15      | Future due → dates in normal colour
-- Liisa1   | no_record  | ON  (✓)    | 2026-03-22 | —               | Reminder sent + green tick
-- Jukka1   | no_record  | OFF        | none       | —               | Opted out, no fee record
-- Pekka1   | unpaid     | ON  (✓)    | none       | 2026-02-28 ⚠    | Overdue → due date shows in red
-- Antti1   | no_record  | OFF        | none       | —               | Opted out, no fee record
-- Sanna1   | unpaid     | OFF        | 2026-03-18 | 2026-02-28 ⚠    | All features: opted out + overdue + reminder


-- Step 1: Opt Jukka1, Antti1, and Sanna1 out of auto-renewal
UPDATE member.register
SET    auto_renew_annual_membership = FALSE
WHERE  member_id IN ('Jukka1', 'Antti1', 'Sanna1');


-- Step 2: Record that the 2026 annual fee processing run has completed
INSERT INTO accts.recurring_fees_processing (
    fee_type, year, status,
    created_at, updated_at, created_by, updated_by
)
VALUES (
    'annual_fee', 2026, 'processed',
    '2026-01-10 09:00:00', '2026-01-10 10:00:00', 'k1mnimda', 'k1mnimda'
);


-- Step 3: Unpaid ANNUAL_FEE invoices for 2026
--   Invoice 3001 → Matti1  – due in the future  (2026-04-15)  → dates shown in normal colour
--   Invoice 3002 → Pekka1  – already overdue    (2026-02-28)  → due date shown in red
--   Invoice 3003 → Sanna1  – already overdue    (2026-02-28)  → due date shown in red + reminder sent
INSERT INTO accts.invoice (
    member_id, id, invoice_type, description,
    total_sum, currency, pmt_ref,
    sent_at, due_at, paid_at,
    created_at, updated_at, created_by, updated_by
)
VALUES
    ('Matti1', 3001, 'ANNUAL_FEE', 'Annual membership fee 2026',
     120.00, 'EUR', 'NR2026MATTI',
     '2026-01-15', '2026-04-15', NULL,
     '2026-01-15 09:00:00', '2026-01-15 09:00:00', 'k1mnimda', 'k1mnimda'),

    ('Pekka1', 3002, 'ANNUAL_FEE', 'Annual membership fee 2026',
     120.00, 'EUR', 'NR2026PEKKA',
     '2026-01-15', '2026-02-28', NULL,
     '2026-01-15 09:00:00', '2026-01-15 09:00:00', 'k1mnimda', 'k1mnimda'),

    ('Sanna1', 3003, 'ANNUAL_FEE', 'Annual membership fee 2026',
     120.00, 'EUR', 'NR2026SANNA',
     '2026-01-15', '2026-02-28', NULL,
     '2026-01-15 09:00:00', '2026-01-15 09:00:00', 'k1mnimda', 'k1mnimda');


-- Step 4: Link members to their 2026 annual_fees records
--   Liisa1, Jukka1, Antti1 intentionally have NO entry → feeStatus 'no_record'
INSERT INTO member.annual_fees (
    member_id, fee_type, year, invoice_id,
    created_at, updated_at, created_by, updated_by
)
VALUES
    ('Matti1', 'annual_fee', 2026, 3001,
     '2026-01-15 09:00:00', '2026-01-15 09:00:00', 'k1mnimda', 'k1mnimda'),

    ('Pekka1', 'annual_fee', 2026, 3002,
     '2026-01-15 09:00:00', '2026-01-15 09:00:00', 'k1mnimda', 'k1mnimda'),

    ('Sanna1', 'annual_fee', 2026, 3003,
     '2026-01-15 09:00:00', '2026-01-15 09:00:00', 'k1mnimda', 'k1mnimda');


-- Step 5: Record reminder emails that have already been sent
--   Liisa1: reminder sent 3 days ago — demonstrates reminder date under the Send Reminder button
--           combined with the auto-renew green tick (auto_renew = TRUE)
--   Sanna1: reminder sent 7 days ago — combined with opted-out chip + overdue invoice dates
INSERT INTO member.non_renewal_actions (
    member_id, action_type, performed_at, performed_by, notes
)
VALUES
    ('Liisa1', 'REMINDER_SENT', '2026-03-22 10:00:00', 'k1mnimda', 'Final renewal reminder sent'),
    ('Sanna1', 'REMINDER_SENT', '2026-03-18 14:30:00', 'k1mnimda', 'Final renewal reminder sent');
