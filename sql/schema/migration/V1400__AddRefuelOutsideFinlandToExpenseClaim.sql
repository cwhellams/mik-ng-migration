-- Flags a fuel expense claim as fuel purchased outside Finland (informational, admin-visible).
ALTER TABLE accts.expense_claim
    ADD COLUMN refuel_outside_finland BOOLEAN NOT NULL DEFAULT FALSE;
