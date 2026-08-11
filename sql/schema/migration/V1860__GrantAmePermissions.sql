-- ============================================================
-- V1860__GrantAmePermissions
-- ============================================================
-- Any member should be able to submit/suggest/rate AME entries;
-- admins (and the committee) approve new entries, edits, and removals.

-- Add ame.user permission to all member roles
UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["ame.user"]'::jsonb,
    updated_at  = NOW(),
    updated_by  = 'k1mnimda'
WHERE role_id IN ('MEMBER', 'FLYING_MEMBER')
  AND (permissions IS NULL OR NOT (permissions @> '["ame.user"]'::jsonb));

-- Add ame.admin permission to roles that approve AME submissions
UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["ame.admin"]'::jsonb,
    updated_at  = NOW(),
    updated_by  = 'k1mnimda'
WHERE role_id IN ('ADMIN', 'COMMITTEE')
  AND (permissions IS NULL OR NOT (permissions @> '["ame.admin"]'::jsonb));
