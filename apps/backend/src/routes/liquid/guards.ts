import { HttpStatusCode } from 'axios'

import { problem } from '../response.ts'
import type { JWTUser } from '../auth/token.ts'
import { MIKPermissions } from '@mik/contracts/members'
import {
  computeLiquidRecordLock,
  isHomeBase,
  LIQUID_LINK_WINDOW_HOURS,
  LiquidLockReason,
  LiquidType,
  requiresTotalCost,
  type LiquidRecord,
} from '@mik/contracts/liquid'
import { getAircraftFuelTypes, getFuelProviders } from '../../db/liquid-queries.ts'

/**
 * The rule checks every mutating liquid route runs, in one place.
 *
 * They live here rather than in `@mik/contracts/liquid` because each one ends in
 * a `problem()` — a server reaction, not a shared decision. The decisions
 * themselves (`computeLiquidRecordLock`, `requiresTotalCost`) are imported from
 * contracts, so the UI disables the same buttons these reject.
 */

export const isLiquidAdmin = (user: JWTUser): boolean =>
  user.permissions.includes(MIKPermissions.LIQUID_ADMIN)

/** Human-readable "why not", so a 403 says something the member can act on. */
const LOCK_DETAIL: Record<LiquidLockReason, string> = {
  [LiquidLockReason.LINKED_TO_EXPENSE_CLAIM]:
    'This record is attached to an expense claim and can no longer be changed by anyone.',
  [LiquidLockReason.LINKED_TO_VALIDATED_FLIGHT_LOG]:
    'The flight log this record is attached to has been validated. Ask a liquid administrator to change it.',
  [LiquidLockReason.EDIT_WINDOW_EXPIRED]:
    'This record is more than a week old. Ask a liquid administrator to change it.',
  [LiquidLockReason.NOT_OWNER]: 'This record belongs to another member.',
  [LiquidLockReason.DELETED]: 'This record has been deleted.',
}

/**
 * Throws unless the actor may change the record.
 *
 * A member who is not the owner gets a 404 rather than a 403: telling them a
 * record exists — and by extension that a colleague fuelled a particular
 * aircraft — is more than they are entitled to know from an id they guessed.
 */
export const assertRecordMutable = (record: LiquidRecord, user: JWTUser): void => {
  const lock = computeLiquidRecordLock(
    {
      memberId: record.memberId,
      expenseClaimId: record.expenseClaimId,
      flightLogStatus: record.flightLogStatus,
      createdAt: record.createdAt,
      deletedAt: record.deletedAt,
    },
    { memberId: user.memberId!, isLiquidAdmin: isLiquidAdmin(user) },
  )

  if (lock.canEdit) return

  if (lock.reason === LiquidLockReason.NOT_OWNER) {
    return problem({ status: HttpStatusCode.NotFound, detail: 'Liquid record not found.' })
  }

  return problem({
    status: HttpStatusCode.Conflict,
    title: 'Record locked',
    detail: LOCK_DETAIL[lock.reason!],
    extensions: { lockReason: lock.reason },
  })
}

/**
 * Throws unless the actor may attach this record to a flight.
 *
 * Deliberately narrower than `assertRecordMutable`: linking doesn't change the
 * record's own data, so record *ownership* isn't the boundary that matters —
 * "can this caller attach a cost item to this flight" is, and
 * `assertFlightLogLinkable` (run right after, by the caller) is what enforces
 * that. "Fuel now, fly later, maybe a different person" is the normal flow, so
 * someone else's record is linkable same as the member's own — but only
 * within `LIQUID_LINK_WINDOW_HOURS` of being reported, so this cannot become
 * "attach any unlinked fuelling anyone in the club ever reported."
 */
