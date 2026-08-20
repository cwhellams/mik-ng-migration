-- Add a snapshot column to member.register for restoring member state after deactivation.
-- Stores a single JSON snapshot of the member's state before removal so it can be
-- accurately restored, rather than one column per restorable field.

ALTER TABLE member.register
  ADD COLUMN pre_removal_snapshot jsonb NULL;

COMMENT ON COLUMN member.register.pre_removal_snapshot IS
  'JSON snapshot of member state (memberType, canMakeReservations, autoRenewAnnualMembership, autoRenewEquipmentFee) taken before deactivation, used to accurately restore the member. Cleared on restore.';
