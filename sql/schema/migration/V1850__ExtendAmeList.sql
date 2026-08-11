CREATE TABLE club.ame_rating (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ame_id      UUID        NOT NULL REFERENCES club.ame_list (id) ON DELETE CASCADE,
  member_id   TEXT        NOT NULL REFERENCES member.register (member_id),
  stars       SMALLINT    NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_ame_rating_ame_member UNIQUE (ame_id, member_id)
);

CREATE INDEX ix_ame_rating_ame_id ON club.ame_rating (ame_id);

GRANT SELECT, INSERT, UPDATE ON club.ame_rating TO ${app_db_user};

CREATE TABLE club.ame_edit_suggestion (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  ame_id            UUID         NOT NULL REFERENCES club.ame_list (id) ON DELETE CASCADE,
  submitted_by      TEXT         NOT NULL REFERENCES member.register (member_id),
  name              TEXT         NOT NULL,
  medical_centre    TEXT         NOT NULL,
  location          TEXT         NOT NULL,
  price             NUMERIC(10,2),
  medical_types     TEXT[]       NOT NULL DEFAULT '{}',
  notes             TEXT,
  report_date       DATE         NOT NULL,
  status            TEXT         NOT NULL DEFAULT 'SUBMITTED',
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       TEXT         REFERENCES member.register (member_id),
  rejection_reason  TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_ame_edit_suggestion_ame_id ON club.ame_edit_suggestion (ame_id);
CREATE INDEX ix_ame_edit_suggestion_status ON club.ame_edit_suggestion (status);

GRANT SELECT, INSERT, UPDATE ON club.ame_edit_suggestion TO ${app_db_user};

CREATE TABLE club.ame_removal_request (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  ame_id            UUID         NOT NULL REFERENCES club.ame_list (id) ON DELETE CASCADE,
  submitted_by      TEXT         NOT NULL REFERENCES member.register (member_id),
  reason            TEXT         NOT NULL,
  status            TEXT         NOT NULL DEFAULT 'SUBMITTED',
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       TEXT         REFERENCES member.register (member_id),
  rejection_reason  TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_ame_removal_request_ame_id ON club.ame_removal_request (ame_id);
CREATE INDEX ix_ame_removal_request_status ON club.ame_removal_request (status);

GRANT SELECT, INSERT, UPDATE ON club.ame_removal_request TO ${app_db_user};