export const assertRecordLinkable = (record: LiquidRecord, user: JWTUser): void => {
  if (record.deletedAt) {
    return problem({ status: HttpStatusCode.NotFound, detail: 'Liquid record not found.' })
  }

  if (record.expenseClaimId) {
    return problem({
      status: HttpStatusCode.Conflict,
      title: 'Record locked',
      detail: LOCK_DETAIL[LiquidLockReason.LINKED_TO_EXPENSE_CLAIM],
      extensions: { lockReason: LiquidLockReason.LINKED_TO_EXPENSE_CLAIM },
    })
  }

  if (isLiquidAdmin(user) || record.memberId === user.memberId) return

  const ageMs = Date.now() - new Date(record.recordedAt).getTime()
  if (ageMs > LIQUID_LINK_WINDOW_HOURS * 60 * 60 * 1000) {
    return problem({
      status: HttpStatusCode.Conflict,
      title: 'Record locked',
      detail: `This record belongs to another member and is more than ${LIQUID_LINK_WINDOW_HOURS} hours old. Ask a liquid administrator to link it.`,
    })
  }
}

/** A member reads only their own records; a liquid admin reads everyone's. */
export const assertRecordVisible = (record: LiquidRecord, user: JWTUser): void => {
  if (isLiquidAdmin(user) || record.memberId === user.memberId) return
  return problem({ status: HttpStatusCode.NotFound, detail: 'Liquid record not found.' })
}

/**
 * "Fuel type is constrained by aircraft."
 *
 * Validated against `flight.aircraft.fuel_types` rather than a constant, so
 * OH-STL taking only Jet A-1 and OH-IHQ taking MOGAS/100LL is a fact about the
 * fleet the admin can change, not a literal in two codebases.
 */
export const assertFuelTypeAllowed = async (
  aircraftRegistration: string,
  fuelType: string,
): Promise<void> => {
  const allowed = await getAircraftFuelTypes(aircraftRegistration)
  if (!allowed) {
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: `Unknown aircraft ${aircraftRegistration}.`,
    })
  }
  if (!allowed.includes(fuelType)) {
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: `${aircraftRegistration} does not take ${fuelType}. Allowed: ${allowed.join(', ')}.`,
    })
  }
}

/**
 * Resolves the provider for a fuel record, and checks the member is allowed to
 * name the one they named.
 *
 * At EFNU the member never picks: the fuel type determines the seller, and
 * sending one anyway would let a member attribute a home-base fuelling to AirBP.
 * Away from home they must pick one that actually travels.
 */
export const resolveProviderId = async (
  airport: string,
  fuelType: string,
  requested: number | undefined,
): Promise<number> => {
  const providers = await getFuelProviders()

  if (isHomeBase(airport)) {
    const home = providers.find((p) => p.isHomeBase && (p.fuelTypes ?? []).includes(fuelType))
    if (!home) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: `No provider sells ${fuelType} at ${airport}.`,
      })
    }
    if (requested !== undefined && requested !== home.providerId) {
      return problem({
        status: HttpStatusCode.BadRequest,
        detail: `${fuelType} at ${airport} is always supplied by ${home.name}.`,
      })
    }
    return home.providerId
  }

  if (requested === undefined) {
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: 'A fuel provider is required away from the home base.',
    })
  }
  const provider = providers.find((p) => p.providerId === requested)
  if (!provider || provider.isHomeBase) {
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: 'That fuel provider is not available at this airport.',
    })
  }
  // A null fuelTypes list means the provider sells whatever it's asked for (e.g.
  // AirBP, seeded with no list); a non-null one is a real restriction, same as
  // the home-base branch above.
  if (provider.fuelTypes != null && !provider.fuelTypes.includes(fuelType)) {
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: `${provider.name} does not sell ${fuelType}.`,
    })
  }
  return provider.providerId
}

/**
 * The away-from-home cost rule, re-checked after an edit.
 *
 * `CreateLiquidRecordSchema` covers the create path, but a PATCH that only moves
 * the airport from EFNU to ESGG would otherwise leave a costless record where
 * one is required — the database CHECK would then surface it as a 500.
 */
export const assertCostPresentIfRequired = (
  liquidType: LiquidType,
  airport: string | null,
  totalCost: number | null,
): void => {
  if (requiresTotalCost(liquidType, airport) && totalCost == null) {
    return problem({
      status: HttpStatusCode.BadRequest,
      detail: 'Total cost is required when fuelling away from the home base.',
    })
  }
}
