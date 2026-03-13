-- V720__AddPartiallyBillableFlightToFlightLogs.sql
-- Add a non-nullable boolean flag to indicate whether a flight is partially billable.

ALTER TABLE flight.logs
    ADD COLUMN partially_billable_flight BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN entry_error_fee BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN entry_error_fee_applied_by_member_id VARCHAR(9) REFERENCES member.register(member_id),
    ADD COLUMN validation_remarks TEXT NULL;
