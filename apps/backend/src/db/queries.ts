import { MemberRegister } from './schema'
import { db } from './connection'
import { Selectable } from 'kysely'
import { MemberList } from '../routes/members/models'
import { MIKRoles } from '../routes/auth/tokens'

// Get member using email
export async function getMember(
  email: string
): Promise<Selectable<MemberRegister> | undefined> {
  return await db
    .selectFrom('member.register')
    .selectAll()
    .where('email', '=', email)
    .executeTakeFirst()
}

export async function getMemberRoles(memberId: number): Promise<MIKRoles[]> {
  const roles = await db
    .selectFrom('member.member_to_roles')
    .selectAll()
    .where('member_id', '=', memberId)
    .execute()

  return roles.map((role) => MIKRoles[role.role_id as keyof typeof MIKRoles])
}

export async function getMembers(): Promise<MemberList[]> {
  const list = await db
    .selectFrom('member.register')
    .select(['member_id', 'email', 'first_name', 'last_name', 'phone_number'])
    .execute()

  return list.map((member) => ({
    memberId: member.member_id,
    name: `${member.first_name} ${member.last_name}`,
    phoneNumber: member.phone_number,
  }))
}
