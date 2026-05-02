-- Add instructor_member_id to track Flight Instructor / Flight Examiner for TRAINING bookings
ALTER TABLE schedule.bookings
    ADD COLUMN instructor_member_id VARCHAR(9) REFERENCES member.register(member_id);

-- Index for looking up bookings by instructor
CREATE INDEX idx_bookings_instructor_member_id ON schedule.bookings(instructor_member_id);
