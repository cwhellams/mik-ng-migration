-- ============================================================
-- V1460 – Add meeting_url column to member.meeting
-- ============================================================
-- Stores an optional link to the remote meeting (e.g. Zoom/Teams URL)
-- so members can join directly from the app while the meeting is ongoing.
-- ============================================================

ALTER TABLE member.meeting
    ADD COLUMN meeting_url TEXT;
