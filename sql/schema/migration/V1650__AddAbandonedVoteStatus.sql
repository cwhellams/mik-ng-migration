-- ============================================================
-- V1470 – Add ABANDONED status to member.meeting_vote
-- ============================================================
-- Allows a vote to be called off after it has been opened (e.g.
-- a problem is discovered with the options while voting is in
-- progress). Abandoned votes are terminal, like CLOSED, but their
-- results are never treated as official and are never shown.
-- ============================================================

ALTER TABLE member.meeting_vote
    DROP CONSTRAINT chk_member_meeting_vote_status;

ALTER TABLE member.meeting_vote
    ADD CONSTRAINT chk_member_meeting_vote_status
        CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED', 'ABANDONED'));
