-- Add archive and tags functionality to documents
ALTER TABLE member.documents
ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN tags TEXT [];