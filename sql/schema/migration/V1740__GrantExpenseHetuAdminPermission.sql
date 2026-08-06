-- expense.hetu_admin (issue #1022) was introduced in code but never actually
-- granted to any role, so the HETU reveal endpoint 403s for everyone. Mirror
-- V1233's expense.admin grant: give it to the same roles that hold
-- invoicing.admin (treasurer/chairman).
UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["expense.hetu_admin"]'::jsonb,
    updated_at = NOW(),
    updated_by = 'k1mnimda'
WHERE permissions @> '["invoicing.admin"]'::jsonb
  AND NOT (permissions @> '["expense.hetu_admin"]'::jsonb);
