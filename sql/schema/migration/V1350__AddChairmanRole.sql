-- ============================================================
-- V1350__AddChairmanRole
-- ============================================================

-- Add a Chairman role with the same permissions as Administrator
INSERT INTO member.roles (
        role_id,
        description,
        name_en,
        name_fi,
        name_sv,
        is_public,
        permissions,
        created_by,
        updated_by
    )
SELECT 'CHAIRMAN',
       'Club chairman with full access',
       'Chairman',
       'Puheenjohtaja',
       'Ordförande',
       TRUE,
       permissions,
       'k1mnimda',
       'k1mnimda'
FROM member.roles
WHERE role_id = 'ADMIN'
ON CONFLICT (role_id) DO NOTHING;
