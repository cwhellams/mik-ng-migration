-- Marks a fuel line item as paid with the club's card rather than by the member
-- directly (issue #955) — these litres/cost still count toward the trip's balanced
-- price-cap calculation, but are never reimbursed to the member; if their actual cost
-- exceeds the trip's capped total, the member owes the club the difference.

ALTER TABLE accts.expense_claim_line_item
    ADD COLUMN paid_with_club_card BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN accts.expense_claim_line_item.paid_with_club_card IS 'Fuel bought with the club''s card, not reimbursed to the member';
