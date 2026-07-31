-- Add default_instructor_member_id so a member can set a preferred flight instructor,
-- used to default the instructor crew slot when logging a school flight
ALTER TABLE member.register
    ADD COLUMN default_instructor_member_id VARCHAR(9) REFERENCES member.register(member_id);

-- Index for looking up members by their default instructor
CREATE INDEX idx_member_register_default_instructor_member_id
    ON member.register(default_instructor_member_id);
