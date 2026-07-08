-- ============================================================
-- V1340__GrantInventoryPermissions
-- ============================================================

-- Grant CRUD permissions on inventory schema
GRANT USAGE ON SCHEMA inventory TO ${app_db_user};

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA inventory TO ${app_db_user};

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA inventory TO ${app_db_user};

-- Default privileges so future tables/sequences are also covered
ALTER DEFAULT PRIVILEGES IN SCHEMA inventory
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app_db_user};

ALTER DEFAULT PRIVILEGES IN SCHEMA inventory
    GRANT USAGE, SELECT ON SEQUENCES TO ${app_db_user};

-- Add inventory.admin permission to ADMIN role
UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["inventory.admin"]'::jsonb,
    updated_at  = NOW(),
    updated_by  = 'k1mnimda'
WHERE role_id = 'ADMIN'
  AND (permissions IS NULL OR NOT (permissions @> '["inventory.admin"]'::jsonb));

-- Add inventory.user permission to all member roles
UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["inventory.user"]'::jsonb,
    updated_at  = NOW(),
    updated_by  = 'k1mnimda'
WHERE role_id IN ('MEMBER', 'FLYING_MEMBER')
  AND (permissions IS NULL OR NOT (permissions @> '["inventory.user"]'::jsonb));
