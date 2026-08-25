-- ============================================================
-- V2030__GrantLiquidPermissions  --  Liquid Management System (#1119)
-- ============================================================
-- liquid.user goes to every flying member: reporting the fuel or oil you just
-- put into an aircraft is part of flying it, not a privilege.
--
-- liquid.admin is the "liquid administrator" the issue refers to -- the role
-- that manages oil inventory, generates and assigns QR codes, and can edit or
-- delete a member's locked record.  It is deliberately its own permission
-- rather than a reuse of aircraft.admin or fuelPrices.admin, because the people
-- who look after the oil shelf are not necessarily the people who maintain the
-- fuel prices page.

UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["liquid.user"]'::jsonb,
    updated_at  = NOW(),
    updated_by  = 'k1mnimda'
WHERE role_id = 'FLYING_MEMBER'
  AND (permissions IS NULL OR NOT (permissions @> '["liquid.user"]'::jsonb));

UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["liquid.admin"]'::jsonb,
    updated_at  = NOW(),
    updated_by  = 'k1mnimda'
WHERE role_id = 'ADMIN'
  AND (permissions IS NULL OR NOT (permissions @> '["liquid.admin"]'::jsonb));
