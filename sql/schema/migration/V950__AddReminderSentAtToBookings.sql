ALTER TABLE schedule.bookings
    ADD COLUMN reminder_sent_at TIMESTAMP DEFAULT NULL;

-- Partial index to efficiently find bookings needing a reminder
-- (only covers unprocessed CONFIRMED/TENTATIVE rows, not the full history)
CREATE INDEX idx_bookings_reminder_window
    ON schedule.bookings (start_time_epoch)
    WHERE reminder_sent_at IS NULL
      AND booking_status IN ('CONFIRMED', 'TENTATIVE');
