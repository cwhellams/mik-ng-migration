ALTER TABLE schedule.bookings
    ADD COLUMN reminder_sent_at TIMESTAMP DEFAULT NULL;
