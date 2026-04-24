CREATE TABLE IF NOT EXISTS public.fuel_prices_content (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    markdown TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(20) NOT NULL REFERENCES member.register (member_id),
    updated_by VARCHAR(20) NOT NULL REFERENCES member.register (member_id)
);

INSERT INTO public.fuel_prices_content (id, markdown, created_by, updated_by)
VALUES (1, '', 'k1mnimda', 'k1mnimda')
ON CONFLICT (id) DO NOTHING;

-- Add user-level permission to roles that already have access_codes.user
UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["fuelPrices.user"]'::jsonb,
    updated_at = NOW(),
    updated_by = 'k1mnimda'
WHERE permissions @> '["access_codes.user"]'::jsonb
  AND NOT (permissions @> '["fuelPrices.user"]'::jsonb);

-- Add admin-level permission to roles that already have access_codes.admin
UPDATE member.roles
SET permissions = COALESCE(permissions, '[]'::jsonb) || '["fuelPrices.admin"]'::jsonb,
    updated_at = NOW(),
    updated_by = 'k1mnimda'
WHERE permissions @> '["access_codes.admin"]'::jsonb
  AND NOT (permissions @> '["fuelPrices.admin"]'::jsonb);
