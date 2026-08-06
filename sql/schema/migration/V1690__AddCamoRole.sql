-- ============================================================
-- V1690__AddCamoRole
-- ============================================================

-- Add a dedicated CAMO role so occurrence reports involving an aircraft
-- technical fault can be shared with CAMO as a group, instead of individual
-- accounts the reporter cannot be expected to know.
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
VALUES (
        'CAMO',
        'CAMO members can view and comment on occurrence reports shared with them by SMS',
        'CAMO',
        'CAMO',
        'CAMO',
        FALSE,
        to_jsonb(ARRAY ['camo.user']),
        'k1mnimda',
        'k1mnimda'
    )
ON CONFLICT (role_id) DO NOTHING;
