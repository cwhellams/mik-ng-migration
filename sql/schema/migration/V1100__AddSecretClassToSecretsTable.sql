-- Add secret_class to secrets table to distinguish member vs board secrets
-- V1100: AddSecretClassToSecretsTable.sql

CREATE TYPE secret_class_type AS ENUM ('MEMBER', 'BOARD');

ALTER TABLE public.secrets
    ADD COLUMN secret_class secret_class_type NOT NULL DEFAULT 'MEMBER';

COMMENT ON COLUMN public.secrets.secret_class IS 'Class of the secret: MEMBER (visible to all flying members) or BOARD (visible only to board members with admin access)';
