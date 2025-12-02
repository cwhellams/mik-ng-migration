-- Add column to track if overdue reminder email has been sent
ALTER TABLE accts.invoice
ADD COLUMN overdue_email_sent_at TIMESTAMP DEFAULT NULL;