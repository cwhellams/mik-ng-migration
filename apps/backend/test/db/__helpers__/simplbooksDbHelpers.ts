import { db } from '../../../src/db/connection.ts'

export const deleteSimplbooksOutbox = () => db.deleteFrom('accts.outbox_simplbooks').execute()

export const expectAddMember1Row = async () => {
  const result = await db.selectFrom('accts.outbox_simplbooks').selectAll().execute()

  expect(result.length).toEqual(1)
  expect(result[0].event_type).toEqual('addMember')
}
