-- V910__AddMinBillableExceptionToFlightLogs.sql
-- Add fields to support manual exception from the 20-minute local flight minimum billable time rule.
-- When a Treasurer grants an exception, the topup is skipped and actual flight minutes are billed.

ALTER TABLE flight.logs
    ADD COLUMN min_billable_exception_reason TEXT NULL,
    ADD COLUMN min_billable_exception_approved_by_member_id VARCHAR(9) REFERENCES member.register(member_id) NULL;
