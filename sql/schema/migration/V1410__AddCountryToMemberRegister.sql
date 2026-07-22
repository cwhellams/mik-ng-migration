-- Add country to member address, stored as an ISO 3166-1 alpha-2 code (e.g. 'FI', 'SE', 'GB')
ALTER TABLE member.register
    ADD COLUMN country CHAR(2) NOT NULL DEFAULT 'FI';
