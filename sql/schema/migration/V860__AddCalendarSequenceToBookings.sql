ALTER TABLE schedule.bookings
    ADD COLUMN calendar_sequence INTEGER NOT NULL DEFAULT 0;
