-- Add mailing_lists column to member.register table
-- Stores the aircraft mailing lists the member has subscribed to
ALTER TABLE member.register
ADD COLUMN mailing_lists JSONB DEFAULT NULL;

COMMENT ON COLUMN member.register.mailing_lists IS 'Aircraft mailing list subscriptions. Structure: ["list-id-1", "list-id-2"]';
