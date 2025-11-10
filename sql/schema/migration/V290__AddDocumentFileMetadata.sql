-- Add file metadata columns to support Digital Ocean Spaces integration
ALTER TABLE member.documents 
ADD COLUMN file_name VARCHAR(255),
ADD COLUMN file_size INTEGER,
ADD COLUMN mime_type VARCHAR(100),
ADD COLUMN storage_key VARCHAR(500);

-- Add index for storage key for efficient lookups
CREATE INDEX idx_member_documents_storage_key ON member.documents(storage_key);

-- Add comments for new columns
COMMENT ON COLUMN member.documents.file_name IS 'Original filename of uploaded file';
COMMENT ON COLUMN member.documents.file_size IS 'File size in bytes';
COMMENT ON COLUMN member.documents.mime_type IS 'MIME type of uploaded file';
COMMENT ON COLUMN member.documents.storage_key IS 'Storage key for Digital Ocean Spaces';