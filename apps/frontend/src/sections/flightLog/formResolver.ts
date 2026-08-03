import type { Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  FlightLogUpsertSchema,
  type FlightLogUpsertRequest,
  flightLogDateValidator,
} from '@backend/routes/flight-log/models'
import { MemberListResponse } from '@backend/routes/members/models'

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
  isEditable: boolean,
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
    for (const { memberId, role, field } of crewSlots) {
      if (!memberId || (role !== 'FI' && role !== 'FE')) continue
      const roleErrorMessage =
        role === 'FI'
          ? t('flightLog.error.memberNotInstructor')
          : t('flightLog.error.memberNotExaminer')

      if (!memberList?.members) {
        additionalErrors[field] = {
          type: 'custom',
          message: roleErrorMessage,
        }
        continue
      }

      const member = memberList.members.find((m) => m.memberId === memberId)
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

    if (isEditable && (values.oilUpliftLitres === null || values.oilUpliftLitres === undefined)) {
      additionalErrors['oilUpliftLitres'] = {
        type: 'custom',
        message: t('flightLog.error.oilUpliftRequired'),
      }
    }

    if (isEditable && (values.fuelUpliftLitres === null || values.fuelUpliftLitres === undefined)) {
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
