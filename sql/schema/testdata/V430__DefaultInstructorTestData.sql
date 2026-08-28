-- Default instructors, so the pre-fill in #1304 is something a developer can
-- actually click through in `pnpm dev`.
--
-- The column arrived in V1500__AddDefaultInstructorToMemberRegister.sql without any
-- test data, which is why neither the flight log's instructor crew slot nor the new
-- training-booking pre-fill did anything against a freshly baselined database.
--
-- Both branches of the feature are seeded, because only one of them looks like a
-- bug when you meet it unprepared:
--
--   Matti1  -> Jukka1   the happy path. Matti (chris.whellams@gmail.com, the normal
--                       browser login) can make reservations and Jukka holds
--                       INSTRUCTOR, so choosing "Training" fills the Instructor / FE
--                       field in, and logging a school flight fills the crew slot in.
--
--   Anna1   -> Juha1    the stale default. Juha1 is a plain MEMBER, so the picker
--                       cannot offer him and the field is deliberately left empty and
--                       required rather than carrying an id the backend's
--                       validateInstructor would reject with a 400. Anna1 can make
--                       reservations too, so this is reachable from the schedule.
--
-- The third mode — no default instructor at all — is every other member, and is what
-- you get by clearing the field on your own profile.
UPDATE member.register
   SET default_instructor_member_id = 'Jukka1'
 WHERE member_id = 'Matti1';

UPDATE member.register
   SET default_instructor_member_id = 'Juha1'
 WHERE member_id = 'Anna1';
