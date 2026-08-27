-- Add the member's chosen DiceBear placeholder-avatar style to member.register.
-- Used to render the generated fallback avatar (initials / avataaars / bottts) whenever
-- the member has no uploaded photo (avatar_storage_key IS NULL). member.register already
-- has a table-level GRANT SELECT, INSERT, UPDATE, DELETE for ${app_db_user} (V480), so no
-- extra grant is needed for this column.

ALTER TABLE member.register
    ADD COLUMN avatar_dicebear_style VARCHAR(20) NOT NULL DEFAULT 'initials';

COMMENT ON COLUMN member.register.avatar_dicebear_style IS 'DiceBear style used to render the generated fallback avatar when no photo is uploaded: initials, avataaars or bottts.';
