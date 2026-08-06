-- Per-user internal mailbox (system -> user messages), issue #200.
--
-- v1 scope: system-generated messages only (no admin/user composition).
-- This table is purely a store-and-display mechanism — the logic that decides
-- when to notify a member (licence/medical expiry, etc.) lives in whichever
-- feature triggers the notification and simply inserts a row here in addition
-- to whatever email/WhatsApp/etc. it already sends.

CREATE TABLE member.mailbox_messages (
    id           BIGSERIAL    PRIMARY KEY,

    -- Owning member; cascade so removing a member also drops their messages
    recipient_id VARCHAR(9)   NOT NULL REFERENCES member.register (member_id) ON DELETE CASCADE,

    type         VARCHAR(50)  NOT NULL,
    severity     VARCHAR(10)  NOT NULL DEFAULT 'info',
    title        TEXT         NOT NULL,
    body         TEXT,

    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    read_at      TIMESTAMPTZ,

    -- Messages are auto-deleted one year after creation (see mailboxCleanupWorker)
    expires_at   TIMESTAMPTZ  NOT NULL DEFAULT now() + INTERVAL '1 year',

    -- Optional idempotency key so callers (e.g. a daily expiry check) can avoid
    -- inserting duplicate messages for the same event.
    dedup_key    VARCHAR(200),

    CONSTRAINT chk_mailbox_messages_severity CHECK (severity IN ('info', 'warning', 'error', 'success')),
    CONSTRAINT uq_mailbox_messages_dedup_key UNIQUE (recipient_id, dedup_key)
);

CREATE INDEX idx_mailbox_messages_recipient ON member.mailbox_messages (recipient_id, created_at DESC);
CREATE INDEX idx_mailbox_messages_unread ON member.mailbox_messages (recipient_id) WHERE read_at IS NULL;
CREATE INDEX idx_mailbox_messages_expires_at ON member.mailbox_messages (expires_at);
