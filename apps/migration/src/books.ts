import { conn } from './services/db.ts'
import {
  type AircraftJourneyLogBook,
  type AjlbFilter,
  type AjlbListResponse,
} from '../../backend/src/routes/ajlb/model.ts'
import { request } from './services/api.ts'
import { type Upsert } from '../../backend/src/types/schema.ts'
import { toLocal } from '../../backend/src/util/date.ts'
import dayjs from 'dayjs'
import { groupBy } from 'lodash-es'

type Book = {
  registration: string
  kirja_id: number
  kone_id: number
  kirja_nro: number
  avauspv: Date
  avaussivu: number
  rivimaara: number
  alkutunnit: number
  sulkupv: Date | null
}

export const migrateBooks = async () => {
  const books = await conn.query<Book[]>(`SELECT 
      p.nimi as registration, 
      b.* 
      from kirja_kirjat b
      join kirja_koneet p on b.kone_id = p.kone_id
      ORDER BY b.kone_id, b.alkutunnit`)

  const existingBooks = await request<AjlbFilter, AjlbListResponse>(
    'GET',
    `v1/ajlb`
  )

  const booksByPlane = groupBy(books, (b) => b.registration)

  for (const [registration, books] of Object.entries(booksByPlane)) {
    for (const [index, book] of books.entries()) {
      if (existingBooks?.books.some((a) => a.seqNo === book.kirja_id)) {
        continue
      }

      const getEndDate = (): string | null => {
        // current planes have enddate in the future
        const isLastBook = index === books.length - 1
        const isActivePlane = dayjs(book.sulkupv).get('year') >= 2030

        if (isLastBook && isActivePlane) {
          // keep active planes' last book open-ended
          return null
        }

        const existingEndDate = book.sulkupv
          ? toLocal(book.sulkupv.toISOString()).format('YYYY-MM-DD')
          : null

        if (isLastBook) {
          // last book can be left open if no end date
          return existingEndDate
        }

        // enddate is mandatory, if not present, derive from next book's start date
        return (
          existingEndDate ??
          toLocal(books[index + 1].avauspv).format('YYYY-MM-DD')
        )
      }

      const startDate = toLocal(book.avauspv.toISOString()).format('YYYY-MM-DD')
      const endDate = getEndDate()
      if (endDate && startDate > endDate) {
        // skip duplicate books
        return
      }

      // '243310' -> 2433.10h
      const str = book.alkutunnit.toString()
      const startFlightMins =
        Number(str.substring(0, str.length - 2)) * 60 +
        Number(str.substring(str.length - 2))

      const ajlb: Upsert<AircraftJourneyLogBook> = {
        // fix duplicate sequence
        seqNo: book.kirja_id == 24 ? 25 : book.kirja_nro,
        aircraftRegistration: registration,
        startFlightMins,
        noOfPages: 999,
        rowsPerPage: book.rivimaara,
        startPage: Number(book.avaussivu),
        startDate,
        endDate,
      }
      console.log(index, book, ajlb)
      await request('POST', 'v1/ajlb', ajlb)
    }
  }
}
