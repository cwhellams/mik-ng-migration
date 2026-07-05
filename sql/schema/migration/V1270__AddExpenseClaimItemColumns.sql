-- Mark invoice items that can be selected in expense claim line items.
ALTER TABLE accts.items
    ADD COLUMN expense_claim_item BOOLEAN NOT NULL DEFAULT FALSE;

-- Link each expense claim line item to an optional accounting item/article.
ALTER TABLE accts.expense_claim_line_item
    ADD COLUMN item_id INT NULL REFERENCES accts.items(id) ON DELETE SET NULL;
