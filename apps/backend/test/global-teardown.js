import { closeDb } from '../src/db/connection.ts'

export default async () => {
  await closeDb()
}
