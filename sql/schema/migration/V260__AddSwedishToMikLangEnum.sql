-- Add Swedish language support
ALTER TYPE public.MIK_LANG ADD VALUE 'sv';

-- Add Swedish name column to roles table
ALTER TABLE member.roles ADD COLUMN name_sv TEXT;

-- Update existing roles with Swedish translations
UPDATE member.roles SET name_sv = 'Administratör' WHERE role_id = 'ADMIN';
UPDATE member.roles SET name_sv = 'Serviceanvändare' WHERE role_id = 'SERVICE';
UPDATE member.roles SET name_sv = 'Medlem' WHERE role_id = 'MEMBER';
UPDATE member.roles SET name_sv = 'Flygmedlem' WHERE role_id = 'FLYING_MEMBER';
UPDATE member.roles SET name_sv = 'Styrelsemedlem' WHERE role_id = 'COMMITTEE';
UPDATE member.roles SET name_sv = 'Sekreterare' WHERE role_id = 'SECRETARY';
UPDATE member.roles SET name_sv = 'Flygplansansvarig' WHERE role_id = 'PLANE_CAPTAIN';
UPDATE member.roles SET name_sv = 'Underhåll' WHERE role_id = 'MAINTENANCE';
UPDATE member.roles SET name_sv = 'Instruktör' WHERE role_id = 'INSTRUCTOR';
UPDATE member.roles SET name_sv = 'Kontrollflygare' WHERE role_id = 'EXAMINER';

-- Make the Swedish name column NOT NULL after setting values
ALTER TABLE member.roles ALTER COLUMN name_sv SET NOT NULL;