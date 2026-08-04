-- Stores the DigitalOcean Spaces object key for images uploaded through the
-- new event image upload endpoint, so the file can be deleted on replace/removal.
-- Legacy image_url values that were manually pasted (pre-upload feature) will
-- have image_key IS NULL and must not be deleted from storage.
ALTER TABLE member.events
    ADD COLUMN image_key TEXT;
