-- Add exam.admin permission to ADMIN role
UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["exam.admin"]'::jsonb,
    updated_at = CURRENT_TIMESTAMP,
    updated_by = 'k1mnimda'
WHERE role_id = 'ADMIN'
  AND (permissions IS NULL OR NOT (permissions @> '["exam.admin"]'::jsonb));

-- Add exam.user permission to MEMBER role
UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["exam.user"]'::jsonb,
    updated_at = CURRENT_TIMESTAMP,
    updated_by = 'k1mnimda'
WHERE role_id = 'MEMBER'
  AND (permissions IS NULL OR NOT (permissions @> '["exam.user"]'::jsonb));
