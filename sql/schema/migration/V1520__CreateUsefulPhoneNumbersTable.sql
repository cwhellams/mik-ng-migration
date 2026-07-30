-- Admin-managed list of useful phone numbers shown to members, e.g. the flight plan
-- centre number surfaced on the flight log wizard's "close your flight plan" reminder.
-- `label` is both the display text and the lookup key (e.g. an admin managing a
-- generic number types its own label; the flight plan centre row must keep the
-- hardcoded label 'FLIGHT_PLAN_CENTER' so the wizard reminder can find it by key).
CREATE TABLE static.useful_phone_number (
    label         TEXT PRIMARY KEY,
    phone_number  TEXT NOT NULL,
    sort_order    INT  NOT NULL DEFAULT 0
);

INSERT INTO static.useful_phone_number (label, phone_number, sort_order)
VALUES ('FLIGHT_PLAN_CENTER', '029 150 2071', 0);
