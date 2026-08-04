-- ============================================================
-- V1480 – Link meeting notes document to member.meeting
-- ============================================================
-- Closing a meeting (PENDING_NOTES -> ENDED) now requires the
-- meeting notes to be uploaded to the club's document archive.
-- This column records which archived document holds those notes.
-- ============================================================

ALTER TABLE member.meeting
    ADD COLUMN meeting_notes_document_id INTEGER
        REFERENCES member.documents (document_id);
