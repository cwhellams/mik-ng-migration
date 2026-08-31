-- ============================================================
-- V470__MemberSessionsTestData
--
-- Seed sessions for the "Sessions" card on the member profile (issue #1234), so
-- the feature is clickable in a running `pnpm dev` without having to sign in
-- from three different browsers first.
--
-- Real rows are created by signing in, so the ones seeded here belong to no live
-- refresh token: none of them is ever the current session. That is exactly the
-- state the card's interesting controls need -- a row you may terminate, and
-- enough of them for "Log out of all other sessions" to be enabled.
--
-- Covered between them:
--
--   * Matti1 (chris.whellams@gmail.com, the ordinary member) gets three active
--     sessions -- desktop Chrome on Windows, Safari on an iPhone, and Firefox on
--     Linux -- so the device labels, the differing IPs and the bulk action all
--     have something to show. Signing in as Matti adds a fourth, current one.
--   * Matti1 also gets one already-revoked session, which must NOT appear in the
--     list: it is the negative case for the `revoked_at IS NULL` filter.
--   * Liisa1 (juho.kolehmainen@iki.fi, the admin login) gets one active session,
--     so an admin viewing another member's profile sees a populated card there
--     too -- and so cross-member isolation is visible: revoking all of Matti's
--     other sessions must leave this row alone.
--   * One row has a NULL user agent, which is what an API client or a stripped
--     proxy produces. It must render as "Unknown device" rather than blank.
--
-- Timestamps are relative to now() so the "Created"/"Last active" columns stay
-- plausible however long after seeding the app is opened.
-- ============================================================

INSERT INTO member.sessions (member_id, ip_address, user_agent, created_at, last_used_at, revoked_at, revoked_reason)
VALUES
  -- Matti's three active sessions, most recently used first.
  ('Matti1', '192.168.1.24',
   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
   now() - INTERVAL '9 days', now() - INTERVAL '20 minutes', NULL, NULL),

  ('Matti1', '84.250.11.7',
   'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
   now() - INTERVAL '3 days', now() - INTERVAL '5 hours', NULL, NULL),

  -- No user agent: renders as "Unknown device".
  ('Matti1', '10.0.0.51', NULL,
   now() - INTERVAL '31 days', now() - INTERVAL '2 days', NULL, NULL),

  -- Revoked, and so must not be listed at all.
  ('Matti1', '203.0.113.45',
   'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
   now() - INTERVAL '40 days', now() - INTERVAL '38 days', now() - INTERVAL '38 days', 'user_terminated'),

  -- The admin's own session, on a different member.
  ('Liisa1', '172.16.4.9',
   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
   now() - INTERVAL '2 days', now() - INTERVAL '1 hour', NULL, NULL);
