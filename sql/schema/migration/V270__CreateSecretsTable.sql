-- Create secrets table for club member access codes
-- V270: CreateSecretsTable.sql

CREATE TABLE IF NOT EXISTS public.secrets (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    secret_key VARCHAR(100) NOT NULL UNIQUE,
    secret_value VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(20) NOT NULL,
    updated_by VARCHAR(20) NOT NULL,
    
    CONSTRAINT secrets_pkey PRIMARY KEY (id),
    CONSTRAINT secrets_created_by_fkey FOREIGN KEY (created_by) REFERENCES member.register (member_id),
    CONSTRAINT secrets_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES member.register (member_id)
);

-- Create index for efficient lookups by key
CREATE INDEX idx_secrets_secret_key ON public.secrets (secret_key);

-- Add comments for documentation
COMMENT ON TABLE public.secrets IS 'Stores club member access codes and secrets';
COMMENT ON COLUMN public.secrets.secret_key IS 'The name/description of the secret (e.g., "Club house key code")';
COMMENT ON COLUMN public.secrets.secret_value IS 'The actual secret value (e.g., door code, combination)';