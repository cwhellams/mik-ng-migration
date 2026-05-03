-- Add application_data JSONB column to store registration application details
-- such as flight experience, motivation, cover letter, declarations, etc.
ALTER TABLE member.register
ADD COLUMN application_data JSONB DEFAULT NULL;

COMMENT ON COLUMN member.register.application_data IS 'Registration application data: flight hours, aircraft types, motivation, cover letter, declarations, etc.';
