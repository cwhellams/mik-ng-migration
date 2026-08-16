import type { Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  FlightLogUpsertSchema,
  type FlightLogUpsertRequest,
  flightLogDateValidator,
} from '@mik/contracts/flight-log'
import { MemberListResponse } from '@mik/contracts/members'

// Shared resolver for both the classic flight log form and the mobile wizard: wraps
// zodResolver and adds FI/FE member-role validation plus the "oil/fuel uplift
// required" checks. Field-level validate rules are ignored by RHF when a resolver is
// present, so these role/uplift checks must be enforced here to block invalid
// submissions.
// Note: if memberList is still loading, role checks are skipped — but the member
// picker itself also shows no qualified members until loaded, so an unqualified
// selection cannot be made before the list arrives.
export const buildFlightLogResolver = (
  t: (key: string) => string,
  memberList: MemberListResponse | undefined,
  // Fuel/oil uplift is only required when creating a brand new entry - not merely
  // whenever an existing entry happens to still be editable (status NEW). Older
  // entries can legitimately have a null uplift recorded from before this field
  // existed, and requiring it on every editable entry would block fixing an unrelated
  // field on them until the user fabricates a value for a flight that already happened.
  isNew: boolean,
): Resolver<FlightLogUpsertRequest> => {
  const baseResolver: Resolver<FlightLogUpsertRequest> = zodResolver(
    flightLogDateValidator(FlightLogUpsertSchema.strip()) as any,
    {},
  ) as Resolver<FlightLogUpsertRequest>

  return async (values, context, options) => {
    const result = await baseResolver(values, context, options)

    const crewSlots = [
      {
        memberId: values.picMemberId,
        role: values.picRole,
        field: 'picMemberId',
      },
      {
        memberId: values.crew2MemberId,
        role: values.crew2Role,
        field: 'crew2MemberId',
      },
      {
        memberId: values.crew3MemberId,
        role: values.crew3Role,
        field: 'crew3MemberId',
      },
      {
        memberId: values.crew4MemberId,
        role: values.crew4Role,
        field: 'crew4MemberId',
      },
    ]

    const additionalErrors: Record<string, { type: string; message: string }> = {}

    // Role checks need the member list to check against. While it is still
    // loading they are skipped rather than failed — failing would report "member
    // is not an instructor" about a member whose qualifications have not been
    // loaded yet. That is safe for the reason given above the function: the crew
    // pickers offer nobody until the list arrives, so an unqualified selection
    // cannot have been made in the first place.
    const members = memberList?.members
    if (members) {
      for (const { memberId, role, field } of crewSlots) {
        if (!memberId || (role !== 'FI' && role !== 'FE')) continue
        const roleErrorMessage =
          role === 'FI'
            ? t('flightLog.error.memberNotInstructor')
            : t('flightLog.error.memberNotExaminer')

        // A selected member absent from the loaded list still fails: there is no
        // record to read a qualification off, and one was expected.
        const member = members.find((m) => m.memberId === memberId)
        if (!member) {
          additionalErrors[field] = {
            type: 'custom',
            message: roleErrorMessage,
          }
          continue
        }

        if (role === 'FI' && !member.roles.includes('INSTRUCTOR')) {
          additionalErrors[field] = {
            type: 'custom',
            message: roleErrorMessage,
          }
        } else if (role === 'FE' && !member.roles.includes('EXAMINER')) {
          additionalErrors[field] = {
            type: 'custom',
            message: roleErrorMessage,
          }
        }
      }
    }

    if (isNew && (values.oilUpliftLitres === null || values.oilUpliftLitres === undefined)) {
      additionalErrors['oilUpliftLitres'] = {
        type: 'custom',
        message: t('flightLog.error.oilUpliftRequired'),
      }
    }

    if (isNew && (values.fuelUpliftLitres === null || values.fuelUpliftLitres === undefined)) {
      additionalErrors['fuelUpliftLitres'] = {
        type: 'custom',
        message: t('flightLog.error.fuelUpliftRequired'),
      }
    }

    if (Object.keys(additionalErrors).length === 0) {
      return result
    }

    return {
      values: {},
      errors: { ...result.errors, ...additionalErrors },
    }
  }
}
