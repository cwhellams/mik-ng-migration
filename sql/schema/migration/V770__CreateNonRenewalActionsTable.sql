CREATE TYPE public.non_renewal_action_type AS ENUM ('REMINDER_SENT', 'MEMBERSHIP_CANCELLED');

CREATE TABLE member.non_renewal_actions (
    id                  SERIAL PRIMARY KEY,
    member_id           VARCHAR(9)                  NOT NULL REFERENCES member.register(member_id),
    action_type         non_renewal_action_type     NOT NULL,
    performed_at        TIMESTAMP                   NOT NULL DEFAULT NOW(),
    performed_by        VARCHAR(9)                  NOT NULL REFERENCES member.register(member_id),
    notes               TEXT
);

COMMENT ON TABLE member.non_renewal_actions IS 'Tracks admin actions taken on members who have not paid or requested the annual membership fee';
COMMENT ON COLUMN member.non_renewal_actions.action_type IS 'REMINDER_SENT = final reminder email sent; MEMBERSHIP_CANCELLED = membership deactivated';
