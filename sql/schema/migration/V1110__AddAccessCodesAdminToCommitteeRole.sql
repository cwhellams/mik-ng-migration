-- Add access_codes.admin permission to COMMITTEE role
-- V1110: AddAccessCodesAdminToCommitteeRole.sql

UPDATE member.roles
SET permissions = permissions || to_jsonb(ARRAY['access_codes.admin']::varchar[])
WHERE role_id = 'COMMITTEE'
  AND NOT (permissions @> to_jsonb(ARRAY['access_codes.admin']::varchar[]));
