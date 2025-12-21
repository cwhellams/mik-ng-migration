alter table flight.occurrences
  alter column registration drop not null,
  alter column departure_airport drop not null,
  alter column arrival_airport drop not null,
  add column technical_faults BOOLEAN,
  add column processed_date TIMESTAMPTZ,
  add column comments JSONB NOT NULL DEFAULT '[]'::JSONB,
  add column handling JSONB NOT NULL DEFAULT '{}'::JSONB;
  
ALTER TYPE public.occurrenceStatus
  ADD VALUE 'PROCESSED'
  AFTER 'ANONYMIZED';

CREATE TABLE flight.occurrence_access (
  access_id SERIAL PRIMARY KEY,
  report_id VARCHAR(9) NOT NULL REFERENCES flight.occurrences (report_id),
  member_id VARCHAR(9) REFERENCES member.register (member_id),
  role_id VARCHAR(20) REFERENCES member.roles (role_id),
  author BOOLEAN NOT NULL DEFAULT FALSE,
  write_access BOOLEAN NOT NULL DEFAULT FALSE,
  manage_access BOOLEAN NOT NULL DEFAULT FALSE,

  -- Metadata
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(9) NOT NULL REFERENCES member.register (member_id),

  CONSTRAINT unique_report_role UNIQUE (report_id, role_id),

  -- Ensure unique combinations of report_id with either member_id or role_id
  CONSTRAINT check_member_or_role CHECK (
    (
      member_id IS NOT NULL
      AND role_id IS NULL
    )
    OR (
      member_id IS NULL
      AND role_id IS NOT NULL
    )
  )
);

INSERT INTO member.roles (
        role_id,
        description,
        name_en,
        name_fi,
        name_sv,
        is_public,
        permissions,
        created_by,
        updated_by
    )
VALUES (
        'SMS_PROCESSOR',
        'SMS independent receives new occurrences and anonymizes them',
        'SMS independent reviewer',
        'SMS riippumaton tarkastaja',
        'SMS oberoende granskare',
        FALSE,
        to_jsonb(
            ARRAY [
            'sms.processor'

        ]
        ),
        'k1mnimda',
        'k1mnimda'
    ),
    (
        'SMS_MANAGER',
        'Safety Manager takes care of processing anonymized occurrences',
        'Safety Manager',
        'Turvallisuusvastaava',
        'Säkerhetsansvarig',
        FALSE,
        to_jsonb(
            ARRAY [
            'sms.manager'

        ]
        ),
        'k1mnimda',
        'k1mnimda'
    );