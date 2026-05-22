-- Stores uploaded proof documents for instructor qualifications.
-- Two categories cover the two types of instructor qualification proof documents:
--   LICENSE  – covers FI, IRI, CRI, SEP (licence-based ratings)
--   MEDICAL  – covers MED Class I, Class II, and LAPL
-- history_id links each file to the Emmett stream position (InstructorQualificationSet event)
-- that was current when this proof was uploaded, enabling point-in-time reconstruction.

CREATE TABLE member.qualification_proof_files (
    id SERIAL PRIMARY KEY,
    member_id VARCHAR(9) NOT NULL REFERENCES member.register(member_id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    uploaded_by VARCHAR(9) NOT NULL REFERENCES member.register(member_id) ON DELETE RESTRICT,
    history_id BIGINT,
    document_category VARCHAR(10) NOT NULL DEFAULT 'LICENSE',
    CONSTRAINT chk_document_category CHECK (document_category IN ('LICENSE', 'MEDICAL'))
);

CREATE INDEX idx_qualification_proof_member_id ON member.qualification_proof_files(member_id);
CREATE INDEX idx_qualification_proof_history_id ON member.qualification_proof_files(history_id);
CREATE INDEX idx_qualification_proof_category
    ON member.qualification_proof_files(member_id, document_category, uploaded_at DESC);

GRANT SELECT, INSERT, DELETE ON member.qualification_proof_files TO ${app_db_user};
GRANT USAGE, SELECT ON SEQUENCE member.qualification_proof_files_id_seq TO ${app_db_user};
