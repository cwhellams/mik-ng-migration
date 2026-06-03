-- Add invoicing.user permission to SECRETARY role
-- V1120: AddInvoicingUserToSecretaryRole.sql

UPDATE member.roles
SET permissions = permissions || to_jsonb(ARRAY['invoicing.user']::varchar[])
WHERE role_id = 'SECRETARY'
  AND NOT (permissions @> to_jsonb(ARRAY['invoicing.user']::varchar[]));
