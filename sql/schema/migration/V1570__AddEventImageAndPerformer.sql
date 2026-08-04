-- Issue #1025: Google Search Console flagged missing `image` and `performer` fields
-- in the Event structured data (JSON-LD) rendered by mikpublicweb for public club events.
--
-- Both columns are nullable: most club events have neither a dedicated image nor a
-- named performer, and the public site falls back to the club logo when absent.
ALTER TABLE member.events
    ADD COLUMN image_url TEXT,
    ADD COLUMN performer TEXT;
