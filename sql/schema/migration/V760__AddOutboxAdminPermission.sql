-- Add outbox.admin permission to the ADMIN role
UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["outbox.admin"]'::jsonb,
    updated_at  = NOW(),
    updated_by  = 'k1mnimda'
WHERE role_id = 'ADMIN'
  AND (permissions IS NULL OR NOT (permissions @> '["outbox.admin"]'::jsonb));
