-- Add unique constraint to the id column in accts.invoice table
-- This ensures that each invoice ID is unique across all members

ALTER TABLE accts.invoice 
ADD CONSTRAINT uk_accts_invoice_id UNIQUE (id);
