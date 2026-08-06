-- expense.hetu_admin (issue #1022) was introduced in code but never actually
-- granted to any role, so the HETU reveal endpoint 403s for everyone.
--
-- Unlike expense.admin (V1233), this permission gates access to a sensitive
-- personal identifier (HETU) and is deliberately narrower than "anyone with
-- invoicing.admin" — that set includes the generic ADMIN (webmaster) role,
-- which should not be able to reveal members' HETU just by virtue of having
-- technical admin access. Per apps/backend/src/routes/expenses/api.ts, only
-- the treasurer/chairman is meant to hold it, so grant it to CHAIRMAN alone.
UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["expense.hetu_admin"]'::jsonb,
    updated_at = NOW(),
    updated_by = 'k1mnimda'
WHERE role_id = 'CHAIRMAN'
  AND NOT (permissions @> '["expense.hetu_admin"]'::jsonb);
