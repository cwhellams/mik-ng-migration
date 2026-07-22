-- Store the ISO 3166-1 alpha-2 country selected alongside phone numbers, since the dial
-- code alone is ambiguous (e.g. +44 is shared by the UK, Guernsey, Isle of Man and Jersey).
-- Defaults to 'FI' (matching the app's other Finland-centric defaults) so existing rows
-- and any insert/update that doesn't touch this column always has a valid value.
ALTER TABLE member.register
    ADD COLUMN phone_country CHAR(2) NOT NULL DEFAULT 'FI',
    ADD COLUMN ice_contact_phone_country CHAR(2) NOT NULL DEFAULT 'FI';
