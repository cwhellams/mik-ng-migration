CREATE TABLE member.documents
(
    document_id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    document_url VARCHAR(500),
    published_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(9) NOT NULL REFERENCES member.register (member_id),
    updated_by VARCHAR(9) NOT NULL REFERENCES member.register (member_id)
);

CREATE INDEX idx_member_documents_category ON member.documents(category);
CREATE INDEX idx_member_documents_published_date ON member.documents(published_date DESC);
CREATE INDEX idx_member_documents_is_public ON member.documents(is_public);