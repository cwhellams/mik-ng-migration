import { MemberRegister } from 'kysely-codegen'
import { db } from './connection'

// Get member using email
export async function getMember(email: string): Promise<MemberRegister | null> {
  const res = await db
    .selectFrom('member.register')
    .where('email', '=', email)
    .executeTakeFirst()

  return (res as MemberRegister) ?? null
}
