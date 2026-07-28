-- ============================================================
-- V1450 – Make WAITING_FOR_APPROVAL a real workflow step, and add
-- General information / Requirements & Experience credit text
-- fields to dto.syllabus (issues #598, #599)
-- ============================================================
-- submitted_for_approval_at : set when a DRAFT is submitted to the
--   authority for sign-off (DRAFT -> WAITING_FOR_APPROVAL).
-- approval_reference        : free-text authority approval letter
--   number/notes, captured at publish time (WAITING_FOR_APPROVAL ->
--   PUBLISHED), persisted permanently on the syllabus row.
-- requirements_experience_credit / general_information : additional
--   markdown text blocks alongside the existing description.
--
-- Also relax chk_dto_syllabus_published_at (V990) so an
-- auto-archived syllabus can retain its historical published_at
-- instead of having it nulled out. The state machine guarantees:
--   - DRAFT / WAITING_FOR_APPROVAL rows never have published_at set
--   - PUBLISHED rows always have published_at set
--   - ARCHIVED rows are only ever reached FROM PUBLISHED (see the
--     auto-archive UPDATE in publishSyllabus, which only touches
--     rows WHERE status = 'PUBLISHED'), so they always retain a
--     published_at too.
-- ============================================================

ALTER TABLE dto.syllabus
    ADD COLUMN submitted_for_approval_at TIMESTAMPTZ NULL,
    ADD COLUMN approval_reference TEXT NULL,
    ADD COLUMN requirements_experience_credit TEXT NULL,
    ADD COLUMN general_information TEXT NULL;

ALTER TABLE dto.syllabus
    DROP CONSTRAINT chk_dto_syllabus_published_at;

ALTER TABLE dto.syllabus
    ADD CONSTRAINT chk_dto_syllabus_published_at
        CHECK ((published_at IS NOT NULL) = (status IN ('PUBLISHED', 'ARCHIVED')));
