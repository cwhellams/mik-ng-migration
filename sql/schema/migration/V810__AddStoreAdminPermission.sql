-- ============================================================
-- V810 – Add store permissions to roles
-- ============================================================
UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["store.admin"]'::jsonb,
    updated_at  = NOW(),
    updated_by  = 'k1mnimda'
WHERE role_id = 'ADMIN'
  AND (permissions IS NULL OR NOT (permissions @> '["store.admin"]'::jsonb));

UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["store.user"]'::jsonb,
    updated_at  = NOW(),
    updated_by  = 'k1mnimda'
WHERE role_id IN ('MEMBER', 'FLYING_MEMBER')
  AND (permissions IS NULL OR NOT (permissions @> '["store.user"]'::jsonb));
