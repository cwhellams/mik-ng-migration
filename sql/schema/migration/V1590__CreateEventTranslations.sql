-- Finnish/Swedish translations for club events. English is always the base
-- member.events.title/description row and is never duplicated into this table.
CREATE TABLE member.event_translations (
    event_id    UUID        NOT NULL REFERENCES member.events(event_id) ON DELETE CASCADE,
    language    VARCHAR(5)  NOT NULL,
    title       TEXT        NOT NULL,
    description TEXT,
    PRIMARY KEY (event_id, language)
);
