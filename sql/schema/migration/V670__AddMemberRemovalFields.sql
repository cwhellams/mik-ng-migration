-- Add fields to track member removal/deactivation
ALTER TABLE member.register ADD COLUMN removed_at TIMESTAMP;
ALTER TABLE member.register ADD COLUMN removed_by VARCHAR(9) REFERENCES member.register (member_id);
ALTER TABLE member.register ADD COLUMN removal_reason TEXT;
