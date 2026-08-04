-- Persist the user-entered total cost separately from unit_price so redisplaying it
-- after a save/reload doesn't require reconstructing quantity * unit_price, which loses
-- precision once unit_price is rounded to its stored 4-decimal precision (issue #1024).
ALTER TABLE accts.expense_claim_line_item
    ADD COLUMN total_cost NUMERIC(12, 4) NULL;
