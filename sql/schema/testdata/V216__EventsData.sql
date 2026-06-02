-- ============================================================
-- Events test data
-- ============================================================
-- Provides a realistic set of club events for development and testing.
-- All timestamps are relative to current_date so the data stays
-- relevant regardless of when the tests are run.
--
-- Public / private mix:
--   is_public = TRUE  → visible on the public MIK.fi endpoint
--   is_public = FALSE → visible only to authenticated club members
--
-- Timeline overview (relative to today):
--   -30 d  Past event (public)   – Annual General Meeting (passed)
--   -10 d  Past event (private)  – Board meeting (passed)
--    -3 d  Past event (public)   – Club barbecue (passed, just ended)
--    +3 d  Upcoming (public)     – Navigation training evening
--    +7 d  Upcoming (private)    – Maintenance work party
--   +14 d  Upcoming (public)     – Formation flying weekend (day 1)
--   +15 d  Upcoming (public)     – Formation flying weekend (day 2)
--   +30 d  Upcoming (public)     – Spring fly-in at EFNU
--   +45 d  Upcoming (private)    – Board meeting (next quarter)
--   +60 d  Upcoming (public)     – Summer camp (public, multi-day)
-- ============================================================

INSERT INTO member.events (
    title,
    description,
    location,
    start_time,
    end_time,
    is_public,
    created_by,
    updated_by
)
VALUES
    -- ── Past events ──────────────────────────────────────────────────────────

    (
        'Annual General Meeting 2025',
        'The annual general meeting of Malmin Ilmailukerho. All members are welcome. Agenda includes election of board members and review of annual financials.',
        'Malmi Airport, Clubhouse',
        (current_date - INTERVAL '30 days') + TIME '18:00:00',
        (current_date - INTERVAL '30 days') + TIME '21:00:00',
        TRUE,   -- public
        'Liisa1',
        'Liisa1'
    ),

    (
        'Board Meeting – April',
        'Monthly board meeting. Discussion of membership applications and upcoming events budget.',
        'Malmi Airport, Board Room',
        (current_date - INTERVAL '10 days') + TIME '17:30:00',
        (current_date - INTERVAL '10 days') + TIME '19:30:00',
        FALSE,  -- members only
        'Liisa1',
        'Liisa1'
    ),

    (
        'Club Barbecue',
        'End-of-season club barbecue at the airfield. Bring your family and friends! Food and drinks provided. Great opportunity to meet fellow members.',
        'Malmi Airport, Apron Area',
        (current_date - INTERVAL '3 days') + TIME '14:00:00',
        (current_date - INTERVAL '3 days') + TIME '20:00:00',
        TRUE,   -- public
        'Liisa1',
        'Liisa1'
    ),

    -- ── Near-future events ───────────────────────────────────────────────────

    (
        'Navigation Training Evening',
        'Classroom session covering VFR navigation techniques, airspace structure around Helsinki and practical chart reading. Suitable for student pilots and anyone who wants to refresh their skills.',
        'Malmi Airport, Briefing Room',
        (current_date + INTERVAL '3 days') + TIME '18:00:00',
        (current_date + INTERVAL '3 days') + TIME '20:30:00',
        TRUE,   -- public
        'Liisa1',
        'Liisa1'
    ),

    (
        'Maintenance Work Party',
        'Club members gather to assist with scheduled maintenance on club aircraft. Bring overalls and gloves. Coffee and snacks provided.',
        'Malmi Airport, Hangar 5',
        (current_date + INTERVAL '7 days') + TIME '09:00:00',
        (current_date + INTERVAL '7 days') + TIME '15:00:00',
        FALSE,  -- members only
        'Kaisa1',
        'Kaisa1'
    ),

    -- ── Medium-future events ─────────────────────────────────────────────────

    (
        'Formation Flying Weekend – Day 1',
        'Two-day formation flying training event. Day 1: ground school and briefings, afternoon practice flights. Pre-registration required.',
        'Malmi Airport (EFHF)',
        (current_date + INTERVAL '14 days') + TIME '09:00:00',
        (current_date + INTERVAL '14 days') + TIME '18:00:00',
        TRUE,   -- public
        'Liisa1',
        'Liisa1'
    ),

    (
        'Formation Flying Weekend – Day 2',
        'Two-day formation flying training event. Day 2: morning debrief from Day 1, full formation flights, closing ceremony.',
        'Malmi Airport (EFHF)',
        (current_date + INTERVAL '15 days') + TIME '09:00:00',
        (current_date + INTERVAL '15 days') + TIME '17:00:00',
        TRUE,   -- public
        'Liisa1',
        'Liisa1'
    ),

    (
        'Spring Fly-In at EFNU',
        'Annual spring fly-in at Nummela airfield. Fly in, enjoy lunch together and meet pilots from other clubs. All aircraft types welcome.',
        'Nummela Airfield (EFNU)',
        (current_date + INTERVAL '30 days') + TIME '10:00:00',
        (current_date + INTERVAL '30 days') + TIME '16:00:00',
        TRUE,   -- public
        'Liisa1',
        'Liisa1'
    ),

    -- ── Far-future events ────────────────────────────────────────────────────

    (
        'Board Meeting – Next Quarter',
        'Quarterly board meeting. Review of H1 financials and planning for summer activities.',
        'Malmi Airport, Board Room',
        (current_date + INTERVAL '45 days') + TIME '17:30:00',
        (current_date + INTERVAL '45 days') + TIME '19:30:00',
        FALSE,  -- members only
        'Liisa1',
        'Liisa1'
    ),

    (
        'MIK Summer Camp 2025',
        'Three-day summer camp at Räyskälä (EFRY). Flying activities during the day, social programme in the evenings. Camping facilities available on site. Registration opens 4 weeks before the event.',
        'Räyskälä Airfield (EFRY)',
        (current_date + INTERVAL '60 days') + TIME '12:00:00',
        (current_date + INTERVAL '62 days') + TIME '16:00:00',
        TRUE,   -- public
        'Liisa1',
        'Liisa1'
    );
