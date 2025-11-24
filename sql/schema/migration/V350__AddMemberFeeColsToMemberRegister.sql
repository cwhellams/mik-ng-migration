ALTER TABLE member.register
ADD COLUMN is_membership_expired bool DEFAULT false,
    ADD COLUMN auto_renew_annual_membership bool DEFAULT true,
    ADD COLUMN auto_renew_equipment_fee bool DEFAULT false;