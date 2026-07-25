-- Web push notification support (browser push for booking reminders).
--
-- One member can register multiple push subscriptions (one per device/browser),
-- matching the per-device opt-in model chosen for this feature.

CREATE TABLE member.push_subscriptions (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Owning member; cascade so removing a member also drops their subscriptions
    member_id    VARCHAR(9)   NOT NULL REFERENCES member.register (member_id) ON DELETE CASCADE,

    -- PushSubscription fields from the browser's PushManager.subscribe() result
    endpoint     TEXT         NOT NULL UNIQUE,
    keys_auth    TEXT         NOT NULL,
    keys_p256dh  TEXT         NOT NULL,

    -- Reported browser/device, shown to the member so they can tell subscriptions apart
    user_agent   TEXT,

    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_member_id ON member.push_subscriptions (member_id);

-- Log of booking push reminders already sent, kept separate from
-- schedule.bookings (unlike the existing reminder_sent_at column used for
-- email reminders) so multiple future reminder intervals could be tracked
-- without adding more columns to the bookings table.
CREATE TABLE schedule.push_reminder_log (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id  VARCHAR(9)   NOT NULL REFERENCES schedule.bookings (booking_id) ON DELETE CASCADE,
    member_id   VARCHAR(9)   NOT NULL REFERENCES member.register (member_id) ON DELETE CASCADE,
    sent_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- At most one push reminder per booking — the claim query relies on this
    -- unique constraint (INSERT ... ON CONFLICT DO NOTHING) for atomic claiming
    -- across multiple worker instances.
    CONSTRAINT uq_push_reminder_log_booking UNIQUE (booking_id)
);

CREATE INDEX idx_push_reminder_log_member_id ON schedule.push_reminder_log (member_id);
