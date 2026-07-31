CREATE TABLE club.ame_list (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by     TEXT         NOT NULL REFERENCES member.register (member_id),
  name             TEXT         NOT NULL,
  medical_centre   TEXT         NOT NULL,
  location         TEXT         NOT NULL,
  price            NUMERIC(10,2),
  medical_types    TEXT[]       NOT NULL DEFAULT '{}',
  notes            TEXT,
  report_date      DATE         NOT NULL,
  status           TEXT         NOT NULL DEFAULT 'SUBMITTED',
  approved_at      TIMESTAMPTZ,
  approved_by      TEXT         REFERENCES member.register (member_id),
  rejected_at      TIMESTAMPTZ,
  rejected_by      TEXT         REFERENCES member.register (member_id),
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE ON club.ame_list TO ${app_db_user};
