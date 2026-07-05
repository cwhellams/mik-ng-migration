-- Add expense.user to all roles that have member permission
UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["expense.user"]'::jsonb,
    updated_at = NOW(),
    updated_by = 'k1mnimda'
WHERE permissions @> '["member"]'::jsonb
  AND NOT (permissions @> '["expense.user"]'::jsonb);

-- Add expense.admin to roles that have invoicing.admin (treasurer role)
UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["expense.admin"]'::jsonb,
    updated_at = NOW(),
    updated_by = 'k1mnimda'
WHERE permissions @> '["invoicing.admin"]'::jsonb
  AND NOT (permissions @> '["expense.admin"]'::jsonb);
