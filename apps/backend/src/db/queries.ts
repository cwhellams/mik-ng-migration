import type { Selectable } from 'kysely'

import { db } from './connection.ts'
import type { MemberRegister } from './schema.js'
import type { RegisterRequest } from '../routes/auth/schema.ts'
import type { JWTPayload } from '../routes/auth/user.ts'
import { MIKRoles, MIKMemberTypes } from '../routes/members/models.ts'
import type {
  Member,
  MemberList,
  FlightLog,
  FlightLogFilters,
  FlightLogInsertRequest,
} from '../routes/members/models.ts'

export async function getMemberById(memberId: number): Promise<Member | undefined> {
  const member = await db
    .selectFrom('member.register')
    .selectAll()
    .where('member_id', '=', memberId)
    .executeTakeFirst()
  if (member !== undefined) {
    return toMember(member)
  }
}

// Get member using email
export async function getMemberByEmail(email: string): Promise<Member | undefined> {
  const member = await db
    .selectFrom('member.register')
    .selectAll()
    .where('email', '=', email)
    .executeTakeFirst()
  if (member !== undefined) {
    return toMember(member)
  }
}

async function toMember(member: Selectable<MemberRegister>): Promise<Member> {
  const roles = await getMemberRoles(member.member_id)
  return {
    memberId: member.member_id,
    memberType: member.member_type_id as MIKMemberTypes,
    email: member.email,
    firstName: member.first_name,
    lastName: member.last_name,

    phoneNumber: member.phone_number,
    postcode: member.postcode,
    streetAddress: member.street_address,
    townCity: member.town_city,

    iceContactName: member.ice_contact_name,
    iceContactPhoneNumber: member.ice_contact_phone_number,

    isTrainingProgramPilot: member.is_training_program_pilot,
    canMakeReservations: member.can_make_reservations,
    billingId: member.billing_id,
    dateOfBirth: member.date_of_birth ? (member.date_of_birth as unknown as string) : undefined,
    memberSince: member.member_since as unknown as string,

    createdAt: member.created_at.toUTCString(),
    createdBy: member.created_by,
    updatedAt: member.updated_at.toUTCString(),
    updatedBy: member.updated_by,
    emailVerifiedAt: member.email_verified_at?.toUTCString(),

    roles,
  }
}

export async function getMemberRoles(memberId: number): Promise<MIKRoles[]> {
  const roles = await db
    .selectFrom('member.member_to_roles')
    .select('role_id')
    .where('member_id', '=', memberId)
    .execute()

  return roles.map(role => MIKRoles[role.role_id as keyof typeof MIKRoles])
}

export async function getMembers(): Promise<MemberList[]> {
  const list = await db
    .selectFrom('member.register')
    .select(['member_id', 'email', 'first_name', 'last_name', 'phone_number'])
    .execute()

  return list.map(member => ({
    memberId: member.member_id,
    name: `${member.first_name} ${member.last_name}`,
    phoneNumber: member.phone_number,
  }))
}

export async function addMember(member: RegisterRequest, jwt?: JWTPayload): Promise<number> {
  const now = new Date()
  const userId = jwt?.memberId.toString() ?? 'self'
  const result = await db
    .insertInto('member.register')
    .values({
      member_type_id: member.memberType,
      email: member.email,
      first_name: member.firstName,
      last_name: member.lastName,

      phone_number: member.phoneNumber,
      street_address: member.streetAddress,
      postcode: member.postcode,
      town_city: member.townCity,

      billing_id: member.lastName.toUpperCase(),
      date_of_birth: member.dateOfBirth ? new Date(member.dateOfBirth) : undefined,
      member_since: now,

      created_at: now,
      created_by: userId,
      updated_at: now,
      updated_by: userId,
      email_verified_at: undefined,
    })
    .returning('member_id')
    .executeTakeFirst()
  if (!result?.member_id) {
    throw new Error('Member insert failed')
  }

  return result.member_id
}

export async function updateMember(
  memberId: number,
  patch: Partial<Member>,
  jwt: JWTPayload,
): Promise<void> {
  const now = new Date()

  const result = await db
    .updateTable('member.register')
    .set({
      member_type_id: patch.memberType?.toString(),
      email: patch.email,
      first_name: patch.firstName,
      last_name: patch.lastName,

      phone_number: patch.phoneNumber,
      street_address: patch.streetAddress,
      postcode: patch.postcode,
      town_city: patch.townCity,

      ice_contact_name: patch.iceContactName,
      ice_contact_phone_number: patch.iceContactPhoneNumber,

      is_training_program_pilot: patch.isTrainingProgramPilot,
      can_make_reservations: patch.canMakeReservations,
      billing_id: patch.billingId,
      date_of_birth: patch.dateOfBirth,
      member_since: patch.memberSince,

      updated_at: now,
      updated_by: jwt.memberId.toString(),
      email_verified_at: patch.emailVerifiedAt,
    })
    .where('member_id', '=', memberId)
    .executeTakeFirstOrThrow()
  if (!result.numUpdatedRows) {
    throw new Error('Member update failed')
  }
}

// Get all flight logs with optional filters
export async function getAllFlightLogs(filters: FlightLogFilters): Promise<FlightLog[]> {
  let query = db
    .selectFrom('flight.logs')
    .select([
      'flight_id',
      'billable_member_id',
      'captain',
      'copilot',
      'aircraft_registration',
      'flight_date',
      'on_block_time_utc',
      'off_block_time_utc',
      'takeoff_time_utc',
      'landing_time_utc',
      'oil_uplift_litres',
      'fuel_uplift_litres',
      'persons_on_board',
      'number_of_landings',
      'night_hours',
      'instrument_hours',
      'departure_airport',
      'arrival_airport',
      'invoice_number',
      'is_billed',
      'flight_type',
      'billing_remarks',
      'remarks',
      'created_at',
      'updated_at',
      'created_by',
      'updated_by',
    ])

  // Apply filters dynamically
  if (filters.flight_id) {
    query = query.where('flight_id', '=', filters.flight_id)
  }

  if (filters.member_id) {
    query = query.where('billable_member_id', '=', filters.member_id)
  }

  if (filters.captain) {
    query = query.where('captain', '=', filters.captain)
  }
  if (filters.copilot) {
    query = query.where('copilot', '=', filters.copilot)
  }
  if (filters.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  if (filters.startDate && filters.endDate) {
    query = query
      .where('flight_date', '>=', filters.startDate)
      .where('flight_date', '<=', filters.endDate)
  } else if (filters.startDate) {
    query = query.where('flight_date', '>=', filters.startDate)
  } else if (filters.endDate) {
    query = query.where('flight_date', '<=', filters.endDate)
  }

  var retval = await query.execute()

  return retval.map(log => ({
    ...log,
    flight_date: log.flight_date.toString(),
    created_at: new Date(log.created_at).toISOString(),
    updated_at: new Date(log.updated_at).toISOString(),
  }))
}

export async function insertFlightLog(data: FlightLogInsertRequest): Promise<number> {
  const retval = await db
    .insertInto('flight.logs')
    .values(data)
    .returning('flight_id')
    .executeTakeFirstOrThrow()

  return retval.flight_id
}

export async function deleteFlightLog(flight_id: number, member_id: number): Promise<bigint> {
  const retval = await db
    .deleteFrom('flight.logs')
    .where('flight.logs.flight_id', '=', flight_id)
    .where('flight.logs.billable_member_id', '=', member_id)
    .where('flight.logs.is_billed', '=', false)
    .execute()

  return retval[0].numDeletedRows
}
