import { db } from './connection.ts'
import { sql } from 'kysely'
import type {
  InstructorWorktimeEntry,
  InstructorWorktimeFilters,
} from '../routes/instructor-worktime/models.ts'

/**
 * Query flight logs to calculate instructor work time.
 *
 * An instructor flight is one where any crew slot (pic, crew2, crew3, crew4) has
 * the role 'FI' (Flight Instructor). The instructor member is the one in that slot.
 *
 * Work time per flight = 60 min (before) + selected time (block or air) + 30 min (after)
 *
 * Results are grouped by instructor and date.
 */
export async function getInstructorWorktime(
  filters: InstructorWorktimeFilters,
): Promise<InstructorWorktimeEntry[]> {
  const timeColumn = filters.timeType === 'air' ? sql.ref('flight_mins') : sql.ref('block_mins')

  const result = await sql<{
    instructor_member_id: string
    instructor_name: string
    date: string
    flight_count: number
    total_time_mins: number
    work_time_mins: number
  }>`
    SELECT
      instructor_flights.instructor_member_id,
      CONCAT(mr.first_name, ' ', mr.last_name) AS instructor_name,
      TO_CHAR(instructor_flights.off_block_time_utc::date, 'YYYY-MM-DD') AS date,
      COUNT(*)::int AS flight_count,
      SUM(instructor_flights.time_mins)::int AS total_time_mins,
      SUM(instructor_flights.time_mins + 90)::int AS work_time_mins
    FROM (
      SELECT pic_member_id AS instructor_member_id, off_block_time_utc, ${timeColumn} AS time_mins
      FROM flight.logs
      WHERE pic_role = 'FI'
        AND off_block_time_utc::date >= ${filters.startDate}::date
        AND off_block_time_utc::date <= ${filters.endDate}::date

      UNION ALL

      SELECT crew2_member_id, off_block_time_utc, ${timeColumn}
      FROM flight.logs
      WHERE crew2_role = 'FI' AND crew2_member_id IS NOT NULL
        AND off_block_time_utc::date >= ${filters.startDate}::date
        AND off_block_time_utc::date <= ${filters.endDate}::date

      UNION ALL

      SELECT crew3_member_id, off_block_time_utc, ${timeColumn}
      FROM flight.logs
      WHERE crew3_role = 'FI' AND crew3_member_id IS NOT NULL
        AND off_block_time_utc::date >= ${filters.startDate}::date
        AND off_block_time_utc::date <= ${filters.endDate}::date

      UNION ALL

      SELECT crew4_member_id, off_block_time_utc, ${timeColumn}
      FROM flight.logs
      WHERE crew4_role = 'FI' AND crew4_member_id IS NOT NULL
        AND off_block_time_utc::date >= ${filters.startDate}::date
        AND off_block_time_utc::date <= ${filters.endDate}::date
    ) AS instructor_flights
    INNER JOIN member.register mr ON mr.member_id = instructor_flights.instructor_member_id
    GROUP BY
      instructor_flights.instructor_member_id,
      mr.first_name,
      mr.last_name,
      instructor_flights.off_block_time_utc::date
    ORDER BY date ASC, instructor_name ASC
  `.execute(db)

  return result.rows.map((row) => ({
    instructorMemberId: row.instructor_member_id,
    instructorName: row.instructor_name,
    date: row.date,
    flightCount: Number(row.flight_count),
    totalTimeMins: Number(row.total_time_mins),
    workTimeMins: Number(row.work_time_mins),
  }))
}
