-- Add DTO permissions to relevant roles

-- dto.admin to ADMIN role
UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["dto.admin"]'::jsonb,
    updated_at = CURRENT_TIMESTAMP,
    updated_by = 'k1mnimda'
WHERE role_id = 'ADMIN'
  AND (permissions IS NULL OR NOT (permissions @> '["dto.admin"]'::jsonb));

-- dto.instructor to INSTRUCTOR and EXAMINER roles
UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["dto.instructor"]'::jsonb,
    updated_at = CURRENT_TIMESTAMP,
    updated_by = 'k1mnimda'
WHERE role_id IN ('INSTRUCTOR', 'EXAMINER')
  AND (permissions IS NULL OR NOT (permissions @> '["dto.instructor"]'::jsonb));

-- dto.user to MEMBER and FLYING_MEMBER roles
UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["dto.user"]'::jsonb,
    updated_at = CURRENT_TIMESTAMP,
    updated_by = 'k1mnimda'
WHERE role_id IN ('MEMBER', 'FLYING_MEMBER')
  AND (permissions IS NULL OR NOT (permissions @> '["dto.user"]'::jsonb));
