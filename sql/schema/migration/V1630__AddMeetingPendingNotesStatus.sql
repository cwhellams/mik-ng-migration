-- ============================================================
-- V1450 – Add PENDING_NOTES status to member.meeting
-- ============================================================
-- Adds an intermediate meeting stage between ONGOING and ENDED.
-- In PENDING_NOTES the meeting is effectively closed for regular
-- members (no active votes, no new attendance), but vote counters
-- can still access closed-vote results before the meeting is
-- formally ended.
-- ============================================================

ALTER TABLE member.meeting
    DROP CONSTRAINT chk_member_meeting_status;

ALTER TABLE member.meeting
    ADD CONSTRAINT chk_member_meeting_status
        CHECK (status IN ('DRAFT', 'ONGOING', 'PENDING_NOTES', 'ENDED'));

-- Enforces at most one meeting ONGOING/PENDING_NOTES at a time, closing the
-- race where two concurrent starts of different DRAFT meetings can otherwise
-- both pass an application-level check before either UPDATE commits.
CREATE UNIQUE INDEX ux_member_meeting_single_active
    ON member.meeting ((true))
    WHERE status IN ('ONGOING', 'PENDING_NOTES');
