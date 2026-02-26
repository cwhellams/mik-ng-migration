-- Create table for storing tiny URL mappings for documents
-- These short codes allow users to access document download URLs on public computers
-- with short-lived, shareable links

CREATE TABLE member.document_tiny_urls (
    short_code VARCHAR(4) PRIMARY KEY,
    document_id INTEGER,
    aircraft_document_id INTEGER,
    document_type VARCHAR(20) NOT NULL CHECK (document_type IN ('member', 'aircraft')),
    url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(9) NOT NULL REFERENCES member.register(member_id),
    CONSTRAINT check_document_reference CHECK (
        (document_type = 'member' AND document_id IS NOT NULL AND aircraft_document_id IS NULL) OR
        (document_type = 'aircraft' AND aircraft_document_id IS NOT NULL AND document_id IS NULL)
    )
);

-- Add foreign key constraints
ALTER TABLE member.document_tiny_urls
    ADD CONSTRAINT fk_document_tiny_urls_document_id
    FOREIGN KEY (document_id)
    REFERENCES member.documents(document_id)
    ON DELETE CASCADE;

ALTER TABLE member.document_tiny_urls
    ADD CONSTRAINT fk_document_tiny_urls_aircraft_document_id
    FOREIGN KEY (aircraft_document_id)
    REFERENCES flight.aircraft_documents_files(document_id)
    ON DELETE CASCADE;

-- Create index for cleanup queries (expired entries)
CREATE INDEX idx_document_tiny_urls_expires_at ON member.document_tiny_urls(expires_at);
