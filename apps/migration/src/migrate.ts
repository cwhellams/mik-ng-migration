import { conn } from './services/db.ts'
import { login } from './services/api.ts'
import { migrateBooks } from './books.ts'
import { migratePlanes } from './planes.ts'
import { migrateFlights } from './flights.ts'
import { migrateMembers } from './members.ts'
import { verifyFlights } from './verify.ts'
import { migrateBookings } from './bookings.ts'

const main = async () => {
  try {
    if (process.argv.length < 3) {
      console.error(`Usage: 
        
        1. login with login token (from login email)
        pnpm dev login <token>
        
        2. migrate planes
        pnpm dev planes

        3. migrate books
        pnpm dev books

        3. migrate flights from given date and count
        pnpm dev flights <2000-01-01> <count>

        4. verify migrated flights and mark as billed
        pnpm dev verify <count>

        5. migrate bookings
        pnpm dev bookings <2000-01-01> <count>
        `)
      return
    }
    const op = process.argv[2]
    if (op == 'login') {
      await login(process.argv[3])
    }

    const all = op == 'all'

    if (op == 'planes' || all) {
      await migratePlanes()
    }
    if (op == 'books' || all) {
      await migrateBooks()
    }

    if (op == 'members' || all) {
      await migrateMembers(
        process.argv[3] || '0',
        parseInt(process.argv[4]) || 10000
      )
    }

    if (op == 'flights') {
      await migrateFlights(
        process.argv[3] || '2000-01-01',
        parseInt(process.argv[4]) || 100000
      )
    }

    if (op == 'verify') {
      await verifyFlights(parseInt(process.argv[3]) || 100000)
    }

    if (op == 'bookings') {
      await migrateBookings(
        process.argv[3] || '2000-01-01',
        parseInt(process.argv[4]) || 100000
      )
    }
  } finally {
    conn?.end()
  }
}

main()
