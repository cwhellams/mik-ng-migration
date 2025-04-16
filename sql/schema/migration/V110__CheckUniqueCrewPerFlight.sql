ALTER TABLE flight.logs
ADD CONSTRAINT unique_crew_per_flight CHECK (
    (
        pic_member_id IS DISTINCT FROM crew2_member_id
        AND pic_member_id IS DISTINCT FROM crew3_member_id
        AND pic_member_id IS DISTINCT FROM crew4_member_id
    )
    AND (crew2_member_id IS NULL OR (crew2_member_id IS DISTINCT FROM crew3_member_id AND crew2_member_id IS DISTINCT FROM crew4_member_id))
    AND (crew3_member_id IS NULL OR crew3_member_id IS DISTINCT FROM crew4_member_id)
);
